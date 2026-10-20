#!/usr/bin/env python3
"""Upload finished tiles to the R2 bucket under a prefix (Cloudflare REST API).

Rewritten 2026-10-19 (Sean's ruling: no more token errands). The original
version needed an R2 S3 key pair from the environment, which meant Sean
minting a fresh token in the dashboard. This version instead uploads
through the Cloudflare account API token already stored in Muse's Secure
Vault for the custom.cloudflare connector (created 2026-10-13 from the
"Edit Cloudflare Workers" template, which includes R2 storage). No
credentials are read from the environment, arguments, or files; the
connector helper attaches a surrogate that the runtime swaps for the real
token only on requests to api.cloudflare.com. Verified live 2026-10-19:
bucket list, probe object PUT and DELETE all returned 200.

Usage:
  upload_r2.py --root scripts/sat/work/s2gm2025/finished/full \
               --prefix s2gm2025 [--dry-run] [--workers 8]

Key layout mirrors the local tree: base-ours.jpg at the root becomes
<prefix>/base-ours.jpg and z/x/y.jpg becomes <prefix>/z/x/y.jpg, which is
what the game's provider record will point at on tiles.where-on.earth.

Resumable: a progress file (default <root>/.r2-upload-progress.json)
records each uploaded key with its byte size. A rerun skips keys whose
recorded size matches the local file, and re-uploads anything whose size
changed, so a killed upload restarts where it stopped. The progress file
is written atomically after each batch.

Cache note: the REST PUT sets Content-Type image/jpeg. Cache lifetime is
governed by the tiles.where-on.earth custom domain rules, and the
provider URL carries a ?v= version query, so a corrected re-upload busts
caches by bumping that version, same as the existing EOX tiles (?v=3).
"""

import argparse
import json
import os
import sys
import threading
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.expanduser("~/workspace/custom-connectors/custom.cloudflare/bin"))
from cf_api import call as cf_call  # noqa: E402

ACCOUNT_ID = "3175d54f309e86780e7ac66426d099c4"
CONTENT_TYPE = "image/jpeg"


def plan_uploads(root, prefix):
    """Return a sorted list of (local_path, key, size) for the tree."""
    plan = []
    base = os.path.join(root, "base-ours.jpg")
    if os.path.isfile(base):
        plan.append((base, f"{prefix}/base-ours.jpg", os.path.getsize(base)))
    for z in sorted(os.listdir(root)):
        zdir = os.path.join(root, z)
        if not (z.isdigit() and os.path.isdir(zdir)):
            continue
        for dirpath, _dirs, files in os.walk(zdir):
            for name in files:
                if not name.endswith(".jpg"):
                    continue
                local = os.path.join(dirpath, name)
                rel = os.path.relpath(local, root).replace(os.sep, "/")
                plan.append((local, f"{prefix}/{rel}", os.path.getsize(local)))
    plan.sort(key=lambda item: item[1])
    return plan


def load_progress(path):
    if os.path.isfile(path):
        with open(path, encoding="utf8") as fh:
            return json.load(fh)
    return {}


def save_progress(path, progress):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf8") as fh:
        json.dump(progress, fh, indent=1, sort_keys=True)
    os.replace(tmp, path)


def object_path(bucket, key):
    enc = urllib.parse.quote(key, safe="")
    return f"/accounts/{ACCOUNT_ID}/r2/buckets/{bucket}/objects/{enc}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--prefix", required=True)
    ap.add_argument("--bucket", default="where-on-earth-tiles")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--progress", default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    plan = plan_uploads(args.root, args.prefix)
    total_bytes = sum(size for _p, _k, size in plan)
    per_z = {}
    for _p, key, _s in plan:
        parts = key.split("/")
        per_z[parts[1]] = per_z.get(parts[1], 0) + 1
    print(f"planned: {len(plan)} objects, {total_bytes / 1e6:.1f} MB, by level: "
          + ", ".join(f"{k}={v}" for k, v in sorted(per_z.items())))
    if plan:
        print(f"first key: {plan[0][1]}")
        print(f"last key:  {plan[-1][1]}")
    if args.dry_run:
        print("dry run: nothing uploaded")
        return

    status, _ = cf_call("GET", f"/accounts/{ACCOUNT_ID}/r2/buckets/{args.bucket}")
    if status != 200:
        sys.exit(f"cannot read bucket {args.bucket} via the stored Cloudflare token (HTTP {status})")

    progress_path = args.progress or os.path.join(args.root, ".r2-upload-progress.json")
    progress = load_progress(progress_path)
    todo = [(p, k, s) for p, k, s in plan if progress.get(k) != s]
    print(f"already uploaded (size match): {len(plan) - len(todo)}; to upload: {len(todo)}")
    if not todo:
        print("nothing to do")
        return

    lock = threading.Lock()
    done = {"n": 0, "bytes": 0, "failed": []}

    def upload(item):
        local, key, size = item
        try:
            with open(local, "rb") as fh:
                body = fh.read()
            status, payload = cf_call("PUT", object_path(args.bucket, key),
                                      body=body, content_type=CONTENT_TYPE)
            if status != 200:
                raise RuntimeError(f"HTTP {status}: {str(payload)[:160]}")
        except Exception as exc:  # keep the batch going; report at the end
            with lock:
                done["failed"].append((key, str(exc)[:200]))
            return
        with lock:
            progress[key] = size
            done["n"] += 1
            done["bytes"] += size
            if done["n"] % 200 == 0:
                save_progress(progress_path, progress)
                print(f"  {done['n']}/{len(todo)} uploaded", flush=True)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        list(pool.map(upload, todo))
    save_progress(progress_path, progress)
    print(f"uploaded {done['n']} objects, {done['bytes'] / 1e6:.1f} MB")
    if done["failed"]:
        print(f"FAILED: {len(done['failed'])} objects")
        for key, err in done["failed"][:10]:
            print(f"  {key}: {err}")
        sys.exit(1)
    print("upload complete; rerun is a no-op while sizes are unchanged")


if __name__ == "__main__":
    main()
