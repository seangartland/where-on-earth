// Batch API eligibility probe (EOX Phase 1 follow-up).
// Loads CDSE credentials exactly like render.mjs (env, then scripts/sat/.env),
// exchanges a client-credentials token, then classifies Batch V2 access:
//   1. GET the batch request list endpoint.
//   2. If ambiguous, POST a minimal tiling-grid computation for one tile.
// Prints status codes and short error summaries only. Never prints tokens
// or credential values.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const TOKEN_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const BATCH_BASE = 'https://sh.dataspace.copernicus.eu/api/v2/batch';

function loadEnv() {
  const out = {};
  const p = join(here, '.env');
  if (existsSync(p)) for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const envFile = loadEnv();
const clientId = process.env.CDSE_CLIENT_ID || envFile.CDSE_CLIENT_ID;
const clientSecret = process.env.CDSE_CLIENT_SECRET || envFile.CDSE_CLIENT_SECRET;
if (!clientId || !clientSecret) { console.log('NO_CREDENTIALS'); process.exit(0); }

const tokenRes = await fetch(TOKEN_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
});
console.log('token exchange:', tokenRes.status);
if (!tokenRes.ok) { console.log('token error:', (await tokenRes.text()).slice(0, 200)); process.exit(0); }
const { access_token } = await tokenRes.json();
const auth = { Authorization: `Bearer ${access_token}` };

const list = await fetch(`${BATCH_BASE}/`, { headers: auth });
console.log('batch list GET:', list.status, list.status === 403 ? (await list.text()).slice(0, 200) : '');

const grid = await fetch(`${BATCH_BASE}/tiling-grids`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: 'woe-probe', tilingGrid: { resolution: 305.748113140558 }, input: { bounds: { bbox: [-8235000, 4545000, -8230000, 4550000] } } }),
});
console.log('batch tiling-grid POST:', grid.status, grid.status >= 400 ? (await grid.text()).slice(0, 300) : 'ok');
