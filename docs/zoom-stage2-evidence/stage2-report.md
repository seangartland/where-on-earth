# Stage 2 page asset and coverage pilot report

Evidence only. No client changes, deploys, world build or R2 uploads were made.
All inputs were read from inside the workdir. Pages and manifest were written to /mnt/external/woe-s2-pages/ and nowhere else.

## Derived inputs and method

Iberia pilot window derivation: the local manifest's iberia `cut` entry reports 778 z9 tiles. The connected component of local z9 tiles with exactly that count spans x 234 to 267 and y 185 to 215. The eastern edge midpoint is x 268, y 200.5 in z9 tile coordinates, which converts to lat 36.315125, lon 8.437500. That is the boundary site center.

Pages are aligned 4x4 source-tile blocks with a 2 px gutter on every side, encoded as JPEG quality 90 at 1028x1028. Source levels are 9, 7 and 5. Missing cells resolve to z8, z7 or z5 ancestors before base-equivalent fill. Tile x wraps at 2^z at every zoom.

Footprint windows are 7x9 and 7x10 tiles at z9, centered on each site, tested at natural alignment and shifted by (2,2) tiles. For each window the byte total includes the intersecting z9 pages plus the pages covering the same geographic extent at z7 and z5.

## Page byte distribution

Bytes are exact encoded file sizes. p95 is nearest rank.

### By zoom

| zoom | min | median | p95 | max | count |
|---|---:|---:|---:|---:|---:|
| 9 | 21,745 | 98,151.5 | 262,654 | 324,539 | 110 |
| 7 | 31,167 | 145,540 | 280,923 | 280,923 | 19 |
| 5 | 44,260 | 129,878 | 239,632 | 239,632 | 13 |

### By site

A page used by several sites is counted once per site.

| site | min | median | p95 | max | count |
|---|---:|---:|---:|---:|---:|
| tokyo | 31,292 | 72,601 | 155,898 | 155,898 | 11 |
| madrid | 100,530 | 260,364 | 324,539 | 324,539 | 13 |
| congo | 67,169 | 117,161 | 239,632 | 239,632 | 15 |
| great-lakes | 123,789 | 158,152.5 | 213,343 | 213,343 | 16 |
| majuro | 22,681 | 32,196 | 80,104 | 80,104 | 11 |
| ordinary-land | 117,534 | 163,414 | 257,041 | 257,041 | 15 |
| ocean | 21,745 | 23,700 | 47,878 | 47,878 | 12 |
| antimeridian | 33,547 | 47,408 | 112,020 | 112,020 | 15 |
| high-latitude | 34,437 | 119,478 | 170,279 | 170,279 | 15 |
| boundary | 37,946 | 120,545 | 262,654 | 262,654 | 14 |
| holes | 22,666 | 39,423 | 155,898 | 155,898 | 15 |

All pages: min 21,745, median 112,030, p95 260,364, max 324,539, count 142.

## Footprint table

Budget columns: fits-3MiB means page bytes at most 3,145,728. fits-11 means at most 11 page textures. Mipmap bytes are estimates at 5.38 MiB per texture.

