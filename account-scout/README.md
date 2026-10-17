# Where on Earth account scout

Throwaway Phase 0 Worker for measuring better-auth on Cloudflare Workers and D1.
It is isolated from the game and the production PvP Worker.

The deploy helper uses the same dynamic Cloudflare credential pattern as the
existing custom connector. It never prints credential material.

Commands are documented by `python3 deploy.py help`. The checked-in
`wrangler.jsonc` contains a syntactically valid inert database id used only for
local dry-run bundling. The API deploy replaces it with the newly created scout
database binding.

The mail sink is test infrastructure, not a public endpoint. better-auth stores
its verification value in D1 and the send hook records the test delivery in D1;
only the local harness reads that row through the authenticated Cloudflare API.
