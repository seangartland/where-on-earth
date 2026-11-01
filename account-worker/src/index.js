import { betterAuth } from 'better-auth';
import { bearer, emailOTP } from 'better-auth/plugins';
import { createSender } from './sender.js';
import { getSync, postSync } from './sync.js';

const ALLOWED_ORIGINS = new Set([
  'https://where-on.earth',
  'https://www.where-on.earth',
  'https://game.local',
]);

function cors(request) {
  const origin = request.headers.get('origin');
  return origin && ALLOWED_ORIGINS.has(origin) ? {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    vary: 'Origin',
  } : {};
}

function json(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors(request) },
  });
}

function authFor(env, origin) {
  const socialProviders = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? {
    google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
  } : {};
  const sender = createSender(env);
  return betterAuth({
    appName: 'Where on Earth',
    baseURL: origin,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    trustedOrigins: [origin, ...ALLOWED_ORIGINS],
    session: { expiresIn: 60 * 60 * 24 * 90, updateAge: 60 * 60 * 24 },
    socialProviders,
    plugins: [
      bearer(),
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        rateLimit: { window: 3600, max: 5 },
        sendVerificationOTP: (message) => sender.send(message),
      }),
    ],
  });
}

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

// --- Full-page Google sign-in handoff -------------------------------------
// The game page cannot use the session cookie better-auth sets during the
// OAuth round trip (the game lives on another origin and keeps its session
// as a bearer token in localStorage). So the flow hands the session over
// with a one-time code: start plants an attempt (row + cookie) and sends the
// browser to Google with the better-auth callbackURL pointed at land; land
// reads the fresh session, mints a code bound to the attempt, and redirects
// to the game with the code in the URL fragment (fragments are never sent
// to a server or written to a server log); the game POSTs the code to
// exchange and gets the same session JSON shape as the other sign-in paths.
const ATTEMPT_TTL_MS = 10 * 60 * 1000;
const EXCHANGE_CODE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_RETURN_URL = 'https://www.where-on.earth/?accounts=1';
const ATTEMPT_COOKIE = 'woe_attempt';

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomExchangeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function cookieValue(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

function redirectToGame(returnUrl, code) {
  const target = new URL(returnUrl);
  target.hash = code ? `woe_auth=${code}` : 'woe_auth_error=1';
  return new Response(null, { status: 302, headers: { location: target.toString() } });
}

async function startGoogleSignIn(request, env, url, auth) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return json(request, { code: 'GOOGLE_UNAVAILABLE' }, 503);
  }
  let returnUrl = DEFAULT_RETURN_URL;
  const requested = url.searchParams.get('return');
  if (requested) {
    try {
      const parsed = new URL(requested);
      if (ALLOWED_ORIGINS.has(parsed.origin)) returnUrl = parsed.toString();
    } catch { /* keep the default return */ }
  }
  const attemptId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare('INSERT INTO auth_attempts (id, return_url, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(attemptId, returnUrl, now, now + ATTEMPT_TTL_MS).run();
  const land = new URL('/v1/auth/google/land', url.origin);
  land.searchParams.set('attempt', attemptId);
  const headers = new Headers({
    'content-type': 'application/json',
    origin: url.origin,
    'user-agent': request.headers.get('user-agent') || '',
  });
  const upstream = await auth.handler(new Request(new URL('/api/auth/sign-in/social', url.origin), {
    method: 'POST', headers, body: JSON.stringify({ provider: 'google', callbackURL: land.toString() }),
  }));
  let target = null;
  if (upstream.status >= 300 && upstream.status < 400) {
    target = upstream.headers.get('location');
  } else {
    const data = await upstream.json().catch(() => null);
    target = data?.url || null;
  }
  if (!target) return json(request, { code: 'GOOGLE_START_FAILED' }, 502);
  const response = new Response(null, { status: 302, headers: { location: target } });
  const upstreamCookies = upstream.headers.getSetCookie ? upstream.headers.getSetCookie() : [];
  for (const cookie of upstreamCookies) response.headers.append('set-cookie', cookie);
  response.headers.append('set-cookie',
    `${ATTEMPT_COOKIE}=${attemptId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${ATTEMPT_TTL_MS / 1000}`);
  return response;
}

