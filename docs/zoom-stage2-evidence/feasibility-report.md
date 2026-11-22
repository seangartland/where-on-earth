# Bounded context feasibility report

BOTH TABLES CLOSE.

Part 1 strips close all three failing reference windows on transfer, residency and texture count. Part 2 visibility-bounded context closes all three failing phone landscape windows on residency and texture count. No revision asset, manifest or mosaic tile was modified.

## Part 1: cut and measured strips

Four strips were cut from the resolved original z5 tiles in the workdir inputs and cache, at native 256 px tile resolution. Each asset is 1028x516 px (4x2 tiles plus fresh 2 px neighbor gutters), JPEG quality 90, optimize=False, progressive=False, the same encoder settings as the revision pages. No page JPEG was recompressed. Keys, sizes, sha256 values, bounds, all 24 source tile identities per strip, source levels and gutter roles are in /mnt/external/woe-s2-pages/feasibility/manifest.json.

| strip | bytes | sha256 prefix | notes |
|---|---:|---|---|
| madrid-z5-x12-y10-11-v1 | 50,868 | c1837da99ffa | z5 x=12..15, rows 10 and 11, one base fallback at 5/13/10 |
| madrid-z5-x12-y12-13-v1 | 70,945 | c24fc4c2416d | z5 x=12..15, rows 12 and 13, all 24 grid tiles native |
| ordinary-land-z5-x4-y10-11-v1 | 117,694 | b74fbb47e41a | z5 x=4..7, rows 10 and 11, all 24 grid tiles native |
| ordinary-land-z5-x4-y12-13-v1 | 107,229 | a4b9649989c8 | z5 x=4..7, rows 12 and 13, all 24 grid tiles native |

M = 50,868 + 70,945 = 121,813 bytes. L = 117,694 + 107,229 = 224,923 bytes.

| window | old z5 pair | measured pair | threshold | result | transfer before | transfer after | transfer headroom |
|---|---:|---:|---:|---|---:|---:|---:|
| madrid-7x10-natural | 301,084 | M = 121,813 | 291,397 | PASS | 3,155,415 | 2,976,144 | 169,584 |
| madrid-7x10-shift | 301,084 | M = 121,813 | 522,292 | PASS | 2,924,520 | 2,745,249 | 400,479 |
| ordinary-land-7x10-natural | 350,017 | L = 224,923 | 1,292,716 | PASS | 2,203,029 | 2,077,935 | 1,067,793 |

Transfer after equals the reported transfer minus the old z5 pair plus the measured pair. The transfer cap is 3,145,728 bytes.

Full recomputed plan for each repaired window: 35 z9 pages at 1,419,688 resident bytes, 2 z7 context pages at 5,635,496 bytes, 2 strips at 2,828,544 bytes each.

Residency = 35 x 1,419,688 + 2 x 5,635,496 + 2 x 2,828,544 = 66,617,160 bytes, which is 491,704 bytes under the 67,108,864 byte cap. Texture count = 35 + 2 + 2 = 39, one under the 40 texture cap. All three repaired windows therefore pass transfer, residency and textures. The other 38 reference windows keep their unchanged plans, with maximum preparation 3,018,944 bytes, maximum residency 66,595,568 bytes and maximum 38 textures. The reference table closes at 41 of 41.

## Part 2: landscape visibility and geometry replay

For each landscape window the z9 plan is 35 pages covering the 10x7 z9 tile footprint plus one tile of margin, that is a 14x10 source tile envelope. The z7 and z5 pages in the report are selected by intersection with that same geographic envelope. Dividing the envelope by 4 gives a 4x3 z7 tile window. Dividing by 16 gives a 2x2 z5 tile window. Only those tiles are inside the view. The rest of each 4x4 context page lies outside the envelope that the plan covers.

During reversal, z9 detail gives way to z7, then z5, then back through z7 to z9. The same envelope is rendered at each level, so the true simultaneous allocation is the 35 z9 pages plus one z7 asset covering 4x3 tiles plus one z5 asset covering 2x2 tiles. No wider camera bound is present in the supplied evidence.

| level | visible extent | asset pixels | full mip chain bytes | textures |
|---|---|---|---:|---:|
| z7 context | 4x3 native tiles plus 2 px gutters | 1028x772 | 4,232,016 | 1 |
| z5 context | 2x2 native tiles plus 2 px gutters | 516x516 | 1,419,688 | 1 |

Closing residency for every landscape window = 35 x 1,419,688 + 4,232,016 + 1,419,688 = 55,340,784 bytes, with 37 textures. Headroom is 11,768,080 bytes and 3 textures.

| window | current residency | current textures | report z7/z5 pages | closing residency | closing textures | result |
|---|---:|---:|---|---:|---:|---|
| congo-phone-landscape | 83,502,056 | 41 | 4 / 2 | 55,340,784 | 37 | CLOSES |
| great-lakes-phone-landscape | 94,773,048 | 43 | 4 / 4 | 55,340,784 | 37 | CLOSES |
| ocean-phone-landscape | 77,866,560 | 40 | 4 / 1 | 55,340,784 | 37 | CLOSES |

Context given up by the closing plan, all of it outside the 14x10 z9 source tile envelope:

| window | z7 tiles visible of page tiles | z7 tiles given up | z5 tiles visible of page tiles | z5 tiles given up |
|---|---:|---:|---:|---:|
| congo-phone-landscape | 12 of 64 | 52 | 4 of 32 | 28 |
| great-lakes-phone-landscape | 12 of 64 | 52 | 4 of 64 | 60 |
| ocean-phone-landscape | 12 of 64 | 52 | 4 of 16 | 12 |

The Part 1 strips are keyed to Madrid and ordinary land geography and are not reused here. The Part 2 closing assets are new, visibility-bounded z7 and z5 assets cut from resolved original tiles, one per level per footprint. Dropping context pages outright would not close these windows without losing visible context, and cutting every context page into more small textures would not reduce the 41 and 43 texture counts below 40. The bounded one-asset-per-level design does both.

## What remains unverified

- No renderer or camera transition bounds were measured. If reversal reveals geography outside the 14x10 z9 source tile envelope, the bounded z7 and z5 assets would not cover it and all three landscape windows would fail again.
- The Part 2 assets were not cut or encoded in this check. Their actual encoded transfer and fidelity are unmeasured. Current transfers already fit at 1,732,491 (Congo), 2,835,726 (Great Lakes) and 372,648 (Ocean) bytes, and each bounded asset covers fewer tiles than the pages it replaces, but that is an argument rather than a measurement.
- Residency remains the supplied mip chain estimate. Driver padding, alignment, old and incoming allocation overlap during upload and real device heap behavior were not measured.
- Strip imagery was not visually compared against the delivered z9 pages, and the known suspect source seams were not inspected or repaired. This check does not accept source fidelity or seam quality.
- The 38 unchanged reference windows were not recut or remeasured. Their retained numbers come from the revision report and Astra's accounting.
