import { CATALOG, CATALOG_VERSION } from "./catalog.js";
import { scoreCoordinates } from "./scoring.js";
export { GroupChallengeRoom } from "./group-room.js";

const RULES = { version: 1, rounds: 5, roundSeconds: 20, graceMilliseconds: 2000, maximumScore: 5000 };
const WEEK = 7 * 86400000;
const MONTH = 30 * 86400000;
const BODY_LIMIT = 8192;
const JOIN_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const DEFAULT_ORIGINS = ["https://www.where-on.earth", "https://where-on.earth", "https://where-on-earth-game.vercel.app"];
const TERMINAL = new Set(["COMPLETED", "ABANDONED", "EXPIRED"]);

class ApiError extends Error {
  constructor(status, code, message, details) { super(message); Object.assign(this, { status, code, details }); }
}
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}
function errorResponse(error, headers = {}) {
  const known = error instanceof ApiError;
  return json({ error: { code: known ? error.code : "INTERNAL_ERROR", message: known ? error.message : "The service could not complete the request.", ...(known && error.details ? { details: error.details } : {}) } }, known ? error.status : 500, headers);
}
function assertFields(value, allowed, required = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "INVALID_REQUEST", "The JSON body must be an object.");
  if (Object.keys(value).some((key) => !allowed.includes(key)) || required.some((key) => !(key in value))) throw new ApiError(400, "INVALID_REQUEST", "The request contains missing or unknown fields.");
}
async function body(request, allowed, required = []) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new ApiError(400, "INVALID_REQUEST", "Content-Type must be application/json.");
  const length = Number(request.headers.get("content-length") || 0);
  if (length > BODY_LIMIT) throw new ApiError(400, "INVALID_REQUEST", "The request body is too large.");
  const text = await request.text();
  if (new TextEncoder().encode(text).length > BODY_LIMIT) throw new ApiError(400, "INVALID_REQUEST", "The request body is too large.");
  let value;
  try { value = text ? JSON.parse(text) : {}; } catch { throw new ApiError(400, "INVALID_REQUEST", "The request body is not valid JSON."); }
  assertFields(value, allowed, required);
  return value;
}
function displayName(value) {
  if (typeof value !== "string" || value !== value.trim() || /[\p{Cc}<>\u202A-\u202E\u2066-\u2069]/u.test(value)) throw new ApiError(400, "INVALID_DISPLAY_NAME", "Display name is not valid.");
  const count = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].length;
  if (count < 1 || count > 24) throw new ApiError(400, "INVALID_DISPLAY_NAME", "Display name must be 1 through 24 characters.");
  return value;
}
function random(bytes = 32) { const data = crypto.getRandomValues(new Uint8Array(bytes)); return btoa(String.fromCharCode(...data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
function joinCode() { const data = crypto.getRandomValues(new Uint8Array(6)); return [...data].map((n) => JOIN_ALPHABET[n % JOIN_ALPHABET.length]).join(""); }
function suffix(playerId) { return playerId.replace(/[^A-Za-z0-9]/g, "").slice(-3).toUpperCase(); }
async function hmac(secret, text) {
  if (!secret) throw new ApiError(503, "SERVICE_UNAVAILABLE", "The service secret is not configured.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
const authHash = (env, token) => hmac(env.PLAYER_TOKEN_KEY || env.SERVER_SECRET, token);
const pairHash = (env, a, b) => hmac(env.PAIR_KEY || env.SERVER_SECRET, [a, b].sort().join(":"));
function recordStub(env) { return env.RECORDS.get(env.RECORDS.idFromName("global")); }
async function internal(stub, path, payload = {}) {
  const response = await stub.fetch(`https://internal${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) throw new ApiError(response.status, data.error.code, data.error.message, data.error.details);
  return data;
}
function allowedOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const configured = (env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);
  const exact = [...DEFAULT_ORIGINS, ...configured].includes(origin);
  const preview = configured.includes("https://*.vercel.app") && /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
  return exact || preview ? origin : false;
}
function corsHeaders(origin) { return origin ? { "access-control-allow-origin": origin, vary: "Origin", "access-control-allow-headers": "Authorization, Content-Type", "access-control-allow-methods": "GET, POST, PUT, OPTIONS", "access-control-max-age": "600" } : {}; }
async function authenticate(request, env) {
  const match = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{40,})$/);
  if (!match) throw new ApiError(401, "UNAUTHORIZED", "A valid player token is required.");
  return internal(recordStub(env), "/auth", { tokenHash: await authHash(env, match[1]) });
}
async function rateLimit(request, env, action, limit, seconds, extra = "") {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const coarse = ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip.split(".").slice(0, 3).join(".");
  const key = await hmac(env.RATE_LIMIT_KEY || env.SERVER_SECRET, `${coarse}:${extra}`);
  const result = await internal(recordStub(env), "/rate", { action, key, limit, windowMs: seconds * 1000 });
  if (!result.allowed) throw new ApiError(429, "RATE_LIMITED", "Too many requests. Try again later.", { retryAfter: result.retryAfter });
}
async function authenticateAndRate(request, env, action, limit, seconds) {
  const match = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{40,})$/);
  if (!match) throw new ApiError(401, "UNAUTHORIZED", "A valid player token is required.");
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const coarse = ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip.split(".").slice(0, 3).join(".");
  return internal(recordStub(env), "/auth-rate", {
    tokenHash: await authHash(env, match[1]),
    action,
    key: await hmac(env.RATE_LIMIT_KEY || env.SERVER_SECRET, coarse),
    limit,
    windowMs: seconds * 1000,
  });
}
function matchStub(env, matchId) { try { return env.MATCHES.get(env.MATCHES.idFromString(matchId)); } catch { throw new ApiError(404, "MATCH_NOT_FOUND", "Match not found."); } }
function groupStub(env, challengeId) { try { return env.GROUPS.get(env.GROUPS.idFromString(challengeId)); } catch { throw new ApiError(404, "CHALLENGE_NOT_FOUND", "Challenge not found."); } }
function chooseLocations(excluded = []) {
  const usedCountries = new Set(); const chosen = []; let countryFallback = false;
  for (const low of [1, 3, 5, 7, 9]) {
    let pool = CATALOG.filter((item) => item.difficulty >= low && item.difficulty <= low + 1 && !excluded.includes(item.id));
    if (!pool.length) pool = CATALOG.filter((item) => item.difficulty >= low && item.difficulty <= low + 1);
    const uniqueCountry = pool.filter((item) => !usedCountries.has(item.country));
    if (!uniqueCountry.length) countryFallback = true;
    const candidates = uniqueCountry.length ? uniqueCountry : pool;
    const item = candidates[crypto.getRandomValues(new Uint32Array(1))[0] % candidates.length]; chosen.push(item); usedCountries.add(item.country);
  }
  for (let i = chosen.length - 1; i; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [chosen[i], chosen[j]] = [chosen[j], chosen[i]]; }
  return { locations: chosen, countryFallback };
}
function shareUrl(env, inviteToken) { return `${(env.GAME_ORIGIN || "https://www.where-on.earth").replace(/\/$/, "")}/pvp/join#invite=${inviteToken}`; }
function groupShareUrl(env, inviteToken) { return `${(env.GAME_ORIGIN || "https://www.where-on.earth").replace(/\/$/, "")}/pvp/group/join#invite=${inviteToken}`; }

export class PlayerRecords {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; const sql = ctx.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS players (player_id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL, display_name TEXT NOT NULL)");
    const oldPairColumns = sql.exec("PRAGMA table_info(pair_records)").toArray();
    if (oldPairColumns.length && !oldPairColumns.some((column) => column.name === "player_a_id")) sql.exec("ALTER TABLE pair_records RENAME TO pair_records_scaffold");
    sql.exec("CREATE TABLE IF NOT EXISTS pair_records (pair_key TEXT PRIMARY KEY, player_a_id TEXT NOT NULL, player_b_id TEXT NOT NULL, player_a_name TEXT NOT NULL, player_b_name TEXT NOT NULL, played INTEGER NOT NULL, a_wins INTEGER NOT NULL, b_wins INTEGER NOT NULL, ties INTEGER NOT NULL, a_points INTEGER NOT NULL, b_points INTEGER NOT NULL, last_played_at INTEGER NOT NULL, last_match_id TEXT NOT NULL, updated_at INTEGER NOT NULL)");
    sql.exec("CREATE TABLE IF NOT EXISTS completion_ledger (match_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, applied_at INTEGER NOT NULL)");
    sql.exec("CREATE TABLE IF NOT EXISTS invitations (credential_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, match_id TEXT NOT NULL, expires_at INTEGER NOT NULL)");
    sql.exec("CREATE TABLE IF NOT EXISTS open_matches (player_id TEXT NOT NULL, match_id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)");
    sql.exec("CREATE TABLE IF NOT EXISTS rate_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL, strikes INTEGER NOT NULL)");
    sql.exec("CREATE TABLE IF NOT EXISTS invitation_tombstones (credential_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, match_id TEXT NOT NULL, terminal_status TEXT NOT NULL, purge_at INTEGER NOT NULL)");
    sql.exec("CREATE TABLE IF NOT EXISTS open_groups (player_id TEXT NOT NULL, challenge_id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)");
    sql.exec("CREATE TABLE IF NOT EXISTS group_invitations (credential_hash TEXT PRIMARY KEY, credential_kind TEXT NOT NULL, challenge_id TEXT NOT NULL, expires_at INTEGER NOT NULL)");
    sql.exec("CREATE TABLE IF NOT EXISTS group_invitation_tombstones (credential_hash TEXT PRIMARY KEY, credential_kind TEXT NOT NULL, challenge_id TEXT NOT NULL, terminal_status TEXT NOT NULL, purge_at INTEGER NOT NULL)");
    sql.exec("CREATE TABLE IF NOT EXISTS group_memberships (player_id TEXT NOT NULL, challenge_id TEXT NOT NULL, role TEXT NOT NULL, summary TEXT NOT NULL, last_activity_at INTEGER NOT NULL, PRIMARY KEY (player_id, challenge_id))");
  }
  async fetch(request) {
    try {
      const url = new URL(request.url); const data = await request.json(); const sql = this.ctx.storage.sql; const now = Date.now();
      if (url.pathname === "/player") { sql.exec("INSERT INTO players VALUES (?, ?, ?, ?)", data.playerId, data.tokenHash, data.createdAt, data.displayName); return json({ ok: true }); }
      if (url.pathname === "/auth") { const row = sql.exec("SELECT player_id, display_name, created_at FROM players WHERE token_hash = ?", data.tokenHash).toArray()[0]; if (!row) throw new ApiError(401, "UNAUTHORIZED", "A valid player token is required."); return json({ playerId: row.player_id, displayName: row.display_name, createdAt: row.created_at, tokenHash: data.tokenHash }); }
      if (url.pathname === "/auth-rate") {
        const player = sql.exec("SELECT player_id, display_name, created_at FROM players WHERE token_hash = ?", data.tokenHash).toArray()[0];
        if (!player) throw new ApiError(401, "UNAUTHORIZED", "A valid player token is required.");
        const bucket = `${data.action}:${data.key}:${player.player_id}`; let result;
        this.ctx.storage.transactionSync(() => {
          let row = sql.exec("SELECT count, reset_at, strikes FROM rate_limits WHERE bucket = ?", bucket).toArray()[0];
          if (!row || now >= row.reset_at) row = { count: 0, reset_at: now + data.windowMs, strikes: row && now < row.reset_at + data.windowMs * 4 ? row.strikes : 0 };
          row.count++; const allowed = row.count <= data.limit; if (!allowed) row.strikes = Math.min(4, row.strikes + 1);
          const resetAt = allowed ? row.reset_at : Math.max(row.reset_at, now + data.windowMs * 2 ** row.strikes);
          sql.exec("INSERT OR REPLACE INTO rate_limits VALUES (?, ?, ?, ?)", bucket, row.count, resetAt, row.strikes);
          result = { allowed, retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
        });
        if (!result.allowed) throw new ApiError(429, "RATE_LIMITED", "Too many requests. Try again later.", { retryAfter: result.retryAfter });
        return json({ playerId: player.player_id, displayName: player.display_name, createdAt: player.created_at, tokenHash: data.tokenHash });
      }
      if (url.pathname === "/name") { sql.exec("UPDATE players SET display_name = ? WHERE player_id = ?", data.displayName, data.playerId); return json({ ok: true }); }
      if (url.pathname === "/rate") {
        const bucket = `${data.action}:${data.key}`; let result;
        this.ctx.storage.transactionSync(() => {
          let row = sql.exec("SELECT count, reset_at, strikes FROM rate_limits WHERE bucket = ?", bucket).toArray()[0];
          if (!row || now >= row.reset_at) row = { count: 0, reset_at: now + data.windowMs, strikes: row && now < row.reset_at + data.windowMs * 4 ? row.strikes : 0 };
          row.count++; const allowed = row.count <= data.limit; if (!allowed) row.strikes = Math.min(4, row.strikes + 1);
          const resetAt = allowed ? row.reset_at : Math.max(row.reset_at, now + data.windowMs * 2 ** row.strikes);
          sql.exec("INSERT OR REPLACE INTO rate_limits VALUES (?, ?, ?, ?)", bucket, row.count, resetAt, row.strikes); result = { allowed, retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
        }); return json(result);
      }
      if (url.pathname === "/reserve") {
        let openCount;
        this.ctx.storage.transactionSync(() => {
          sql.exec("DELETE FROM open_matches WHERE expires_at <= ?", now); sql.exec("DELETE FROM open_groups WHERE expires_at <= ?", now);
          openCount = sql.exec("SELECT (SELECT COUNT(*) FROM open_matches WHERE player_id = ?) + (SELECT COUNT(*) FROM open_groups WHERE player_id = ?) count", data.playerId, data.playerId).toArray()[0].count;
          if (openCount >= 3) return;
          sql.exec("INSERT INTO open_matches VALUES (?, ?, ?)", data.playerId, data.matchId, data.expiresAt);
          sql.exec("INSERT INTO invitations VALUES (?, 'TOKEN', ?, ?), (?, 'CODE', ?, ?)", data.inviteHash, data.matchId, data.expiresAt, data.joinCode, data.matchId, data.expiresAt);
        });
        if (openCount >= 3) throw new ApiError(429, "OPEN_CHALLENGE_CAP", "You already have 3 open challenges.", { limit: 3, openCount }); return json({ openCount: openCount + 1 });
      }
      if (url.pathname === "/group-reserve") {
        let openCount; let duplicate = false;
        this.ctx.storage.transactionSync(() => {
          sql.exec("DELETE FROM open_matches WHERE expires_at <= ?", now); sql.exec("DELETE FROM open_groups WHERE expires_at <= ?", now);
          if (sql.exec("SELECT challenge_id FROM open_groups WHERE challenge_id = ?", data.challengeId).toArray()[0]) { duplicate = true; return; }
          openCount = sql.exec("SELECT (SELECT COUNT(*) FROM open_matches WHERE player_id = ?) + (SELECT COUNT(*) FROM open_groups WHERE player_id = ?) count", data.playerId, data.playerId).toArray()[0].count;
          if (openCount >= 3) return;
          sql.exec("INSERT INTO open_groups VALUES (?, ?, ?)", data.playerId, data.challengeId, data.expiresAt);
          sql.exec("INSERT INTO group_invitations VALUES (?, 'TOKEN', ?, ?), (?, 'CODE', ?, ?)", data.inviteHash, data.challengeId, data.expiresAt, data.joinCode, data.challengeId, data.expiresAt);
        });
        if (openCount >= 3) throw new ApiError(429, "OPEN_CHALLENGE_CAP", "You already have 3 open challenges.", { limit: 3, openCount }); return json({ openCount: duplicate ? undefined : openCount + 1, duplicate });
      }
      if (url.pathname === "/group-resolve-invite") {
        sql.exec("DELETE FROM group_invitation_tombstones WHERE purge_at <= ?", now);
        const row = sql.exec("SELECT challenge_id, expires_at FROM group_invitations WHERE credential_hash = ? AND credential_kind = ?", data.credential, data.kind).toArray()[0];
        if (!row) { const dead = sql.exec("SELECT challenge_id, terminal_status FROM group_invitation_tombstones WHERE credential_hash = ? AND credential_kind = ?", data.credential, data.kind).toArray()[0]; if (dead) return json({ challengeId: dead.challenge_id, terminalStatus: dead.terminal_status }); throw new ApiError(404, "INVITATION_NOT_FOUND", "Invitation not found."); }
        return json({ challengeId: row.challenge_id, expired: now >= row.expires_at });
      }
      if (url.pathname === "/group-release") {
        this.ctx.storage.transactionSync(() => {
          if (data.terminalStatus) sql.exec("INSERT OR REPLACE INTO group_invitation_tombstones SELECT credential_hash, credential_kind, challenge_id, ?, ? FROM group_invitations WHERE challenge_id = ?", data.terminalStatus, now + WEEK, data.challengeId);
          sql.exec("DELETE FROM open_groups WHERE challenge_id = ?", data.challengeId); sql.exec("DELETE FROM group_invitations WHERE challenge_id = ?", data.challengeId);
        }); return json({ ok: true });
      }
      // First non-creator join frees the creator's slot but keeps the invitations so others can still join.
      if (url.pathname === "/group-release-slot") { sql.exec("DELETE FROM open_groups WHERE challenge_id = ?", data.challengeId); return json({ ok: true }); }
      if (url.pathname === "/group-membership-upsert") { sql.exec("INSERT OR REPLACE INTO group_memberships VALUES (?, ?, ?, ?, ?)", data.playerId, data.challengeId, data.role, JSON.stringify(data.summary), data.lastActivityAt); return json({ ok: true }); }
      if (url.pathname === "/group-membership-remove") { sql.exec("DELETE FROM group_memberships WHERE challenge_id = ?", data.challengeId); return json({ ok: true }); }
      if (url.pathname === "/group-list") {
        const scope = data.scope === "created" ? "AND role = 'CREATOR'" : ""; const rows = sql.exec(`SELECT summary, last_activity_at FROM group_memberships WHERE player_id = ? ${scope} AND (last_activity_at < ? OR (last_activity_at = ? AND challenge_id < ?)) ORDER BY last_activity_at DESC, challenge_id DESC LIMIT ?`, data.playerId, data.beforeTime, data.beforeTime, data.beforeId, data.limit + 1).toArray();
        const page = rows.slice(0, data.limit); const last = page.at(-1); return json({ challenges: page.map((row) => JSON.parse(row.summary)), nextCursor: rows.length > data.limit ? `${last.last_activity_at}:${JSON.parse(last.summary).challengeId}` : null });
      }
      // Joining frees the creator's open-challenge slot. Row deletes are idempotent, so later releases on completion, abandon or expiry are no-ops.
      if (url.pathname === "/consume-invite") { this.ctx.storage.transactionSync(() => { sql.exec("DELETE FROM invitations WHERE match_id = ?", data.matchId); sql.exec("DELETE FROM open_matches WHERE match_id = ?", data.matchId); }); return json({ ok: true }); }
      if (url.pathname === "/release") {
        this.ctx.storage.transactionSync(() => {
          if (data.terminalStatus) sql.exec("INSERT OR REPLACE INTO invitation_tombstones SELECT credential_hash, kind, match_id, ?, ? FROM invitations WHERE match_id = ?", data.terminalStatus, now + WEEK, data.matchId);
          sql.exec("DELETE FROM open_matches WHERE match_id = ?", data.matchId); sql.exec("DELETE FROM invitations WHERE match_id = ?", data.matchId);
        }); return json({ ok: true });
      }
      if (url.pathname === "/resolve-invite") {
        sql.exec("DELETE FROM invitation_tombstones WHERE purge_at <= ?", now);
        const row = sql.exec("SELECT match_id, expires_at FROM invitations WHERE credential_hash = ? AND kind = ?", data.credential, data.kind).toArray()[0];
        if (!row) { const dead = sql.exec("SELECT match_id, terminal_status FROM invitation_tombstones WHERE credential_hash = ? AND kind = ?", data.credential, data.kind).toArray()[0]; if (dead) return json({ matchId: dead.match_id, terminalStatus: dead.terminal_status }); throw new ApiError(404, "INVITATION_NOT_FOUND", "Invitation not found."); }
        return json({ matchId: row.match_id, expired: now >= row.expires_at });
      }
      if (url.pathname === "/apply-completion") {
        const payloadHash = await hmac(this.env.PAIR_KEY || this.env.SERVER_SECRET, JSON.stringify(data)); let duplicate = false;
        this.ctx.storage.transactionSync(() => {
          const ledger = sql.exec("SELECT payload_hash FROM completion_ledger WHERE match_id = ?", data.matchId).toArray()[0];
          if (ledger) { if (ledger.payload_hash !== payloadHash) throw new ApiError(409, "COMPLETION_MISMATCH", "Completion payload does not match the applied result."); duplicate = true; return; }
          const ids = [data.players[0].playerId, data.players[1].playerId].sort(); const byId = new Map(data.players.map((p) => [p.playerId, p])); const a = byId.get(ids[0]); const b = byId.get(ids[1]); const old = sql.exec("SELECT * FROM pair_records WHERE pair_key = ?", data.pairKey).toArray()[0];
          const aw = data.winnerPlayerId === a.playerId ? 1 : 0, bw = data.winnerPlayerId === b.playerId ? 1 : 0, tie = data.winnerPlayerId ? 0 : 1;
          sql.exec("INSERT OR REPLACE INTO pair_records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", data.pairKey, a.playerId, b.playerId, a.displayName, b.displayName, (old?.played || 0) + 1, (old?.a_wins || 0) + aw, (old?.b_wins || 0) + bw, (old?.ties || 0) + tie, (old?.a_points || 0) + a.total, (old?.b_points || 0) + b.total, data.completedAt, data.matchId, now);
          sql.exec("INSERT INTO completion_ledger VALUES (?, ?, ?)", data.matchId, payloadHash, now); sql.exec("DELETE FROM open_matches WHERE match_id = ?", data.matchId);
        }); return json({ applied: true, duplicate });
      }
      if (url.pathname === "/record") { const row = sql.exec("SELECT * FROM pair_records WHERE pair_key = ?", data.pairKey).toArray()[0]; return json({ record: row || null }); }
      throw new ApiError(404, "NOT_FOUND", "Internal route not found.");
    } catch (error) { return errorResponse(error); }
  }
}

function emptyRounds() { return Array.from({ length: 5 }, (_, index) => ({ state: index ? "UNAVAILABLE" : "READY" })); }
function progress(player) { const resolved = player.rounds.filter((round) => round.result).length; return resolved === 5 ? "FINISHED" : player.rounds.some((round) => round.startedAt || round.result) ? "PLAYING" : "NOT_STARTED"; }
function total(player) { return player.rounds.reduce((sum, round) => sum + (round.result?.score || 0), 0); }
function answer(location) { return { id: location.id, short: location.short, clue: location.clue, country: location.country, fact: location.fact, image: location.image, lat: location.lat, lng: location.lng }; }
function publicResult(result) { return result.outcome === "TIMEOUT" ? { outcome: "TIMEOUT", distanceKm: null, score: 0, resolvedAt: result.resolvedAt } : { outcome: "SUBMITTED", guess: result.guess, distanceKm: result.distanceKm, score: result.score, submittedAt: result.submittedAt }; }

export class MatchRoom {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)"); }
  load() { const row = this.ctx.storage.sql.exec("SELECT value FROM meta WHERE key = 'state'").toArray()[0]; return row ? JSON.parse(row.value) : null; }
  save(state) { this.ctx.storage.sql.exec("INSERT OR REPLACE INTO meta VALUES ('state', ?)", JSON.stringify(state)); }
  async schedule(state) {
    if (!state) return; const times = [];
    if (!TERMINAL.has(state.status)) { times.push(state.expiresAt); for (const player of state.players) for (const round of player.rounds) if (round.acceptUntil && !round.result) times.push(round.acceptUntil + 1); }
    if (state.recordsWriteState === "RETRY") times.push(state.recordsRetryAt); if (state.purgeAt) times.push(state.purgeAt);
    const future = times.filter((time) => time > Date.now()); if (future.length) await this.ctx.storage.setAlarm(Math.min(...future));
  }
  participant(state, auth) { const player = state.players.find((item) => item.playerId === auth.playerId); if (!player) throw new ApiError(403, "FORBIDDEN", "You are not a participant in this match."); if (player.tokenHash !== auth.tokenHash) throw new ApiError(401, "UNAUTHORIZED", "A valid player token is required."); return player; }
  unlockNext(player) { const count = player.rounds.filter((round) => round.result).length; if (count < 5 && !player.rounds[count].startedAt) player.rounds[count].state = "READY"; }
  finishResult(state) {
    const totals = state.players.map((player) => ({ role: player.role, playerId: player.playerId, total: total(player) })); const [a, b] = totals;
    state.result = { totals, winnerRole: a.total === b.total ? "TIE" : a.total > b.total ? a.role : b.role, margin: Math.abs(a.total - b.total), rounds: state.locations.map((location, i) => ({ round: i + 1, answer: answer(location), challengerResult: publicResult(state.players.find((p) => p.role === "CHALLENGER").rounds[i].result), inviteeResult: publicResult(state.players.find((p) => p.role === "INVITEE").rounds[i].result) })) };
  }
  compact(state) { delete state.locations; delete state.inviteHash; delete state.joinCode; delete state.result; delete state.rematch; for (const player of state.players) delete player.rounds; }
  async writeRecords(state) {
    try {
      const winner = state.result.winnerRole === "TIE" ? null : state.players.find((p) => p.role === state.result.winnerRole).playerId; const players = state.players.map((p) => ({ playerId: p.playerId, displayName: p.displayName, total: total(p) }));
      await internal(recordStub(this.env), "/apply-completion", { matchId: state.matchId, pairKey: await pairHash(this.env, players[0].playerId, players[1].playerId), players, winnerPlayerId: winner, completedAt: state.completedAt }); state.recordsWriteState = "APPLIED"; delete state.recordsRetryAt; delete state.recordsAttempts;
    } catch { state.recordsWriteState = "RETRY"; state.recordsAttempts = (state.recordsAttempts || 0) + 1; state.recordsRetryAt = Date.now() + Math.min(3600000, 1000 * 2 ** state.recordsAttempts); }
    this.save(state);
  }
  async due(state, now = Date.now()) {
    if (!state) return false; let changed = false;
    if (!TERMINAL.has(state.status) && now >= state.expiresAt) { state.status = "EXPIRED"; state.terminalAt = now; state.purgeAt = now + WEEK; this.compact(state); changed = true; await internal(recordStub(this.env), "/release", { matchId: state.matchId, terminalStatus: "EXPIRED" }).catch(() => {}); }
    if (!TERMINAL.has(state.status)) for (const player of state.players) for (const round of player.rounds) if (round.acceptUntil && !round.result && now > round.acceptUntil) { round.state = "LOCKED"; round.result = { outcome: "TIMEOUT", distanceKm: null, score: 0, resolvedAt: now }; changed = true; this.unlockNext(player); }
    if (!TERMINAL.has(state.status) && state.players.length === 2 && state.players.every((player) => progress(player) === "FINISHED")) { state.status = "COMPLETED"; state.completedAt = now; state.purgeAt = now + MONTH; state.recordsWriteState = "PENDING"; this.finishResult(state); changed = true; await internal(recordStub(this.env), "/release", { matchId: state.matchId }).catch(() => {}); }
    if (changed) this.save(state);
    if (state.status === "COMPLETED" && (state.recordsWriteState === "PENDING" || (state.recordsWriteState === "RETRY" && now >= state.recordsRetryAt))) await this.writeRecords(state);
    await this.schedule(this.load()); return changed;
  }
  stateView(state, viewer) {
    const opponent = state.players.find((p) => p !== viewer); const completed = state.status === "COMPLETED";
    const players = state.players.map((player) => ({ role: player.role, playerId: player.playerId, displayName: player.displayName, displaySuffix: suffix(player.playerId), ...(player.rounds ? { progress: progress(player), resolvedRounds: player.rounds.filter((r) => r.result).length } : {}), visibleTotal: player === viewer || completed ? (player.rounds ? total(player) : null) : null }));
    const rounds = viewer.rounds ? viewer.rounds.map((round, i) => {
      if (round.result) return { round: i + 1, viewerResult: publicResult(round.result), answer: answer(state.locations[i]), ...(opponent?.rounds[i].result ? { opponentResult: publicResult(opponent.rounds[i].result) } : {}) };
      if (round.startedAt) return { round: i + 1, state: "STARTED", location: { id: state.locations[i].id, short: state.locations[i].short, clue: state.locations[i].clue }, startedAt: round.startedAt, deadlineAt: round.deadlineAt, acceptUntil: round.acceptUntil };
      return { round: i + 1, state: round.state };
    }) : [];
    const next = viewer.rounds ? viewer.rounds.findIndex((round) => !round.result) + 1 : null;
    return { matchId: state.matchId, status: state.status, role: viewer.role, createdAt: state.createdAt, expiresAt: state.expiresAt, catalogVersion: state.catalogVersion, rulesVersion: state.rulesVersion, players, viewer: { nextRound: next || null, ...(viewer.rounds ? { progress: progress(viewer), total: total(viewer) } : {}) }, rounds, result: state.result || null, ...(state.recordsWriteState === "RETRY" ? { recordUpdatePending: true } : {}) };
  }
  async fetch(request) {
    try {
      const url = new URL(request.url); const data = await request.json(); let state = this.load();
      if (url.pathname === "/init") { if (state) throw new ApiError(409, "MATCH_EXISTS", "Match already exists."); state = { ...data, rulesVersion: 1, status: "OPEN", players: [{ ...data.challenger, role: "CHALLENGER", rounds: emptyRounds() }], recordsWriteState: null }; delete state.challenger; this.save(state); await this.schedule(state); return json({ ok: true }); }
      if (!state?.matchId) throw new ApiError(404, "MATCH_NOT_FOUND", "Match not found."); await this.due(state); state = this.load();
      if (url.pathname === "/invite-preview") { if (state.status === "EXPIRED") throw new ApiError(410, "INVITATION_EXPIRED", "The invitation has expired."); if (state.status !== "OPEN") throw new ApiError(404, "INVITATION_NOT_FOUND", "Invitation not found."); const p = state.players[0]; return json({ matchId: state.matchId, challenger: { displayName: p.displayName, displaySuffix: suffix(p.playerId) }, expiresAt: state.expiresAt, rules: { rounds: 5, roundSeconds: 20, maximumScore: 5000 } }); }
      const auth = data.auth; if (!auth) throw new ApiError(401, "UNAUTHORIZED", "Authentication is required.");
      if (url.pathname === "/join") {
        if (state.status === "EXPIRED") throw new ApiError(410, "MATCH_EXPIRED", "The match has expired."); if (state.status === "ABANDONED") throw new ApiError(410, "MATCH_ABANDONED", "The match was abandoned."); if (auth.playerId === state.players[0].playerId) throw new ApiError(409, "SELF_CHALLENGE", "You cannot join your own challenge.");
        if (state.players[1]) { if (state.players[1].playerId !== auth.playerId || state.players[1].tokenHash !== auth.tokenHash) throw new ApiError(409, "SEAT_TAKEN", "The invitee seat is already taken."); await internal(recordStub(this.env), "/consume-invite", { matchId: state.matchId }).catch(() => {}); return json({ matchId: state.matchId, status: "ACTIVE", role: "INVITEE", joinedAt: state.players[1].joinedAt, expiresAt: state.expiresAt }); }
        if ((data.kind === "TOKEN" && data.credential !== state.inviteHash) || (data.kind === "CODE" && data.credential !== state.joinCode)) throw new ApiError(404, "INVITATION_NOT_FOUND", "Invitation not found.");
        state.players.push({ ...auth, displayName: data.displayName, role: "INVITEE", joinedAt: Date.now(), rounds: emptyRounds() }); state.status = "ACTIVE"; delete state.inviteHash; delete state.joinCode; this.save(state); await internal(recordStub(this.env), "/consume-invite", { matchId: state.matchId });
        if (state.rematchOf) await internal(matchStub(this.env, state.rematchOf), "/rematch-claimed", { auth }).catch(() => {});
        await this.schedule(state); return json({ matchId: state.matchId, status: "ACTIVE", role: "INVITEE", joinedAt: state.players[1].joinedAt, expiresAt: state.expiresAt });
      }
      if (url.pathname === "/join-retry") {
        if (auth.playerId === state.players[0].playerId) throw new ApiError(409, "SELF_CHALLENGE", "You cannot join your own challenge.");
        if (state.players[1]?.playerId === auth.playerId && state.players[1].tokenHash === auth.tokenHash) return json({ matchId: state.matchId, status: "ACTIVE", role: "INVITEE", joinedAt: state.players[1].joinedAt, expiresAt: state.expiresAt });
        if (state.players[1]) throw new ApiError(409, "SEAT_TAKEN", "The invitee seat is already taken.");
        throw new ApiError(404, "INVITATION_NOT_FOUND", "Invitation not found.");
      }
      const player = this.participant(state, auth);
      if (url.pathname === "/state") return json(this.stateView(state, player));
      const start = url.pathname.match(/^\/start\/(\d)$/);
      if (start) {
        if (state.status === "EXPIRED") throw new ApiError(410, "MATCH_EXPIRED", "The match has expired."); if (TERMINAL.has(state.status)) throw new ApiError(409, "MATCH_TERMINAL", "The match is terminal."); const index = Number(start[1]) - 1, round = player.rounds[index]; if (!round) throw new ApiError(400, "INVALID_REQUEST", "Round must be 1 through 5."); if (round.result) throw new ApiError(409, "ROUND_ALREADY_RESOLVED", "The round is already resolved.");
        const prompt = { id: state.locations[index].id, short: state.locations[index].short, clue: state.locations[index].clue };
        if (round.startedAt) return json({ round: index + 1, location: prompt, startedAt: round.startedAt, deadlineAt: round.deadlineAt, acceptUntil: round.acceptUntil, serverNow: Date.now() }); if (round.state !== "READY") throw new ApiError(409, "ROUND_SEQUENCE", "Rounds must be played in sequence.");
        const now = Date.now(); Object.assign(round, { state: "STARTED", startedAt: now, deadlineAt: now + 20000, acceptUntil: now + 22000 }); this.save(state); await this.schedule(state); return json({ round: index + 1, location: prompt, startedAt: now, deadlineAt: now + 20000, acceptUntil: now + 22000, serverNow: now });
      }
      const submission = url.pathname.match(/^\/submission\/(\d)$/);
      if (submission) {
        if (state.status === "EXPIRED") throw new ApiError(410, "MATCH_EXPIRED", "The match has expired."); if (TERMINAL.has(state.status)) throw new ApiError(409, "MATCH_TERMINAL", "The match is terminal."); const index = Number(submission[1]) - 1, round = player.rounds[index]; if (!round) throw new ApiError(400, "INVALID_REQUEST", "Round must be 1 through 5.");
        if (round.result) { if (round.submissionId === data.submissionId) return json(round.response); if (round.result.outcome === "TIMEOUT") throw new ApiError(409, "ROUND_LATE", "The round deadline has passed.", { round: index + 1, outcome: "TIMEOUT" }); throw new ApiError(409, "ROUND_ALREADY_RESOLVED", "The round is already resolved."); } if (!round.startedAt) throw new ApiError(409, "ROUND_NOT_STARTED", "Start the round before submitting."); if (Date.now() > round.acceptUntil) { await this.due(state); throw new ApiError(409, "ROUND_LATE", "The round deadline has passed.", { round: index + 1, outcome: "TIMEOUT" }); }
        const guess = data.guess; if (!guess || typeof guess !== "object" || Array.isArray(guess) || Object.keys(guess).some((k) => !["lat", "lng"].includes(k)) || typeof guess.lat !== "number" || typeof guess.lng !== "number" || !Number.isFinite(guess.lat) || !Number.isFinite(guess.lng) || guess.lat < -90 || guess.lat > 90 || guess.lng < -180 || guess.lng > 180) throw new ApiError(422, "INVALID_COORDINATES", "Guess coordinates are invalid."); if (typeof data.submissionId !== "string" || data.submissionId.length < 8 || data.submissionId.length > 128) throw new ApiError(400, "INVALID_REQUEST", "submissionId is invalid.");
        const scored = scoreCoordinates(guess, state.locations[index]); const now = Date.now(); round.state = "LOCKED"; round.submissionId = data.submissionId; round.result = { outcome: "SUBMITTED", guess, distanceKm: scored.distanceKm, score: scored.score, submittedAt: now }; this.unlockNext(player); this.save(state); await this.due(state); state = this.load();
        const opponent = state.players.find((p) => p.playerId !== player.playerId); const response = { round: index + 1, outcome: "SUBMITTED", answer: answer(state.locations[index]), viewerResult: { guess, distanceKm: scored.distanceKm, score: scored.score, submittedAt: now }, ...(opponent?.rounds[index].result ? { opponentResult: publicResult(opponent.rounds[index].result) } : {}), matchStatus: state.status, nextRound: index < 4 ? index + 2 : null, ...(state.result ? { result: state.result } : {}), ...(state.recordsWriteState === "RETRY" ? { recordUpdatePending: true } : {}) };
        state.players.find((p) => p.playerId === player.playerId).rounds[index].response = response; this.save(state); return json(response);
      }
      if (url.pathname === "/abandon") {
        if (state.status === "EXPIRED") throw new ApiError(410, "MATCH_EXPIRED", "The match has expired."); if (state.status === "COMPLETED") throw new ApiError(409, "MATCH_COMPLETED", "The match is complete."); if (state.status === "ABANDONED") { if (state.abandonedBy === player.playerId) return json({ status: "ABANDONED", abandonedAt: state.terminalAt }); throw new ApiError(410, "MATCH_ABANDONED", "The match was abandoned."); }
        state.status = "ABANDONED"; state.abandonedBy = player.playerId; state.abandonReason = data.reason; state.terminalAt = Date.now(); state.purgeAt = state.terminalAt + WEEK; this.compact(state); this.save(state); await internal(recordStub(this.env), "/release", { matchId: state.matchId, terminalStatus: "ABANDONED" }); await this.schedule(state); return json({ status: "ABANDONED", abandonedAt: state.terminalAt });
      }
      if (url.pathname === "/rematch-reserve") {
        if (state.status !== "COMPLETED") throw new ApiError(409, "MATCH_NOT_COMPLETED", "The source match is not complete."); if (state.rematch?.response) return json({ existing: true, response: state.rematch.response, creatorId: state.rematch.creatorId }); if (state.rematch?.reservedAt && Date.now() - state.rematch.reservedAt < 60000) throw new ApiError(409, "REMATCH_PENDING", "A rematch is being created.");
        const previous = state.series || { seriesId: state.matchId, completedGames: 0, players: state.players.map((p) => ({ playerId: p.playerId, wins: 0 })), ties: 0 };
        const players = previous.players.map((entry) => ({ ...entry, wins: entry.wins + (state.result.winnerRole !== "TIE" && state.players.find((p) => p.playerId === entry.playerId)?.role === state.result.winnerRole ? 1 : 0) }));
        state.rematch = { creatorId: player.playerId, reservedAt: Date.now() }; this.save(state); return json({ existing: false, excluded: state.locations.map((l) => l.id), seriesId: previous.seriesId, completedGames: previous.completedGames + 1, players, ties: previous.ties + (state.result.winnerRole === "TIE" ? 1 : 0) });
      }
      if (url.pathname === "/rematch-finalize") { if (state.rematch?.creatorId !== auth.playerId) throw new ApiError(409, "REMATCH_EXISTS", "A rematch already exists."); state.rematch.response = data.response; this.save(state); return json({ ok: true }); }
      if (url.pathname === "/rematch-claimed") { if (state.rematch?.response) { delete state.rematch.response.shareUrl; delete state.rematch.response.joinCode; state.rematch.claimed = true; this.save(state); } return json({ ok: true }); }
      if (url.pathname === "/rematch-clear") { if (state.rematch?.creatorId === auth.playerId && !state.rematch.response) delete state.rematch; this.save(state); return json({ ok: true }); }
      throw new ApiError(404, "NOT_FOUND", "Route not found.");
    } catch (error) { return errorResponse(error); }
  }
  async alarm() { const state = this.load(); if (!state) return; if (state.purgeAt && Date.now() >= state.purgeAt && state.recordsWriteState !== "RETRY") { await this.ctx.storage.deleteAll(); return; } await this.due(state); const latest = this.load(); if (latest?.purgeAt && Date.now() >= latest.purgeAt && latest.recordsWriteState !== "RETRY") { await this.ctx.storage.deleteAll(); return; } await this.schedule(latest); }
}

async function createMatch(env, auth, name, rematch = {}) {
  const matchId = env.MATCHES.newUniqueId().toString(); const inviteToken = random(32); const inviteHash = await hmac(env.INVITE_KEY || env.SERVER_SECRET, inviteToken); const code = joinCode(); const now = Date.now(); const expiresAt = now + WEEK; const selected = chooseLocations(rematch.excluded);
  await internal(recordStub(env), "/reserve", { playerId: auth.playerId, matchId, expiresAt, inviteHash, joinCode: code });
  try { await internal(matchStub(env, matchId), "/init", { matchId, catalogVersion: CATALOG_VERSION, createdAt: now, expiresAt, joinCode: code, inviteHash, locations: selected.locations, countryFallback: selected.countryFallback, challenger: { playerId: auth.playerId, tokenHash: auth.tokenHash, displayName: name }, ...rematch }); } catch (error) { await internal(recordStub(env), "/release", { matchId }).catch(() => {}); throw error; }
  return { matchId, status: "OPEN", role: "CHALLENGER", joinCode: code, shareUrl: shareUrl(env, inviteToken), rules: RULES, catalogVersion: CATALOG_VERSION, createdAt: now, expiresAt, ...(rematch.rematchOf ? { rematchOf: rematch.rematchOf, series: rematch.series } : {}) };
}

async function createGroup(env, auth, name) {
  const id = env.GROUPS.newUniqueId(); const challengeId = id.toString(); const inviteToken = random(32); const inviteHash = await hmac(env.INVITE_KEY || env.SERVER_SECRET, inviteToken); const code = joinCode(); const now = Date.now(); const expiresAt = now + WEEK; const selected = chooseLocations();
  const stub = env.GROUPS.get(id);
  try {
    await internal(stub, "/init", { challengeId, catalogVersion: CATALOG_VERSION, createdAt: now, expiresAt, joinCode: code, inviteHash, locations: selected.locations, countryFallback: selected.countryFallback, creator: { playerId: auth.playerId, tokenHash: auth.tokenHash, displayName: name } });
    await internal(recordStub(env), "/group-reserve", { playerId: auth.playerId, challengeId, expiresAt, inviteHash, joinCode: code });
    await internal(stub, "/reserved");
  } catch (error) { await internal(recordStub(env), "/group-release", { challengeId }).catch(() => {}); throw error; }
  return { challengeId, status: "OPEN", role: "CREATOR", joinCode: code, shareUrl: groupShareUrl(env, inviteToken), rules: { ...RULES, participantCap: 50 }, catalogVersion: CATALOG_VERSION, createdAt: now, expiresAt };
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env); const cors = corsHeaders(origin || null);
    try {
      if (origin === false) throw new ApiError(403, "ORIGIN_NOT_ALLOWED", "This origin is not allowed."); if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors }); const url = new URL(request.url);
      if (url.pathname === "/health" && request.method === "GET") return json({ ok: true, service: "woe-pvp", apiVersion: 1 }, 200, cors);
      if (url.pathname === "/v1/players" && request.method === "POST") { await rateLimit(request, env, "players", 10, 3600); const data = await body(request, ["displayName"], ["displayName"]); const name = displayName(data.displayName); const playerId = `plr_${random(18)}`; const playerToken = random(32); const createdAt = Date.now(); await internal(recordStub(env), "/player", { playerId, tokenHash: await authHash(env, playerToken), createdAt, displayName: name }); return json({ playerId, playerToken, displayName: name, createdAt }, 201, cors); }
      if (url.pathname === "/v1/group-challenges" && request.method === "POST") { if (env.PVP_ENABLED === "0") throw new ApiError(503, "SERVICE_DISABLED", "Challenge creation is temporarily disabled."); const auth = await authenticateAndRate(request, env, "group-create", 10, 3600); const data = await body(request, ["displayName", "clientVersion"], ["displayName", "clientVersion"]); const name = displayName(data.displayName); if (typeof data.clientVersion !== "string" || !data.clientVersion || data.clientVersion.length > 64) throw new ApiError(400, "INVALID_REQUEST", "clientVersion is required."); await internal(recordStub(env), "/name", { playerId: auth.playerId, displayName: name }); return json(await createGroup(env, auth, name), 201, cors); }
      if (url.pathname === "/v1/group-invitations/inspect" && request.method === "POST") { const data = await body(request, ["inviteToken", "joinCode"]); if (!!data.inviteToken === !!data.joinCode) throw new ApiError(400, "INVALID_REQUEST", "Supply exactly one invitation credential."); const kind = data.inviteToken ? "TOKEN" : "CODE"; const credential = kind === "TOKEN" ? await hmac(env.INVITE_KEY || env.SERVER_SECRET, data.inviteToken) : String(data.joinCode).toUpperCase(); await rateLimit(request, env, "group-inspect", 12, 60, credential); const found = await internal(recordStub(env), "/group-resolve-invite", { kind, credential }); if (found.expired || found.terminalStatus === "EXPIRED") throw new ApiError(410, "INVITATION_EXPIRED", "The invitation has expired."); return json(await internal(groupStub(env, found.challengeId), "/invite-preview"), 200, cors); }
      if (url.pathname === "/v1/group-challenges" && request.method === "GET") { const auth = await authenticateAndRate(request, env, "group-list", 60, 60); const scope = url.searchParams.get("scope") || "mine"; if (!['mine', 'created'].includes(scope)) throw new ApiError(400, "INVALID_REQUEST", "scope must be mine or created."); const limitText = url.searchParams.get("limit") || "20"; const limit = Number(limitText); if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new ApiError(400, "INVALID_REQUEST", "limit must be 1 through 20."); let beforeTime = Number.MAX_SAFE_INTEGER, beforeId = "~"; const cursor = url.searchParams.get("cursor"); if (cursor) { try { const parsed = JSON.parse(atob(cursor.replaceAll("-", "+").replaceAll("_", "/"))); beforeTime = parsed[0]; beforeId = parsed[1]; } catch { throw new ApiError(400, "INVALID_CURSOR", "Cursor is invalid."); } if (!Number.isSafeInteger(beforeTime) || typeof beforeId !== "string") throw new ApiError(400, "INVALID_CURSOR", "Cursor is invalid."); } const result = await internal(recordStub(env), "/group-list", { playerId: auth.playerId, scope, limit, beforeTime, beforeId }); if (result.nextCursor) { const [time, ...id] = result.nextCursor.split(":"); result.nextCursor = btoa(JSON.stringify([Number(time), id.join(":")])).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); } return json(result, 200, cors); }
      const groupJoin = url.pathname.match(/^\/v1\/group-challenges\/([^/]+)\/join$/);
      if (groupJoin && request.method === "POST") { const auth = await authenticate(request, env); const data = await body(request, ["inviteToken", "joinCode", "displayName", "clientVersion"], ["displayName", "clientVersion"]); if (typeof data.clientVersion !== "string" || !data.clientVersion || data.clientVersion.length > 64) throw new ApiError(400, "INVALID_REQUEST", "clientVersion is required."); if (!!data.inviteToken === !!data.joinCode) throw new ApiError(400, "INVALID_REQUEST", "Supply exactly one invitation credential."); const kind = data.inviteToken ? "TOKEN" : "CODE"; const credential = kind === "TOKEN" ? await hmac(env.INVITE_KEY || env.SERVER_SECRET, data.inviteToken) : String(data.joinCode).toUpperCase(); await rateLimit(request, env, "group-join", 12, 60, credential); let found; try { found = await internal(recordStub(env), "/group-resolve-invite", { kind, credential }); } catch (error) { if (!(error instanceof ApiError) || error.code !== "INVITATION_NOT_FOUND") throw error; } if (found && found.challengeId !== groupJoin[1]) throw new ApiError(404, "INVITATION_NOT_FOUND", "Invitation not found."); const name = displayName(data.displayName); const result = await internal(groupStub(env, groupJoin[1]), "/join", { auth, kind, credential, displayName: name }); await internal(recordStub(env), "/name", { playerId: auth.playerId, displayName: name }); return json(result, 200, cors); }
      const groupState = url.pathname.match(/^\/v1\/group-challenges\/([^/]+)$/);
      if (groupState && request.method === "GET") { const auth = await authenticateAndRate(request, env, "group-state", 120, 60); return json(await internal(groupStub(env, groupState[1]), "/state", { auth }), 200, cors); }
      const groupStart = url.pathname.match(/^\/v1\/group-challenges\/([^/]+)\/rounds\/(\d+)\/start$/);
      if (groupStart && request.method === "POST") { const auth = await authenticateAndRate(request, env, "group-start", 20, 60); await body(request, []); return json(await internal(groupStub(env, groupStart[1]), `/start/${groupStart[2]}`, { auth }), 200, cors); }
      const groupSubmit = url.pathname.match(/^\/v1\/group-challenges\/([^/]+)\/rounds\/(\d+)\/submission$/);
      if (groupSubmit && request.method === "PUT") { const auth = await authenticateAndRate(request, env, "group-submission", 30, 60); const data = await body(request, ["submissionId", "guess"], ["submissionId", "guess"]); return json(await internal(groupStub(env, groupSubmit[1]), `/submission/${groupSubmit[2]}`, { auth, ...data }), 200, cors); }
      const groupResults = url.pathname.match(/^\/v1\/group-challenges\/([^/]+)\/rounds\/(\d+)\/results$/);
      if (groupResults && request.method === "GET") { const auth = await authenticateAndRate(request, env, "group-results", 60, 60); const limit = url.searchParams.get("limit") || "25"; const cursor = url.searchParams.get("cursor") || null; return json(await internal(groupStub(env, groupResults[1]), `/results/${groupResults[2]}`, { auth, limit, cursor }), 200, cors); }
      const groupClose = url.pathname.match(/^\/v1\/group-challenges\/([^/]+)\/close$/);
      if (groupClose && request.method === "POST") { const auth = await authenticateAndRate(request, env, "group-close", 10, 60); await body(request, []); return json(await internal(groupStub(env, groupClose[1]), "/close", { auth }), 200, cors); }
      if (url.pathname === "/v1/matches" && request.method === "POST") { if (env.PVP_ENABLED === "0") throw new ApiError(503, "SERVICE_DISABLED", "Challenge creation is temporarily disabled."); const auth = await authenticateAndRate(request, env, "create", 10, 3600); const data = await body(request, ["displayName", "clientVersion"], ["displayName", "clientVersion"]); const name = displayName(data.displayName); if (typeof data.clientVersion !== "string" || !data.clientVersion || data.clientVersion.length > 64) throw new ApiError(400, "INVALID_REQUEST", "clientVersion is required."); await internal(recordStub(env), "/name", { playerId: auth.playerId, displayName: name }); return json(await createMatch(env, auth, name), 201, cors); }
      if (url.pathname === "/v1/invitations/inspect" && request.method === "POST") { const data = await body(request, ["inviteToken", "joinCode"]); if (!!data.inviteToken === !!data.joinCode) throw new ApiError(400, "INVALID_REQUEST", "Supply exactly one invitation credential."); const kind = data.inviteToken ? "TOKEN" : "CODE"; const credential = kind === "TOKEN" ? await hmac(env.INVITE_KEY || env.SERVER_SECRET, data.inviteToken) : String(data.joinCode).toUpperCase(); await rateLimit(request, env, "inspect", 12, 60, credential); const found = await internal(recordStub(env), "/resolve-invite", { kind, credential }); if (found.expired || found.terminalStatus === "EXPIRED") throw new ApiError(410, "INVITATION_EXPIRED", "The invitation has expired."); if (found.terminalStatus) throw new ApiError(404, "INVITATION_NOT_FOUND", "Invitation not found."); return json(await internal(matchStub(env, found.matchId), "/invite-preview"), 200, cors); }
      const join = url.pathname.match(/^\/v1\/matches\/([^/]+)\/join$/);
      if (join && request.method === "POST") {
        const auth = await authenticate(request, env); const data = await body(request, ["inviteToken", "joinCode", "displayName", "clientVersion"], ["displayName", "clientVersion"]); if (typeof data.clientVersion !== "string" || !data.clientVersion || data.clientVersion.length > 64) throw new ApiError(400, "INVALID_REQUEST", "clientVersion is required."); if (!!data.inviteToken === !!data.joinCode) throw new ApiError(400, "INVALID_REQUEST", "Supply exactly one invitation credential."); const kind = data.inviteToken ? "TOKEN" : "CODE"; const credential = kind === "TOKEN" ? await hmac(env.INVITE_KEY || env.SERVER_SECRET, data.inviteToken) : String(data.joinCode).toUpperCase(); await rateLimit(request, env, "join", 12, 60, credential);
        let found;
        try { found = await internal(recordStub(env), "/resolve-invite", { kind, credential }); } catch (error) { if (!(error instanceof ApiError) || error.code !== "INVITATION_NOT_FOUND") throw error; }
        if (found && found.matchId !== join[1]) throw new ApiError(404, "INVITATION_NOT_FOUND", "Invitation not found.");
        const name = displayName(data.displayName); const path = found ? "/join" : "/join-retry"; const result = await internal(matchStub(env, join[1]), path, { auth, kind, credential, displayName: name }); await internal(recordStub(env), "/name", { playerId: auth.playerId, displayName: name }); return json(result, 200, cors);
      }
      const state = url.pathname.match(/^\/v1\/matches\/([^/]+)$/);
      if (state && request.method === "GET") { const auth = await authenticateAndRate(request, env, "state", 120, 60); return json(await internal(matchStub(env, state[1]), "/state", { auth }), 200, cors); }
      const start = url.pathname.match(/^\/v1\/matches\/([^/]+)\/rounds\/(\d+)\/start$/);
      if (start && request.method === "POST") { const auth = await authenticateAndRate(request, env, "start", 20, 60); await body(request, []); return json(await internal(matchStub(env, start[1]), `/start/${start[2]}`, { auth }), 200, cors); }
      const submit = url.pathname.match(/^\/v1\/matches\/([^/]+)\/rounds\/(\d+)\/submission$/);
      if (submit && request.method === "PUT") { const auth = await authenticateAndRate(request, env, "submission", 30, 60); const data = await body(request, ["submissionId", "guess"], ["submissionId", "guess"]); return json(await internal(matchStub(env, submit[1]), `/submission/${submit[2]}`, { auth, ...data }), 200, cors); }
      const abandon = url.pathname.match(/^\/v1\/matches\/([^/]+)\/abandon$/);
      if (abandon && request.method === "POST") { const auth = await authenticate(request, env); const data = await body(request, ["reason"], ["reason"]); if (data.reason !== "PLAYER_LEFT") throw new ApiError(400, "INVALID_REQUEST", "reason must be PLAYER_LEFT."); return json(await internal(matchStub(env, abandon[1]), "/abandon", { auth, reason: data.reason }), 200, cors); }
      const rematch = url.pathname.match(/^\/v1\/matches\/([^/]+)\/rematches$/);
      if (rematch && request.method === "POST") {
        if (env.PVP_ENABLED === "0") throw new ApiError(503, "SERVICE_DISABLED", "Challenge creation is temporarily disabled."); const auth = await authenticateAndRate(request, env, "create", 10, 3600); const data = await body(request, ["displayName", "clientVersion"], ["displayName", "clientVersion"]); if (typeof data.clientVersion !== "string" || !data.clientVersion || data.clientVersion.length > 64) throw new ApiError(400, "INVALID_REQUEST", "clientVersion is required."); const name = displayName(data.displayName); const source = matchStub(env, rematch[1]); const reservation = await internal(source, "/rematch-reserve", { auth });
        if (reservation.existing) {
          if (reservation.creatorId !== auth.playerId) { try { await internal(matchStub(env, reservation.response.matchId), "/invite-preview"); } catch { throw new ApiError(409, "REMATCH_EXISTS", "A rematch already exists.", { matchId: reservation.response.matchId }); } }
          return json(reservation.response, 200, cors);
        }
        try {
          const framed = reservation.completedGames < 3;
          const series = framed ? { seriesId: reservation.seriesId, completedGames: reservation.completedGames, players: reservation.players, ties: reservation.ties, label: reservation.completedGames === 2 && reservation.players.every((p) => p.wins === 1) ? "Decider" : "Rematch" } : undefined;
          const lineage = framed ? { seriesId: reservation.seriesId, seriesCompletedGames: reservation.completedGames, series } : {};
          const response = await createMatch(env, auth, name, { rematchOf: rematch[1], excluded: reservation.excluded, ...lineage }); await internal(source, "/rematch-finalize", { auth, response }); return json(response, 201, cors);
        } catch (error) { await internal(source, "/rematch-clear", { auth }).catch(() => {}); throw error; }
      }
      const record = url.pathname.match(/^\/v1\/records\/([^/]+)$/);
      if (record && request.method === "GET") { const auth = await authenticate(request, env); if (record[1] === auth.playerId) throw new ApiError(400, "SELF_RECORD", "You cannot request a record against yourself."); const found = (await internal(recordStub(env), "/record", { pairKey: await pairHash(env, auth.playerId, record[1]) })).record; if (!found) return json({ opponent: { playerId: record[1] }, record: null }, 200, cors); const callerA = found.player_a_id === auth.playerId; const opponentId = callerA ? found.player_b_id : found.player_a_id; return json({ opponent: { playerId: opponentId, displayNameLastSeen: callerA ? found.player_b_name : found.player_a_name, displaySuffix: suffix(opponentId) }, record: { played: found.played, wins: callerA ? found.a_wins : found.b_wins, losses: callerA ? found.b_wins : found.a_wins, ties: found.ties, pointsFor: callerA ? found.a_points : found.b_points, pointsAgainst: callerA ? found.b_points : found.a_points, lastPlayedAt: found.last_played_at, lastMatchId: found.last_match_id } }, 200, cors); }
      throw new ApiError(404, "NOT_FOUND", "Route not found.");
    } catch (error) { const response = errorResponse(error, cors); if (error instanceof ApiError && error.code === "RATE_LIMITED") response.headers.set("retry-after", String(error.details.retryAfter)); return response; }
  },
};
