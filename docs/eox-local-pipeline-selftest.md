# EOX local pipeline fixture self-test

Run on 2026-10-18 with Rasterio 1.5.2, GDAL 3.12.2, Node 24.20.0, and ffmpeg
8.1.2:

```sh
node scripts/sat/local/selftest.mjs \
  --python /home/hatch/workspace/map-game/eox1-work/.venv-sat/bin/python
```

The generator creates four synthetic quarter COGs (B02, B03, B04, and
observations), a normalized inventory with SHA-256 and byte lengths, two
adjacent packed-window records, a tiny Blue Marble stand-in, and global/vector
  land-mask stand-ins. The production dimensions remain 768 x 768 for detail and
2048 x 1024 for base; the fixture uses 192 x 192 detail windows and a 256 x 128
base solely to keep the self-test small.

Files produced by stage:

- Fixture: `source/2025-Q1.tif` through `source/2025-Q4.tif`,
  `inventory.jsonl`, `plan.json`, and four files under `assets/`.
- Acquire: four verified immutable objects under
  `work/source/<quarter>/` and `work/acquire.jsonl`. A second acquire records
  four `resumed` entries with zero requests.
- Sample: twelve untoned cache GeoTIFFs under
  `work/raw-quarterly/<window>/`, one for each of the two detail windows plus
  the base, for each quarter. Filenames
  carry a hash of the window definition, quarter, and source checksum.
- Finish: three selected untoned GeoTIFFs and their local working rasters under
  `work/raw-selected/`, two JPEG tiles under `finished/4/`, `base-ours.jpg`,
  and `finished/qa.json`.

Recorded fixture results:

| Tile | Nodata fraction | RGB min | RGB max | RGB mean |
| --- | ---: | ---: | ---: | ---: |
| `4/5/7` | 0 | 102 | 206 | 154.41 |
| `4/6/7` | 0 | 111 | 213 | 163.45 |

The adjacent-window mean absolute RGB seam difference is **0.0**. Both windows
have 36,864 valid pixels and zero nodata pixels. Source-band ranges and means
are written in `qa.json` on every run rather than copied into this document.
The base has 4,320 valid and 28,448 nodata source pixels, exercising polar
nodata repair and ocean fill. The self-test finishes twice and requires
matching SHA-256 values for both JPEG tiles and the base JPEG.

Sample and finish make **zero network calls**. This is backed by both structure
and the self-test: `sample.py`, `raster_ops.py`, and `finish.mjs` contain no
`fetch`, HTTP URL, boto3/botocore, or S3 client. Only `acquire.mjs` has an S3
path, and the fixture invokes its local `--source-dir` branch. No Process API
code or URL occurs anywhere under `scripts/sat/local/`; the fixture and real
local pipeline consume exactly 0 Process API PU.
