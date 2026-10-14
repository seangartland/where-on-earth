// Where on Earth PvP service (scaffold).
//
// This is the setup skeleton for the async head-to-head mode described in
// docs/pvp-mode-plan-sol.md. It proves the deploy pipeline and the storage
// shape only: a health route, one Durable Object per match, and one records
// object for persistent pair stats. The full match state machine, HTTP
// contract, and client integration are specified separately before the real
// implementation lands.
//
// Retention model (Sean's question, 2026-10-13): a MatchRoom holds ONE
// match and can expire with it. Pair records (running W/L against a specific
// player) live in PlayerRecords, keyed by the pairing of two player tokens,
// and are written when a match completes. Records are not limited to one
// game and do not expire with matches.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export class MatchRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)"
    );
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/init") && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      this.ctx.storage.sql.exec(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('state', ?)",
        JSON.stringify({
          status: "created",
          createdAt: Date.now(),
          createdBy: body.playerToken || null,
          rounds: [],
        })
      );
      return json({ ok: true });
    }
    const row = this.ctx.storage.sql
      .exec("SELECT value FROM meta WHERE key = 'state'")
      .toArray()[0];
    return json({ state: row ? JSON.parse(row.value) : null });
  }
}

export class PlayerRecords {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS pair_records (pair_key TEXT PRIMARY KEY, record TEXT)"
    );
  }

  async fetch(request) {
    const url = new URL(request.url);
    const pairKey = url.searchParams.get("pair");
    if (!pairKey) return json({ error: "pair query param required" }, 400);
    if (request.method === "PUT") {
      const body = await request.json().catch(() => ({}));
      this.ctx.storage.sql.exec(
        "INSERT OR REPLACE INTO pair_records (pair_key, record) VALUES (?, ?)",
        pairKey,
        JSON.stringify(body)
      );
      return json({ ok: true });
    }
    const row = this.ctx.storage.sql
      .exec("SELECT record FROM pair_records WHERE pair_key = ?", pairKey)
      .toArray()[0];
    return json({ record: row ? JSON.parse(row.record) : null });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, service: "woe-pvp" });
    }

    // Create a match: one Durable Object instance per match id.
    if (url.pathname === "/matches" && request.method === "POST") {
      const id = env.MATCHES.newUniqueId();
      const stub = env.MATCHES.get(id);
      await stub.fetch("https://do/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(await request.json().catch(() => ({}))),
      });
      return json({ matchId: id.toString() }, 201);
    }

    // Read a match's state.
    const matchRoute = url.pathname.match(/^\/matches\/([A-Za-z0-9]+)$/);
    if (matchRoute && request.method === "GET") {
      let id;
      try {
        id = env.MATCHES.idFromString(matchRoute[1]);
      } catch {
        return json({ error: "bad match id" }, 400);
      }
      const stub = env.MATCHES.get(id);
      return stub.fetch("https://do/state");
    }

    return json({ error: "not found" }, 404);
  },
};
