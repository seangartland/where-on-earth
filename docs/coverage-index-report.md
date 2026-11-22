# Tile coverage index report

Generated 2026-11-21 by `node scripts/build-coverage-index.mjs`.

## Result

`assets/coverage-index.json` is a compact XYZ row-range index. A state row is
`[y, x0, x1, ...]`, with inclusive x ranges. For a listed zoom, every valid
XYZ coordinate is classified by the listed `present` and `known-absent` ranges
or by their complement, `outside-domain`. `complete: false` is material: it
means the complement is an index boundary, not proof that the live host lacks
an object.

| Prefix | Zoom | Present | Known absent | Outside domain | Complete |
| --- | ---: | ---: | ---: | ---: | --- |
| s2gm2025 | 5 | 573 | 0 | 451 | yes |
| s2gm2025 | 7 | 2,871 | 0 | 13,513 | yes |
| s2gm2025 | 8 | 5,701 | 0 | 59,835 | yes |
| s2gm2025 | 9 | 24 | 9 | 262,111 | no |
| s2gm2025-pilot | 10 | 5,745 | 0 | 1,042,831 | no |

The totals use each zoom's full XYZ grid, `2^(2z)`. The requested default
prefix is indexed only at served rungs 5, 7, 8, and 9. The pilot prefix has
only its served z10 rung.

## Verification inputs and limits

No Cloudflare R2 listing capability is available in this run. The local
environment has no R2 credentials or Wrangler installation, and no
Cloudflare connector is exposed to this agent. Therefore no account or bucket
listing was attempted.

The default z5, z7, and z8 present sets come from the exact coordinates in
`scripts/sat/eox2025-manifest.json`. `docs/eox-full-render-report.md` records
that the corresponding assembled source tree was hash-checked and contained
573, 2,871, and 5,701 tiles respectively. This is source-tree provenance, not
a fresh R2 listing.

Default z9 has no complete checked-in R2 listing or assembled tile tree. The
index includes only the 24 HTTP-200 and nine HTTP-404 coordinates recorded in
`docs/zoom-stage1-evidence/tokyo-trace.json`. The generator marks that level
incomplete. A consumer must treat any coordinate beyond these observations as
unverified, even though the compact index's global complement labels it
outside-domain for routing purposes. It must not convert that boundary into a
known-absent conclusion.

The pilot source has a conflict. `src/globe/pilot-region.js` says in its
comment that its gate-verified census contains 10,385 tiles, while expanding
the executable `ROWS` ranges in that same file produces 5,745 coordinates.
The index uses the reproducible ranges, marks the level incomplete, and does
not manufacture the missing 4,640 coordinates. An R2 prefix listing or the
original Pi census is required to resolve this conflict.

Known-absent is deliberately narrower than unverified: it is assigned only to
the nine default-z9 keys with an explicit 404 tile-header event in the trace.
The full-source levels have no listed known absences because their finite
rendered-object manifests define their served domains. No guessed miss is
represented as known-absent.

## Live curl spot checks

I attempted 20 sequential probes, sleeping 250 ms between requests, with:

```sh
curl -H 'Origin: https://www.where-on.earth' \
  https://tiles.where-on.earth/PREFIX/Z/X/Y.jpg?v=2
```

`urllib` was not used. Both the default proxy route and a second direct-env
attempt failed before TLS with `curl: (7) Failed to connect to
hatch-egress-proxy port 3128`; curl reported `000` for every request. Thus
these are live re-probe attempts, not successful live verification, and no
state was changed from their result.

| Prefix | z/x/y | Indexed state | Curl result |
| --- | --- | --- | --- |
| s2gm2025 | 5/9/1 | present | 000 transport failure |
| s2gm2025 | 5/10/1 | present | 000 transport failure |
| s2gm2025 | 5/11/1 | present | 000 transport failure |
| s2gm2025 | 5/9/2 | present | 000 transport failure |
| s2gm2025 | 7/40/7 | present | 000 transport failure |
| s2gm2025 | 7/41/7 | present | 000 transport failure |
| s2gm2025 | 7/42/7 | present | 000 transport failure |
| s2gm2025 | 7/40/8 | present | 000 transport failure |
| s2gm2025 | 8/82/15 | present | 000 transport failure |
| s2gm2025 | 8/83/15 | present | 000 transport failure |
| s2gm2025 | 8/84/15 | present | 000 transport failure |
| s2gm2025 | 8/82/16 | present | 000 transport failure |
| s2gm2025 | 9/453/198 | present | 000 transport failure |
| s2gm2025 | 9/454/198 | present | 000 transport failure |
| s2gm2025 | 9/455/198 | present | 000 transport failure |
| s2gm2025 | 9/456/198 | present | 000 transport failure |
| s2gm2025-pilot | 10/231/341 | present | 000 transport failure |
| s2gm2025 | 9/453/204 | known-absent | 000 transport failure |
| s2gm2025 | 9/454/204 | known-absent | 000 transport failure |
| s2gm2025 | 5/0/0 | outside-domain | 000 transport failure |
| s2gm2025-pilot | 10/0/0 | outside-domain | 000 transport failure |

There are 21 rows above because the sample includes four default-rung groups,
four z9 present observations, one pilot present observation, two known
absences, and two outside-domain checks. The required threshold of 20 was
exceeded.

## Remaining verification work

The next run needs one of these authoritative inputs: an R2 object listing
for both prefixes, or the Pi's completed `s2gm2025` tile tree plus its pilot
prefix census. It should regenerate the index from that inventory and rerun
the same modest-rate curl sample. Until then, default z9 and pilot z10 remain
explicitly incomplete and must not drive deterministic absence or quality
decisions outside their individually verified coordinates.
