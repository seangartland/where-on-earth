#!/usr/bin/env python3
"""Build and manage only the woe-account Worker and woe-accounts D1 database."""
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response

ROOT = pathlib.Path(__file__).resolve().parent
ACCOUNT_ID = "3175d54f309e86780e7ac66426d099c4"
BASE = "https://api.cloudflare.com/client/v4"
CONNECTOR = "custom.cloudflare"
HOSTS = ["api.cloudflare.com"]
WORKER = "woe-account"
DATABASE = "woe-accounts"
STATE = ROOT / ".account-state.json"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise RuntimeError("redirect refused")


def call(method, path, body=None, content_type="application/json"):
    data = None
    headers = {}
    if body is not None:
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        headers["Content-Type"] = content_type
    request = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    add_surrogate_to_request(request, CONNECTOR, allowed_hosts=HOSTS)
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=60) as response:
            return response.status, read_json_response(response)
    except urllib.error.HTTPError as error:
        return error.code, read_json_response(error)


def checked(method, path, body=None, content_type="application/json"):
    status, payload = call(method, path, body, content_type)
    if status >= 300 or not payload.get("success", True):
        raise RuntimeError(f"Cloudflare API failed with HTTP {status}: {payload.get('errors', [])}")
    return payload


def load_state():
    return json.loads(STATE.read_text()) if STATE.exists() else {}


def save(values):
    current = load_state()
    current.update(values)
    STATE.write_text(json.dumps(current, indent=2) + "\n")


def list_databases():
    payload = checked("GET", f"/accounts/{ACCOUNT_ID}/d1/database?per_page=100")
    print(json.dumps([{"name": row["name"], "uuid": row["uuid"]} for row in payload["result"]], indent=2))


def create_database():
    payload = checked("POST", f"/accounts/{ACCOUNT_ID}/d1/database", {"name": DATABASE})
    database_id = payload["result"]["uuid"]
    save({"database_id": database_id})
    print(json.dumps({"name": DATABASE, "database_id": database_id}, indent=2))


def query(sql, params=None):
    database_id = load_state()["database_id"]
    return checked("POST", f"/accounts/{ACCOUNT_ID}/d1/database/{database_id}/query",
                   {"sql": sql, "params": params or []})["result"]


def apply_migrations():
    for path in sorted((ROOT / "migrations").glob("*.sql")):
        statements = [part.strip() for part in path.read_text().split(";") if part.strip()]
        for statement in statements:
            query(statement)
        print(f"applied {path.name}: {len(statements)} statements")


def bundle():
    subprocess.run(["npm", "run", "bundle"], cwd=ROOT, check=True)
    output = ROOT / "dist" / "index.js"
    save({"bundle_bytes": output.stat().st_size,
          "bundle_sha256": hashlib.sha256(output.read_bytes()).hexdigest()})
    print(json.dumps({"path": str(output), "uncompressed_bytes": output.stat().st_size}, indent=2))


def multipart(parts):
    boundary = "----woeaccount" + uuid.uuid4().hex
    chunks = []
    for name, filename, content_type, value in parts:
        disposition = f'Content-Disposition: form-data; name="{name}"'
        if filename:
            disposition += f'; filename="{filename}"'
        chunks.append(f"--{boundary}\r\n{disposition}\r\nContent-Type: {content_type}\r\n\r\n".encode()
                      + value + b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode())
    return boundary, b"".join(chunks)


def deploy():
    current = load_state()
    source = (ROOT / "dist" / "index.js").read_bytes()
    first_deploy = not current.get("deployed_at")
    configured = set(current.get("optional_bindings", []))
    bindings = [
        {"type": "d1", "name": "DB", "id": current["database_id"]},
        {"type": "plain_text", "name": "EMAIL_SENDER",
         "text": "resend" if os.environ.get("RESEND_API_KEY") or "RESEND_API_KEY" in configured else "sink"},
        ({"type": "secret_text", "name": "BETTER_AUTH_SECRET", "text": os.urandom(32).hex()}
         if first_deploy else {"type": "inherit", "name": "BETTER_AUTH_SECRET"}),
    ]
    optional = [
        ("GOOGLE_CLIENT_ID", "plain_text"),
        ("GOOGLE_CLIENT_SECRET", "secret_text"),
        ("RESEND_API_KEY", "secret_text"),
        ("EMAIL_FROM", "plain_text"),
    ]
    for name, binding_type in optional:
        value = os.environ.get(name)
        if value:
            bindings.append({"type": binding_type, "name": name, "text": value})
            configured.add(name)
        elif name in configured:
            bindings.append({"type": "inherit", "name": name})
    metadata = {
        "main_module": "index.js",
        "compatibility_date": "2026-10-01",
        "compatibility_flags": ["nodejs_compat"],
        "bindings": bindings,
    }
    boundary, body = multipart([
        ("metadata", None, "application/json", json.dumps(metadata).encode()),
        ("index.js", "index.js", "application/javascript+module", source),
    ])
    checked("PUT", f"/accounts/{ACCOUNT_ID}/workers/scripts/{WORKER}", body,
            f"multipart/form-data; boundary={boundary}")
    checked("POST", f"/accounts/{ACCOUNT_ID}/workers/scripts/{WORKER}/subdomain", {"enabled": True})
    subdomain = checked("GET", f"/accounts/{ACCOUNT_ID}/workers/subdomain")["result"]["subdomain"]
    url = f"https://{WORKER}.{subdomain}.workers.dev"
    save({"url": url, "deployed_at": int(time.time()), "optional_bindings": sorted(configured)})
    print(url)


def main():
    commands = {"list-db": list_databases, "create-db": create_database,
                "apply-migrations": apply_migrations, "bundle": bundle, "deploy": deploy}
    command = sys.argv[1] if len(sys.argv) > 1 else "help"
    if command == "query":
        print(json.dumps(query(sys.argv[2]), indent=2))
    elif command in commands:
        commands[command]()
    else:
        print("commands: list-db, create-db, apply-migrations, bundle, deploy, query SQL")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
