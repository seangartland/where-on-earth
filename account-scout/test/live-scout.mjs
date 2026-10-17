import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const base = process.env.SCOUT_URL;
assert(base, "SCOUT_URL is required");
const email = `scout-${Date.now()}@example.invalid`;
const post = (path, body, headers = {}) => fetch(`${base}${path}`, {
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

const healthTimings = [];
for (let i = 0; i < 20; i += 1) {
  const start = performance.now();
  const response = await fetch(`${base}/health?sample=${i}`, { cache: "no-store" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  healthTimings.push(Number((performance.now() - start).toFixed(2)));
}

const emailStart = performance.now();
let response = await post("/api/auth/email-otp/send-verification-otp", { email, type: "sign-in" });
assert(response.ok, `OTP send failed: ${response.status} ${await response.text()}`);
const raw = execFileSync("python3", ["deploy.py", "query",
  `SELECT otp FROM mail_sink WHERE email = '${email}' ORDER BY created_at DESC LIMIT 1`],
  { cwd: new URL("..", import.meta.url), encoding: "utf8" });
const results = JSON.parse(raw);
const otp = results[0].results[0].otp;
assert.match(otp, /^\d{6}$/);
const verificationRaw = execFileSync("python3", ["deploy.py", "query",
  "SELECT value FROM verification ORDER BY createdAt DESC LIMIT 1"],
  { cwd: new URL("..", import.meta.url), encoding: "utf8" });
const verification = JSON.parse(verificationRaw)[0].results[0].value;
assert(!verification.includes(otp), "better-auth verification storage exposed the live OTP");

response = await post("/api/auth/sign-in/email-otp", { email, otp });
assert(response.ok, `OTP verify failed: ${response.status} ${await response.text()}`);
const token = response.headers.get("set-auth-token");
assert(token, "bearer plugin did not return set-auth-token");
response = await fetch(`${base}/api/auth/get-session`, { headers: { authorization: `Bearer ${token}` } });
const session = await response.json();
assert.equal(session.user.email, email);
const emailRoundTripWallMs = Number((performance.now() - emailStart).toFixed(2));

const firstHealthWallMs = healthTimings[0];
const warmHealthWallMs = healthTimings.slice(1).sort((a, b) => a - b);
console.log(JSON.stringify({
  emailRoundTrip: "PASS",
  emailRoundTripWallMs,
  verificationValueExcludesLiveCode: true,
  sessionCreated: true,
  healthWallMs: {
    samples: healthTimings.length,
    firstRequestProxy: firstHealthWallMs,
    warmSamples: warmHealthWallMs.length,
    warmMedian: warmHealthWallMs[Math.floor(warmHealthWallMs.length / 2)],
    warmP95: warmHealthWallMs[Math.ceil(warmHealthWallMs.length * 0.95) - 1],
    warmMax: warmHealthWallMs.at(-1),
  },
  note: "Wall-clock timings are not CPU time. The first request is only a cold-start proxy because Cloudflare may already have an isolate available.",
}, null, 2));
