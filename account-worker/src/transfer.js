// Moves a signed-in session to another browser or installed PWA on the
// same or a different device. A signed-in profile mints a short numeric
// code bound to its current session; a signed-out surface redeems it once
// for that same session, in the shape session.js already stores. Modeled
// on the /v1/auth/exchange code-for-session handoff in index.js.
const TRANSFER_CODE_TTL_MS = 10 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 10;

const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomTransferCode() {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return String(bytes[0] % 1000000).padStart(6, '0');
}

function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || 'unknown';
}

// Same windowed-count throttle index.js uses for email_send_events, applied
// here per IP since a redemption guess carries no profile identifier to key
// on: a wrong guess never matches a stored code_hash, so there is no row to
// attach a per-code attempt count to.
async function reserveTransferAttempt(env, ip) {
  const cutoff = Date.now() - ATTEMPT_WINDOW_MS;
  const result = await env.DB.prepare(`INSERT INTO transfer_attempt_events (id, ip, created_at)
    SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM transfer_attempt_events WHERE ip = ? AND created_at > ?) < ?`)
    .bind(crypto.randomUUID(), ip, Date.now(), ip, cutoff, MAX_ATTEMPTS_PER_WINDOW).run();
  return result.meta.changes === 1;
}

export async function issueTransferCode(request, env, auth) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id || !session?.session?.token) return response({ code: 'UNAUTHORIZED' }, 401);
  const now = Date.now();
  await env.DB.prepare('UPDATE auth_transfer_codes SET used_at = ? WHERE user_id = ? AND used_at IS NULL')
    .bind(now, session.user.id).run();
  const code = randomTransferCode();
  await env.DB.prepare(`INSERT INTO auth_transfer_codes
    (code_hash, user_id, session_token, session_expires_at, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(await sha256Hex(code), session.user.id, session.session.token,
      new Date(session.session.expiresAt).getTime(), now, now + TRANSFER_CODE_TTL_MS).run();
  return response({ code, expiresInSeconds: TRANSFER_CODE_TTL_MS / 1000 });
}

export async function redeemTransferCode(request, env) {
  if (!await reserveTransferAttempt(env, clientIp(request))) {
    return response({ code: 'RATE_LIMITED' }, 429);
  }
  let body;
  try { body = await request.json(); } catch { body = null; }
  if (!body?.code || typeof body.code !== 'string') return response({ code: 'INVALID_CODE' }, 400);
  const codeHash = await sha256Hex(body.code);
  const row = await env.DB.prepare('SELECT * FROM auth_transfer_codes WHERE code_hash = ?').bind(codeHash).first();
  if (!row || row.used_at || row.expires_at < Date.now()) return response({ code: 'INVALID_CODE' }, 401);
  const claimed = await env.DB.prepare(
    'UPDATE auth_transfer_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL',
  ).bind(Date.now(), codeHash).run();
  if (claimed.meta.changes !== 1) return response({ code: 'INVALID_CODE' }, 401);
  const user = await env.DB.prepare('SELECT id, name, email FROM "user" WHERE id = ?').bind(row.user_id).first();
  if (!user) return response({ code: 'INVALID_CODE' }, 401);
  return response({
    token: row.session_token,
    session: { token: row.session_token, expiresAt: new Date(row.session_expires_at).toISOString() },
    user: { id: user.id, name: user.name, email: user.email },
  });
}