| site | window | pages | bytes | fits-3MiB | textures | mipmap MiB (estimate) | fits-11 |
|---|---|---:|---:|---|---:|---:|---|
| tokyo | tokyo-7x9-natural | 11 | 866,510 | yes | 11 | 59.18 | yes |
| tokyo | tokyo-7x9-shift | 8 | 575,719 | yes | 8 | 43.04 | yes |
| tokyo | tokyo-7x10-natural | 11 | 866,510 | yes | 11 | 59.18 | yes |
| tokyo | tokyo-7x10-shift | 8 | 575,719 | yes | 8 | 43.04 | yes |
| madrid | madrid-7x9-natural | 13 | 3,152,770 | no | 13 | 69.94 | no |
| madrid | madrid-7x9-shift | 10 | 2,347,414 | yes | 10 | 53.80 | yes |
| madrid | madrid-7x10-natural | 13 | 3,152,770 | no | 13 | 69.94 | no |
| madrid | madrid-7x10-shift | 10 | 2,347,414 | yes | 10 | 53.80 | yes |
| congo | congo-7x9-natural | 10 | 1,268,771 | yes | 10 | 53.80 | yes |
| congo | congo-7x9-shift | 13 | 1,665,594 | yes | 13 | 69.94 | no |
| congo | congo-7x10-natural | 12 | 1,446,026 | yes | 12 | 64.56 | no |
| congo | congo-7x10-shift | 13 | 1,665,594 | yes | 13 | 69.94 | no |
| great-lakes | great-lakes-7x9-natural | 10 | 1,597,191 | yes | 10 | 53.80 | yes |
| great-lakes | great-lakes-7x9-shift | 13 | 2,100,088 | yes | 13 | 69.94 | no |
| great-lakes | great-lakes-7x10-natural | 10 | 1,597,191 | yes | 10 | 53.80 | yes |
| great-lakes | great-lakes-7x10-shift | 16 | 2,538,650 | yes | 16 | 86.08 | no |
| majuro | majuro-7x9-natural | 8 | 331,963 | yes | 8 | 43.04 | yes |
| majuro | majuro-7x9-shift | 11 | 420,129 | yes | 11 | 59.18 | yes |
| majuro | majuro-7x10-natural | 8 | 331,963 | yes | 8 | 43.04 | yes |
| majuro | majuro-7x10-shift | 11 | 420,129 | yes | 11 | 59.18 | yes |
| ordinary-land | ordinary-land-7x9-natural | 13 | 2,212,572 | yes | 13 | 69.94 | no |
| ordinary-land | ordinary-land-7x9-shift | 8 | 1,411,684 | yes | 8 | 43.04 | yes |
| ordinary-land | ordinary-land-7x10-natural | 13 | 2,212,572 | yes | 13 | 69.94 | no |
| ordinary-land | ordinary-land-7x10-shift | 8 | 1,411,684 | yes | 8 | 43.04 | yes |
| ocean | ocean-7x9-natural | 9 | 263,192 | yes | 9 | 48.42 | yes |
| ocean | ocean-7x9-shift | 12 | 333,348 | yes | 12 | 64.56 | no |
| ocean | ocean-7x10-natural | 9 | 263,192 | yes | 9 | 48.42 | yes |
| ocean | ocean-7x10-shift | 12 | 333,348 | yes | 12 | 64.56 | no |
| antimeridian | antimeridian-7x9-natural | 10 | 583,615 | yes | 10 | 53.80 | yes |
| antimeridian | antimeridian-7x9-shift | 13 | 726,556 | yes | 13 | 69.94 | no |
| antimeridian | antimeridian-7x10-natural | 12 | 672,728 | yes | 12 | 64.56 | no |
| antimeridian | antimeridian-7x10-shift | 13 | 726,556 | yes | 13 | 69.94 | no |
| high-latitude | high-latitude-7x9-natural | 11 | 1,324,592 | yes | 11 | 59.18 | yes |
| high-latitude | high-latitude-7x9-shift | 8 | 1,022,102 | yes | 8 | 43.04 | yes |
| high-latitude | high-latitude-7x10-natural | 15 | 1,556,684 | yes | 15 | 80.70 | no |
| high-latitude | high-latitude-7x10-shift | 8 | 1,022,102 | yes | 8 | 43.04 | yes |
| boundary | boundary-7x9-natural | 8 | 1,283,924 | yes | 8 | 43.04 | yes |
| boundary | boundary-7x9-shift | 12 | 1,709,113 | yes | 12 | 64.56 | no |
| boundary | boundary-7x10-natural | 10 | 1,436,103 | yes | 10 | 53.80 | yes |
| boundary | boundary-7x10-shift | 12 | 1,709,113 | yes | 12 | 64.56 | no |
| holes | holes-7x10-worst (56 missing z9 cells) | 15 | 817,419 | yes | 15 | 80.70 | no |

Measured footprints: 41. Fit the 3 MiB preparation cap: 39. Fit the 11 texture cap: 23. Fit both budgets: 23.

## Counters

- Tiles fetched from R2: 0
- Tile reads from local inputs: 1048
- Tile reads from workdir cache: 2123
- Negative cache (missing marker) hits: 2816
- HTTP responses by (zoom, code): 
- 404s by zoom: z9=0, z7=0, z5=0, z8=0
- Bytes in (all HTTP bodies): 0
- Bytes in (valid tile bodies): 0
- Bytes out (encoded pages): 15,879,897
- Fetch/decode errors: 0

## Validation

| check | result | detail |
|---|---|---|
| Manifest byte sum equals on-disk byte sum | PASS | manifest 15,879,897, disk 15,879,897 |
| Every referenced file exists with matching size | PASS | 142 rows |
| Readback sample | PASS | 15 pages, dimensions 1028x1028 and sha256 match |
| Deterministic rebuild | PASS | 5/0/4 ok, 5/4/3 ok, 7/8/11 ok |

Manifest was published only after every referenced file existed with a matching byte size. Numeric integrity is the gate; no visual spot check was required.

## Storage extrapolation (estimates)

At the measured median page byte count (112,030 bytes), the full geometric inventory of 17,472 pages would be about 1.82 GiB. This is an estimate.
At the measured p95 page byte count (260,364 bytes), the full inventory would be about 4.24 GiB. This is an estimate.

## Provenance and gutter notes

- Pages with base-equivalent cells: 7. 5/0/4(2), 5/1/2(1), 5/1/3(1), 5/1/4(2), 5/3/2(1), 5/4/1(1), 5/7/3(4)
- Pages with unresolved gutter positions: 9. 5/0/4(5), 5/1/2(1), 5/1/3(2), 5/1/4(3), 5/2/2(2), 5/4/1(9), 5/4/4(3), 5/7/3(3), 7/6/17(1)
- Every fallback cell records the source level actually used; a partial source is never reported as a complete native page.
- Holes case: worst z9 7x10 rectangle in the tokyo fetch window had 56 of 70 cells missing.

## Astra stop-rule assessment

- Stop-rule risk, preparation cap: 2 of 41 footprints exceed 3 MiB. Examples: madrid madrid-7x9-natural bytes=3,152,770, madrid madrid-7x10-natural bytes=3,152,770.
- Stop-rule risk, GPU residency: 18 of 41 footprints exceed 11 textures. Maximum observed is 16 textures.
- Quality-versus-budget: no single page exceeds the 3 MiB round budget.
- Provenance or gutter failures: 7 pages needed base-equivalent cells and 9 pages needed gutter fallback; these are recorded in the manifest cell maps and must be reviewed before treating coverage as complete.

All numbers above are measured except the two full-inventory storage figures and the mipmap bytes, which are estimates as labeled.