async function landGoogleSignIn(request, env, url, auth) {
  const attemptId = url.searchParams.get('attempt') || '';
  const attempt = attemptId
    ? await env.DB.prepare('SELECT * FROM auth_attempts WHERE id = ?').bind(attemptId).first()
    : null;
  if (!attempt || attempt.used_at || attempt.expires_at < Date.now()
    || cookieValue(request, ATTEMPT_COOKIE) !== attemptId) {
    return redirectToGame(attempt?.return_url || DEFAULT_RETURN_URL, null);
  }
  const upstream = await auth.handler(new Request(new URL('/api/auth/get-session', request.url), request));
  const data = upstream.ok ? await upstream.json().catch(() => null) : null;
  if (!data?.session?.token || !data?.user?.id) return redirectToGame(attempt.return_url, null);
  const code = randomExchangeCode();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('UPDATE auth_attempts SET used_at = ? WHERE id = ?').bind(now, attemptId),
    env.DB.prepare(`INSERT INTO auth_exchange_codes
      (code_hash, user_id, session_token, session_expires_at, attempt_id, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(await sha256Hex(code), data.user.id, data.session.token,
        new Date(data.session.expiresAt).getTime(), attemptId, now, now + EXCHANGE_CODE_TTL_MS),
  ]);
  const response = redirectToGame(attempt.return_url, code);
  response.headers.append('set-cookie', `${ATTEMPT_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
  return response;
}

async function exchangeAuthCode(request, env) {
  const body = await readBody(request);
  if (!body?.code || typeof body.code !== 'string') {
    return json(request, { code: 'INVALID_CODE' }, 400);
  }
  const codeHash = await sha256Hex(body.code);
  const row = await env.DB.prepare('SELECT * FROM auth_exchange_codes WHERE code_hash = ?').bind(codeHash).first();
  if (!row || row.used_at || row.expires_at < Date.now()) {
    return json(request, { code: 'INVALID_CODE' }, 401);
  }
  const claimed = await env.DB.prepare(
    'UPDATE auth_exchange_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL',
  ).bind(Date.now(), codeHash).run();
  if (claimed.meta.changes !== 1) return json(request, { code: 'INVALID_CODE' }, 401);
  const user = await env.DB.prepare('SELECT id, name, email FROM "user" WHERE id = ?').bind(row.user_id).first();
  if (!user) return json(request, { code: 'INVALID_CODE' }, 401);
  return json(request, {
    token: row.session_token,
    session: { token: row.session_token, expiresAt: new Date(row.session_expires_at).toISOString() },
    user: { id: user.id, name: user.name, email: user.email },
  });
}

async function reserveEmailSend(env, email) {
  const cutoff = Date.now() - 60 * 60 * 1000;
  const normalized = email.trim().toLowerCase();
  const result = await env.DB.prepare(`INSERT INTO email_send_events (id, email, created_at)
    SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM email_send_events WHERE email = ? AND created_at > ?) < 5`)
    .bind(crypto.randomUUID(), normalized, Date.now(), normalized, cutoff).run();
  return result.meta.changes === 1;
}

async function proxyAuth(request, path, body, auth) {
  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');
  const upstream = await auth.handler(new Request(new URL(path, request.url), {
    method: 'POST', headers, body: JSON.stringify(body),
  }));
  const response = new Response(upstream.body, upstream);
  for (const [key, value] of Object.entries(cors(request))) response.headers.set(key, value);
  return response;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
    if (url.pathname === '/health') {
      const row = await env.DB.prepare('SELECT 1 AS ok').first();
      return json(request, {
        ok: row?.ok === 1,
        service: 'woe-account',
        emailSender: createSender(env).name,
        googleAvailable: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
        googleClientId: env.GOOGLE_CLIENT_ID || null,
      });
    }

    const auth = authFor(env, url.origin);
    if (url.pathname === '/v1/auth/email/send' && request.method === 'POST') {
      const body = await readBody(request);
      if (!body?.email || !(await reserveEmailSend(env, body.email))) {
        return json(request, { code: body?.email ? 'RATE_LIMITED' : 'INVALID_EMAIL' }, body?.email ? 429 : 400);
      }
      return proxyAuth(request, '/api/auth/email-otp/send-verification-otp', {
        email: body.email.trim().toLowerCase(), type: 'sign-in',
      }, auth);
    }
    if (url.pathname === '/v1/auth/email/verify' && request.method === 'POST') {
      const body = await readBody(request);
      if (!body?.email || !/^\d{6}$/.test(body?.code || '')) {
        return json(request, { code: 'INVALID_CODE' }, 400);
      }
      return proxyAuth(request, '/api/auth/sign-in/email-otp', {
        email: body.email.trim().toLowerCase(), otp: body.code,
      }, auth);
    }
    if (url.pathname === '/v1/auth/google' && request.method === 'POST') {
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        return json(request, { code: 'GOOGLE_UNAVAILABLE' }, 503);
      }
      const body = await readBody(request);
      if (!body?.idToken) return json(request, { code: 'MISSING_ID_TOKEN' }, 400);
      return proxyAuth(request, '/api/auth/sign-in/social', {
        provider: 'google', idToken: { token: body.idToken, nonce: body.nonce },
      }, auth);
    }
    if (url.pathname === '/v1/auth/google/start' && request.method === 'GET') {
      return startGoogleSignIn(request, env, url, auth);
    }
    if (url.pathname === '/v1/auth/google/land' && request.method === 'GET') {
      return landGoogleSignIn(request, env, url, auth);
    }
    if (url.pathname === '/v1/auth/exchange' && request.method === 'POST') {
      return exchangeAuthCode(request, env);
    }
    if (url.pathname === '/v1/auth/signout' && request.method === 'POST') {
      return proxyAuth(request, '/api/auth/sign-out', {}, auth);
    }
    if (url.pathname === '/v1/me' && request.method === 'GET') {
      const upstream = await auth.handler(new Request(new URL('/api/auth/get-session', request.url), request));
      const response = new Response(upstream.body, upstream);
      for (const [key, value] of Object.entries(cors(request))) response.headers.set(key, value);
      return response;
    }
    if (url.pathname === '/v1/sync' && request.method === 'GET') {
      const response = await getSync(request, env, auth);
      for (const [key, value] of Object.entries(cors(request))) response.headers.set(key, value);
      return response;
    }
    if (url.pathname === '/v1/sync' && request.method === 'POST') {
      const response = await postSync(request, env, auth);
      for (const [key, value] of Object.entries(cors(request))) response.headers.set(key, value);
      return response;
    }
    if (url.pathname.startsWith('/api/auth/')) return auth.handler(request);
    return json(request, { code: 'NOT_FOUND' }, 404);
  },
};
