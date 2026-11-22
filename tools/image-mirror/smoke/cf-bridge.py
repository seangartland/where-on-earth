#!/usr/bin/env python3
"""VM-sandbox credential bridge for R2 smoke-testing and preflight bucket
reads -- NOT the production Pi credential path.

The production pipeline (tools/image-mirror/src/r2-client.js) authenticates
with a plain CLOUDFLARE_API_TOKEN bearer token, which is what the Pi will
carry. This VM clone has no such token in its environment; the only live
Cloudflare credential reachable here is the custom.cloudflare connector's
surrogate-swapped account token (same one scripts/sat/local/upload_r2.py
uses for this bucket). This script is a thin, local-only adapter so the
Node pipeline's smoke test and preflight bucket-usage check can exercise
real R2 calls in this environment without duplicating the credential
plumbing. See R2-BUILD-REPORT.md for why this exists and what it does not
cover (it is not used for, and proves nothing about, Pi-side auth).

Subcommands (each prints one JSON line to stdout):
  bucket-usage [--prefix P]        paginate and sum size over the whole
                                    bucket (or just prefix P), read-only
  put <key> <local-file> <content-type>
  get <key> <output-file>
  delete <key>
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
sys.path.insert(0, os.path.expanduser("~/workspace/custom-connectors/custom.cloudflare/bin"))
from dynamic_credentials import add_surrogate_to_request, read_response_body  # noqa: E402
from cf_api import call, BASE, CONNECTOR, HOSTS, ACCOUNT_ID  # noqa: E402

BUCKET = os.environ.get("IMAGE_MIRROR_R2_BUCKET", "where-on-earth-tiles")


def object_path(key):
    return f"/accounts/{ACCOUNT_ID}/r2/buckets/{BUCKET}/objects/{urllib.parse.quote(key, safe='')}"


def raw_request(method, url, body=None):
    req = urllib.request.Request(url, data=body, method=method)
    add_surrogate_to_request(req, CONNECTOR, allowed_hosts=HOSTS)
    try:
        with urllib.request.build_opener().open(req, timeout=60) as resp:
            return resp.status, dict(resp.headers), read_response_body(resp)
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), read_response_body(e)


def cmd_bucket_usage(args):
    prefix = args.prefix or ""
    cursor = None
    total_bytes = 0
    total_count = 0
    pages = 0
    while True:
        qs = f"prefix={urllib.parse.quote(prefix)}&per_page=1000"
        if cursor:
            qs += f"&cursor={urllib.parse.quote(cursor)}"
        status, payload = call("GET", f"/accounts/{ACCOUNT_ID}/r2/buckets/{BUCKET}/objects?{qs}")
        pages += 1
        if status != 200 or not payload.get("success"):
            print(json.dumps({"ok": False, "status": status, "payload": payload}))
            return 1
        for obj in payload.get("result", []):
            total_count += 1
            total_bytes += int(obj.get("size", 0))
        info = payload.get("result_info", {})
        cursor = info.get("cursor")
        if not info.get("is_truncated"):
            break
    print(json.dumps({"ok": True, "prefix": prefix, "count": total_count, "bytes": total_bytes, "pages": pages}))
    return 0


def cmd_put(args):
    with open(args.local_file, "rb") as fh:
        body = fh.read()
    status, headers, resp_body = raw_request("PUT", f"{BASE}{object_path(args.key)}", body=body)
    try:
        parsed = json.loads(resp_body.decode("utf8"))
    except Exception:
        parsed = {"raw": resp_body[:200].decode("utf8", "replace")}
    print(json.dumps({"ok": status == 200, "status": status, "size": len(body), "response": parsed}))
    return 0 if status == 200 else 1


def cmd_get(args):
    status, headers, body = raw_request("GET", f"{BASE}{object_path(args.key)}")
    if status == 200:
        with open(args.output_file, "wb") as fh:
            fh.write(body)
    print(json.dumps({
        "ok": status == 200,
        "status": status,
        "bytes": len(body) if status == 200 else None,
        "content_type": headers.get("Content-Type"),
        "etag": headers.get("ETag"),
    }))
    return 0 if status == 200 else 1


def cmd_delete(args):
    status, payload = call("DELETE", object_path(args.key))
    print(json.dumps({"ok": status == 200, "status": status, "response": payload}))
    return 0 if status == 200 else 1


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="command", required=True)

    p = sub.add_parser("bucket-usage")
    p.add_argument("--prefix", default="")
    p.set_defaults(func=cmd_bucket_usage)

    p = sub.add_parser("put")
    p.add_argument("key")
    p.add_argument("local_file")
    p.add_argument("content_type")
    p.set_defaults(func=cmd_put)

    p = sub.add_parser("get")
    p.add_argument("key")
    p.add_argument("output_file")
    p.set_defaults(func=cmd_get)

    p = sub.add_parser("delete")
    p.add_argument("key")
    p.set_defaults(func=cmd_delete)

    args = ap.parse_args()
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
