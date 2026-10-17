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
