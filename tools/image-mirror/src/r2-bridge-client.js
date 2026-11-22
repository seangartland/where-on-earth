// Adapter with the same shape as r2-client.js's put/get/delete, backed by
// smoke/cf-bridge.py instead of a bearer token. VM-sandbox-only development
// convenience for the smoke test; see that script's header comment and
// R2-BUILD-REPORT.md. Not used on the Pi.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export function createR2BridgeClient({ bridgePath, bucket }) {
  const env = bucket ? { ...process.env, IMAGE_MIRROR_R2_BUCKET: bucket } : process.env;

  function run(args) {
    const result = spawnSync('python3', [bridgePath, ...args], { encoding: 'utf8', env });
    if (result.error) throw result.error;
    const lastLine = result.stdout.trim().split('\n').pop() || '{}';
    let parsed;
    try {
      parsed = JSON.parse(lastLine);
    } catch {
      throw new Error(`cf-bridge.py produced non-JSON output: ${result.stdout}\n${result.stderr}`);
    }
    return parsed;
  }

  async function putObject({ key, body, contentType }) {
    const dir = mkdtempSync(path.join(tmpdir(), 'image-mirror-smoke-'));
    const file = path.join(dir, 'body.bin');
    try {
      writeFileSync(file, body);
      const result = run(['put', key, file, contentType]);
      return { status: result.status, ok: result.ok, response: result.response };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  async function getObject({ key }) {
    const dir = mkdtempSync(path.join(tmpdir(), 'image-mirror-smoke-'));
    const file = path.join(dir, 'body.bin');
    try {
      const result = run(['get', key, file]);
      const body = result.ok ? readFileSync(file) : Buffer.alloc(0);
      return { status: result.status, ok: result.ok, body, contentType: result.content_type, etag: result.etag };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  async function deleteObject({ key }) {
    const result = run(['delete', key]);
    return { status: result.status, ok: result.ok };
  }

  return { putObject, getObject, deleteObject };
}
