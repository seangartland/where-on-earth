import { scoreCoordinates } from "./scoring.js";

const WEEK = 7 * 86400000;
const PARTICIPANT_CAP = 50;

class ApiError extends Error {
  constructor(status, code, message, details) { super(message); Object.assign(this, { status, code, details }); }
}
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }); }
function errorResponse(error) {
  const known = error instanceof ApiError;
  return json({ error: { code: known ? error.code : "INTERNAL_ERROR", message: known ? error.message : "The service could not complete the request.", ...(known && error.details ? { details: error.details } : {}) } }, known ? error.status : 500);
}
function recordStub(env) { return env.RECORDS.get(env.RECORDS.idFromName("global")); }
async function internal(stub, path, payload = {}) {
  const response = await stub.fetch(`https://internal${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) throw new ApiError(response.status, data.error.code, data.error.message, data.error.details);
  return data;
}
function emptyRounds() { return Array.from({ length: 5 }, (_, index) => ({ state: index ? "UNAVAILABLE" : "READY" })); }
function resolvedRounds(player) { return player.rounds ? player.rounds.filter((round) => round.result).length : player.resolvedRounds; }
function total(player) { return player.rounds ? player.rounds.reduce((sum, round) => sum + (round.result?.score || 0), 0) : player.total; }
function progress(player, expired = false) {
  const resolved = resolvedRounds(player);
  if (resolved === 5) return "FINISHED";
  if (expired) return "EXPIRED_BEFORE_FINISHING";
  return player.rounds?.some((round) => round.startedAt || round.result) ? "PLAYING" : "NOT_STARTED";
}
function answer(location) { return { id: location.id, short: location.short, clue: location.clue, country: location.country, fact: location.fact, image: location.image, lat: location.lat, lng: location.lng }; }
function publicResult(result) { return result.outcome === "TIMEOUT" ? { outcome: "TIMEOUT", distanceKm: null, score: 0, resolvedAt: result.resolvedAt } : { outcome: "SUBMITTED", guess: result.guess, distanceKm: result.distanceKm, score: result.score, submittedAt: result.submittedAt }; }
function leaderboard(state) {
  const finished = state.participants.filter((player) => resolvedRounds(player) === 5).sort((a, b) => total(b) - total(a) || a.finishedAt - b.finishedAt || a.joinedAt - b.joinedAt || a.playerId.localeCompare(b.playerId));
  const finishers = finished.map((player, index) => ({ rank: index && total(player) === total(finished[index - 1]) ? undefined : index + 1, playerId: player.playerId, displayName: player.displayName, displaySuffix: player.displaySuffix, role: player.role, total: total(player), resolvedRounds: 5, finishedAt: player.finishedAt }));
  for (let i = 0; i < finishers.length; i++) if (finishers[i].rank === undefined) finishers[i].rank = finishers[i - 1].rank;
  const inProgress = state.participants.filter((player) => resolvedRounds(player) < 5).sort((a, b) => a.joinedAt - b.joinedAt).map((player) => ({ rank: null, playerId: player.playerId, displayName: player.displayName, displaySuffix: player.displaySuffix, role: player.role, total: total(player), resolvedRounds: resolvedRounds(player), progress: progress(player, state.status === "EXPIRED") }));
  return { finishers, inProgress };
}

export class GroupChallengeRoom {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)"); }
  load() { const row = this.ctx.storage.sql.exec("SELECT value FROM meta WHERE key = 'state'").toArray()[0]; return row ? JSON.parse(row.value) : null; }
  save(state) { this.ctx.storage.sql.exec("INSERT OR REPLACE INTO meta VALUES ('state', ?)", JSON.stringify(state)); }
  participant(state, auth) {
    const player = state.participants.find((item) => item.playerId === auth.playerId);
    if (!player) throw new ApiError(403, "FORBIDDEN", "You are not a participant in this challenge.");
    if (player.tokenHash && player.tokenHash !== auth.tokenHash) throw new ApiError(401, "UNAUTHORIZED", "A valid player token is required.");
    return player;
  }
  unlockNext(player) { const count = resolvedRounds(player); if (count < 5 && !player.rounds[count].startedAt) player.rounds[count].state = "READY"; if (count === 5 && !player.finishedAt) player.finishedAt = Date.now(); }
  summary(state, player) {
    const board = leaderboard(state); const ranked = board.finishers.find((row) => row.playerId === player.playerId);
    return { challengeId: state.challengeId, creator: { displayName: state.participants[0].displayName, displaySuffix: state.participants[0].displaySuffix }, role: player.role, progress: progress(player, state.status === "EXPIRED"), status: state.status, total: total(player), participantCount: state.participants.length, finishedCount: board.finishers.length, rank: ranked?.rank || null, createdAt: state.createdAt, expiresAt: state.expiresAt, lastActivityAt: state.lastActivityAt };
  }
  async syncMemberships(state) {
    await Promise.all(state.participants.map((player) => internal(recordStub(this.env), "/group-membership-upsert", { playerId: player.playerId, challengeId: state.challengeId, role: player.role, summary: this.summary(state, player), lastActivityAt: state.lastActivityAt }).catch(() => {})));
  }
  async schedule(state) {
    if (!state) return; const times = [];
    if (state.status !== "EXPIRED") { times.push(state.expiresAt); if (state.participants[0]?.rounds) for (const player of state.participants) for (const round of player.rounds) if (round.acceptUntil && !round.result) times.push(round.acceptUntil + 1); }
    if (state.purgeAt) times.push(state.purgeAt); const future = times.filter((time) => time > Date.now()); if (future.length) await this.ctx.storage.setAlarm(Math.min(...future));
  }
  async releaseSlot(state) {
    if (state.slotReleased) return;
    try { await internal(recordStub(this.env), "/group-release-slot", { challengeId: state.challengeId }); state.slotReleased = true; this.save(state); } catch {}
  }
  async expire(state, now) {
    if (state.status === "EXPIRED") return false;
    state.status = "EXPIRED"; state.expiredAt = now; state.purgeAt = state.expiresAt + WEEK; state.lastActivityAt = now;
    const board = leaderboard(state);
    state.participants = state.participants.map((player) => ({ playerId: player.playerId, displayName: player.displayName, displaySuffix: player.displaySuffix, role: player.role, joinedAt: player.joinedAt, finishedAt: player.finishedAt || null, resolvedRounds: resolvedRounds(player), total: total(player), rank: board.finishers.find((row) => row.playerId === player.playerId)?.rank || null }));
    delete state.locations; delete state.inviteHash; delete state.joinCode; delete state.countryFallback; this.save(state);
    await internal(recordStub(this.env), "/group-release", { challengeId: state.challengeId, terminalStatus: "EXPIRED" }).catch(() => {}); await this.syncMemberships(state); return true;
  }
  async due(state, now = Date.now()) {
    if (!state) return false; if (now >= state.expiresAt) { const changed = await this.expire(state, now); await this.schedule(state); return changed; }
    let changed = false;
    for (const player of state.participants) for (const round of player.rounds) if (round.acceptUntil && !round.result && now > round.acceptUntil) { round.state = "LOCKED"; round.result = { outcome: "TIMEOUT", distanceKm: null, score: 0, resolvedAt: now }; this.unlockNext(player); changed = true; }
    if (state.status === "CLOSED" && state.participants.every((player) => progress(player) === "FINISHED")) { state.status = "SETTLED"; state.settledAt = now; await internal(recordStub(this.env), "/group-release", { challengeId: state.challengeId }).catch(() => {}); changed = true; }
    if (changed) { state.lastActivityAt = now; this.save(state); await this.syncMemberships(state); }
    await this.schedule(state); return changed;
  }
  stateView(state, viewer) {
    const board = leaderboard(state); const compact = !viewer.rounds;
    const rounds = compact ? [] : viewer.rounds.map((round, index) => {
      if (round.result) return { round: index + 1, answer: answer(state.locations[index]), viewerResult: publicResult(round.result) };
      if (round.startedAt) return { round: index + 1, state: "STARTED", location: { id: state.locations[index].id, short: state.locations[index].short, clue: state.locations[index].clue }, startedAt: round.startedAt, deadlineAt: round.deadlineAt, acceptUntil: round.acceptUntil };
      return { round: index + 1, state: round.state };
    });
    const resolved = resolvedRounds(viewer);
    return { challengeId: state.challengeId, status: state.status, role: viewer.role, createdAt: state.createdAt, expiresAt: state.expiresAt, catalogVersion: state.catalogVersion, rulesVersion: state.rulesVersion, entries: { open: state.status === "OPEN", participantCount: state.participants.length, participantCap: PARTICIPANT_CAP, closedAt: state.entriesClosedAt || null }, viewer: { progress: progress(viewer, state.status === "EXPIRED"), resolvedRounds: resolved, nextRound: resolved < 5 && state.status !== "EXPIRED" ? resolved + 1 : null, total: total(viewer) }, rounds, leaderboard: board };
  }
  async fetch(request) {
    try {
      const url = new URL(request.url); const data = await request.json(); let state = this.load();
      if (url.pathname === "/init") {
        if (state) { if (state.challengeId === data.challengeId) return json({ ok: true, duplicate: true }); throw new ApiError(409, "CHALLENGE_EXISTS", "Challenge already exists."); }
        state = { challengeId: data.challengeId, rulesVersion: 1, catalogVersion: data.catalogVersion, createdAt: data.createdAt, expiresAt: data.expiresAt, entriesClosedAt: null, entriesClosedBy: null, status: "OPEN", creatorPlayerId: data.creator.playerId, participantCap: PARTICIPANT_CAP, inviteHash: data.inviteHash, joinCode: data.joinCode, locations: data.locations, countryFallback: data.countryFallback, participants: [{ ...data.creator, displaySuffix: data.creator.playerId.replace(/[^A-Za-z0-9]/g, "").slice(-3).toUpperCase(), role: "CREATOR", joinedAt: data.createdAt, rounds: emptyRounds(), finishedAt: null }], lastActivityAt: data.createdAt, reserved: false };
        this.save(state); await this.schedule(state); return json({ ok: true });
      }
      if (!state?.challengeId) throw new ApiError(404, "CHALLENGE_NOT_FOUND", "Challenge not found."); await this.due(state); state = this.load();
      if (url.pathname === "/reserved") { state.reserved = true; this.save(state); await this.syncMemberships(state); return json({ ok: true }); }
      if (url.pathname === "/invite-preview") {
        const details = { challengeId: state.challengeId, kind: "GROUP", creator: { displayName: state.participants[0].displayName, displaySuffix: state.participants[0].displaySuffix }, status: state.status, participantCount: state.participants.length, participantCap: PARTICIPANT_CAP, expiresAt: state.expiresAt, rules: { rounds: 5, roundSeconds: 20, maximumScore: 5000 } };
        if (state.status === "EXPIRED") throw new ApiError(410, "INVITATION_EXPIRED", "The invitation has expired."); if (state.status !== "OPEN") throw new ApiError(409, "ENTRIES_CLOSED", "Entries are closed.", details); if (state.participants.length >= PARTICIPANT_CAP) throw new ApiError(409, "CHALLENGE_FULL", "The challenge is full.", details); return json(details);
      }
      const auth = data.auth; if (!auth) throw new ApiError(401, "UNAUTHORIZED", "Authentication is required.");
      if (url.pathname === "/join") {
        const existing = state.participants.find((player) => player.playerId === auth.playerId);
        if (existing) { if (existing.tokenHash && existing.tokenHash !== auth.tokenHash) throw new ApiError(401, "UNAUTHORIZED", "A valid player token is required."); if (existing.role !== "CREATOR" && state.status === "OPEN") await this.releaseSlot(state); return json({ challengeId: state.challengeId, status: state.status, role: existing.role, joinedAt: existing.joinedAt, expiresAt: state.expiresAt }); }
        if (state.status === "EXPIRED") throw new ApiError(410, "CHALLENGE_EXPIRED", "The challenge has expired."); if (state.status !== "OPEN") throw new ApiError(409, "ENTRIES_CLOSED", "Entries are closed."); if (state.participants.length >= PARTICIPANT_CAP) throw new ApiError(409, "CHALLENGE_FULL", "The challenge is full.");
        if ((data.kind === "TOKEN" && data.credential !== state.inviteHash) || (data.kind === "CODE" && data.credential !== state.joinCode)) throw new ApiError(404, "INVITATION_NOT_FOUND", "Invitation not found.");
        const joinedAt = Date.now(); state.participants.push({ playerId: auth.playerId, tokenHash: auth.tokenHash, displayName: data.displayName, displaySuffix: auth.playerId.replace(/[^A-Za-z0-9]/g, "").slice(-3).toUpperCase(), role: "PARTICIPANT", joinedAt, rounds: emptyRounds(), finishedAt: null }); state.lastActivityAt = joinedAt; this.save(state); await this.releaseSlot(state); await this.syncMemberships(state); return json({ challengeId: state.challengeId, status: state.status, role: "PARTICIPANT", joinedAt, expiresAt: state.expiresAt });
      }
      const player = this.participant(state, auth);
      if (url.pathname === "/state") return json(this.stateView(state, player));
      if (url.pathname === "/close") {
        if (player.role !== "CREATOR") throw new ApiError(403, "CREATOR_ONLY", "Only the creator can close entries.");
        if (state.status === "OPEN") { state.entriesClosedAt = Date.now(); state.entriesClosedBy = player.playerId; state.status = state.participants.every((item) => progress(item) === "FINISHED") ? "SETTLED" : "CLOSED"; if (state.status === "SETTLED") state.settledAt = state.entriesClosedAt; state.lastActivityAt = state.entriesClosedAt; delete state.inviteHash; delete state.joinCode; this.save(state); await internal(recordStub(this.env), "/group-release", { challengeId: state.challengeId, terminalStatus: "CLOSED" }); await this.syncMemberships(state); }
        return json({ challengeId: state.challengeId, status: state.status, entriesClosedAt: state.entriesClosedAt, participantCount: state.participants.length, expiresAt: state.expiresAt });
      }
      const start = url.pathname.match(/^\/start\/(\d)$/);
      if (start) {
        if (state.status === "EXPIRED") throw new ApiError(410, "CHALLENGE_EXPIRED", "The challenge has expired."); const index = Number(start[1]) - 1, round = player.rounds[index]; if (!round) throw new ApiError(400, "INVALID_REQUEST", "Round must be 1 through 5."); if (round.result) throw new ApiError(409, "ROUND_ALREADY_RESOLVED", "The round is already resolved.");
        const location = { id: state.locations[index].id, short: state.locations[index].short, clue: state.locations[index].clue }; if (round.startedAt) return json({ round: index + 1, location, startedAt: round.startedAt, deadlineAt: round.deadlineAt, acceptUntil: round.acceptUntil, serverNow: Date.now() }); if (round.state !== "READY") throw new ApiError(409, "ROUND_SEQUENCE", "Rounds must be played in sequence.");
        const now = Date.now(); Object.assign(round, { state: "STARTED", startedAt: now, deadlineAt: now + 20000, acceptUntil: now + 22000 }); state.lastActivityAt = now; this.save(state); await this.syncMemberships(state); await this.schedule(state); return json({ round: index + 1, location, startedAt: now, deadlineAt: now + 20000, acceptUntil: now + 22000, serverNow: now });
      }
      const submission = url.pathname.match(/^\/submission\/(\d)$/);
      if (submission) {
        if (state.status === "EXPIRED") throw new ApiError(410, "CHALLENGE_EXPIRED", "The challenge has expired."); const index = Number(submission[1]) - 1, round = player.rounds[index]; if (!round) throw new ApiError(400, "INVALID_REQUEST", "Round must be 1 through 5.");
        if (round.result) { if (round.submissionId === data.submissionId) return json(round.response); if (round.result.outcome === "TIMEOUT") throw new ApiError(409, "ROUND_LATE", "The round deadline has passed.", { round: index + 1, outcome: "TIMEOUT" }); throw new ApiError(409, "ROUND_ALREADY_RESOLVED", "The round is already resolved."); } if (!round.startedAt) throw new ApiError(409, "ROUND_NOT_STARTED", "Start the round before submitting."); if (Date.now() > round.acceptUntil) { await this.due(state); throw new ApiError(409, "ROUND_LATE", "The round deadline has passed.", { round: index + 1, outcome: "TIMEOUT" }); }
        const guess = data.guess; if (!guess || typeof guess !== "object" || Array.isArray(guess) || Object.keys(guess).some((key) => !["lat", "lng"].includes(key)) || typeof guess.lat !== "number" || typeof guess.lng !== "number" || !Number.isFinite(guess.lat) || !Number.isFinite(guess.lng) || guess.lat < -90 || guess.lat > 90 || guess.lng < -180 || guess.lng > 180) throw new ApiError(422, "INVALID_COORDINATES", "Guess coordinates are invalid."); if (typeof data.submissionId !== "string" || data.submissionId.length < 8 || data.submissionId.length > 128) throw new ApiError(400, "INVALID_REQUEST", "submissionId is invalid.");
        const scored = scoreCoordinates(guess, state.locations[index]); const now = Date.now(); round.state = "LOCKED"; round.submissionId = data.submissionId; round.result = { outcome: "SUBMITTED", guess, distanceKm: scored.distanceKm, score: scored.score, submittedAt: now }; this.unlockNext(player); state.lastActivityAt = now; this.save(state); await this.due(state); state = this.load(); const latest = state.participants.find((item) => item.playerId === player.playerId); const response = { round: index + 1, outcome: "SUBMITTED", answer: answer(state.locations[index]), viewerResult: publicResult(latest.rounds[index].result), challengeStatus: state.status, nextRound: index < 4 ? index + 2 : null }; latest.rounds[index].response = response; this.save(state); await this.syncMemberships(state); return json(response);
      }
      const results = url.pathname.match(/^\/results\/(\d)$/);
      if (results) {
        const index = Number(results[1]) - 1; if (index < 0 || index > 4) throw new ApiError(400, "INVALID_REQUEST", "Round must be 1 through 5."); if (!player.rounds?.[index]?.result) throw new ApiError(403, "ROUND_NOT_UNLOCKED", "Resolve this round before viewing participant results.");
        const limit = Math.min(25, Math.max(1, Number(data.limit) || 25)); let offset = 0; if (data.cursor) { try { offset = Number(atob(data.cursor)); } catch { throw new ApiError(400, "INVALID_CURSOR", "Cursor is invalid."); } } if (!Number.isInteger(offset) || offset < 0) throw new ApiError(400, "INVALID_CURSOR", "Cursor is invalid.");
        const eligible = state.participants.filter((item) => item.playerId !== player.playerId && item.rounds[index].result); const page = eligible.slice(offset, offset + limit).map((item) => ({ playerId: item.playerId, displayName: item.displayName, displaySuffix: item.displaySuffix, role: item.role, result: publicResult(item.rounds[index].result) })); return json({ round: index + 1, answer: answer(state.locations[index]), viewerResult: publicResult(player.rounds[index].result), participantResults: page, nextCursor: offset + limit < eligible.length ? btoa(String(offset + limit)) : null });
      }
      throw new ApiError(404, "NOT_FOUND", "Route not found.");
    } catch (error) { return errorResponse(error); }
  }
  async alarm() {
    const state = this.load(); if (!state) return;
    if (state.purgeAt && Date.now() >= state.purgeAt) { await internal(recordStub(this.env), "/group-membership-remove", { challengeId: state.challengeId }).catch(() => {}); await this.ctx.storage.deleteAll(); return; }
    await this.due(state); const latest = this.load(); if (latest?.purgeAt && Date.now() >= latest.purgeAt) { await internal(recordStub(this.env), "/group-membership-remove", { challengeId: latest.challengeId }).catch(() => {}); await this.ctx.storage.deleteAll(); return; } await this.schedule(latest);
  }
}
