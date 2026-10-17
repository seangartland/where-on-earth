import { betterAuth } from "better-auth";
import { bearer, emailOTP } from "better-auth/plugins";

const json = (body, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });

function decodePayload(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("JWT must have three parts");
  const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  return JSON.parse(atob(padded));
}

function createAuth(env, origin) {
  return betterAuth({
    appName: "Where on Earth account scout",
    baseURL: origin,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: env.AUTH_DB,
    trustedOrigins: [origin],
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    plugins: [
      bearer(),
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        // Default is "plain" (the code sits readable in the verification
        // table). Hashed keeps a D1 read from exposing live codes.
        storeOTP: "hashed",
        async sendVerificationOTP({ email, otp, type }) {
          await env.AUTH_DB.prepare(
            "INSERT INTO mail_sink (id, email, otp, type, created_at) VALUES (?, ?, ?, ?, ?)",
          )
            .bind(crypto.randomUUID(), email, otp, type, Date.now())
            .run();
        },
      }),
    ],
  });
}

async function googleIdToken(request, auth, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ code: "MALFORMED_BODY" }, 400);
  }
  if (!body.idToken) return json({ code: "MISSING_ID_TOKEN" }, 400);
  let payload;
  try {
    payload = decodePayload(body.idToken);
  } catch {
    return json({ code: "MALFORMED_ID_TOKEN" }, 400);
  }
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(env.GOOGLE_CLIENT_ID)) {
    return json({ code: "WRONG_AUDIENCE" }, 401);
  }
  const upstream = new Request(new URL("/api/auth/sign-in/social", request.url), {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({
      provider: "google",
      idToken: { token: body.idToken, nonce: body.nonce },
    }),
  });
  return auth.handler(upstream);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = url.origin;
    if (url.pathname === "/health") {
      const row = await env.AUTH_DB.prepare("SELECT 1 AS ok").first();
      return json({ ok: row?.ok === 1, service: "woe-account-scout" });
    }
    const auth = createAuth(env, origin);
    if (url.pathname === "/scout/google-id-token" && request.method === "POST") {
      return googleIdToken(request, auth, env);
    }
    if (url.pathname.startsWith("/api/auth/")) return auth.handler(request);
    return json({ code: "NOT_FOUND" }, 404);
  },
};
