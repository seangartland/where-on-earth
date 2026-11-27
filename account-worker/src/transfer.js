// Moves a signed-in session to another browser or installed PWA on the
// same or a different device. A signed-in profile mints a short numeric
// code bound to its current session; a signed-out surface redeems it once
// for that same session, in the shape session.js already stores. Modeled
// on the /v1/auth/exchange code-for-session handoff in index.js.
const TRANSFER_CODE_TTL_MS = 10 * 60 * 1000;

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
