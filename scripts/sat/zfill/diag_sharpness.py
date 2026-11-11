#!/usr/bin/env python3
"""Phase 1 step 1: sharpness diagnostic (BRIEF-phase1-pilot.md, work item 1).

Renders the Madrid and Chicago z9 center tiles straight from the full-resolution
quarterly LR source on the Pi, bypassing the production chain, and measures
Laplacian variance at every chain stage with one shared metric:

  metric: grayscale (PIL 'L') 256x256 tile, 4-neighbour 3x3 Laplacian, variance.
  The same metric reproduces the reference numbers on live tiles exactly
  (Madrid z9 ours 166.7 / EOX 6539.5, Chicago z9 ours 223.6 / EOX 11435.6).

Stages measured (run on the Pi, reads /mnt/external/satmap/source in place):
  S0  source native: the tile footprint cropped from the source grid at its own
      pixel size (no resampling), toned with the production land tone curve.
  S1  direct z9 render: source reprojected to the z9 tile's EPSG:3857 256x256
      grid with nearest / bilinear / cubic / lanczos / average, same tone,
      measured lossless and after JPEG at the production setting (ffmpeg q:v 2).
Run on the VM (production intermediates, read in place):
  S2  production window cache (sample.py output, Resampling.average) cropped to
      the same tile, same tone, lossless and JPEG.
"""
import json, math, os, subprocess, sys, glob
import numpy as np
from PIL import Image

R = 6378137.0
ORIGIN = math.pi * R
CITIES = {
    'madrid': {'lat': 40.4168, 'lng': -3.7038, 'cell': 'N18W036', 'win': '9_249_192'},
    'chicago': {'lat': 41.8781, 'lng': -87.6298, 'cell': 'N18W108', 'win': '9_129_189'},
}
Z = 9
# production land tone (eox1-work/scripts/sat/local/finish.mjs CONFIG, no window override)
TONE = dict(landGain=2.9, landGamma=0.9, landSaturation=1.05, contrast=1.0, highlightKnee=0.72,
            lift=True, liftStrength=0.07, liftCutoff=0.55, liftCurve=2.0)


def tile_xy(lat, lng, z):
    n = 2 ** z
    x = int((lng + 180) / 360 * n)
    la = math.radians(lat)
    y = int((1 - math.log(math.tan(la) + 1 / math.cos(la)) / math.pi) / 2 * n)
    return x, y


def tile_bounds_3857(z, x, y):
    size = 2 * ORIGIN / 2 ** z
    return (-ORIGIN + x * size, ORIGIN - (y + 1) * size, -ORIGIN + (x + 1) * size, ORIGIN - y * size)


def merc_to_lat(my):
    return math.degrees(math.atan(math.sinh(my / R)))


def tone(rgb10k):
    """rgb10k: float array (..., 3) in reflectance*10000, RGB order. Returns uint8."""
    t = TONE
    x = np.power(np.maximum(0, rgb10k / 10000 * t['landGain']), 1 / t['landGamma'])
    k = t['highlightKnee']
    x = np.where(x > k, k + (1 - k) * (1 - np.exp(-(x - k) / (1 - k))), x)
    mean = x.mean(axis=-1, keepdims=True)
    x = (mean + (x - mean) * t['landSaturation'] - 0.5) * t['contrast'] + 0.5
    if t['lift']:
        lum = 0.2126 * x[..., 0] + 0.7152 * x[..., 1] + 0.0722 * x[..., 2]
        lift = np.where(lum < t['liftCutoff'], t['liftStrength'] * (1 - lum / t['liftCutoff']) ** t['liftCurve'], 0)
        x = x + lift[..., None]
    return np.round(np.clip(x, 0, 1) * 255).astype(np.uint8)


def lapvar_rgb(rgb_u8):
    g = np.asarray(Image.fromarray(rgb_u8).convert('L')).astype(np.float64)
    L = -4 * g[1:-1, 1:-1] + g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:]
    return float(L.var())


def jpeg_roundtrip(rgb_u8, path):
    """Encode exactly as production does: ffmpeg mjpeg -q:v 2 from a PPM."""
    ppm = path + '.ppm'
    h, w, _ = rgb_u8.shape
    with open(ppm, 'wb') as f:
        f.write(f'P6\n{w} {h}\n255\n'.encode())
        f.write(rgb_u8.tobytes())
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', ppm, '-frames:v', '1', '-q:v', '2', '-y', path], check=True)
    os.remove(ppm)
    return np.asarray(Image.open(path).convert('RGB'))


def band_path(cell_dir, band):
    hits = [p for p in glob.glob(os.path.join(cell_dir, f'{band}.tif*')) if os.path.isfile(p) and '.partial' not in p]
    hits.sort(key=len)
    return hits[0]


def cmd_pi(src_root, out_dir):
    import rasterio
    from rasterio.warp import reproject
    from rasterio.enums import Resampling
    from rasterio.transform import from_bounds
    from rasterio.windows import from_bounds as win_from_bounds
    os.makedirs(out_dir, exist_ok=True)
    res = {}
    qdate = {'Q1': '01', 'Q2': '04', 'Q3': '07', 'Q4': '10'}
    for name, c in CITIES.items():
        x, y = tile_xy(c['lat'], c['lng'], Z)
        b = tile_bounds_3857(Z, x, y)
        lng0, lng1 = b[0] / ORIGIN * 180, b[2] / ORIGIN * 180
        lat0, lat1 = merc_to_lat(b[1]), merc_to_lat(b[3])
        res[name] = {'tile': f'{Z}/{x}/{y}', 'footprint_deg': [lng0, lat0, lng1, lat1], 'quarters': {}}
        for q in ('Q1', 'Q2', 'Q3', 'Q4'):
            cell_dir = glob.glob(os.path.join(src_root, f'2025-{q}', '**', f'Sentinel-2_mosaic_2025_{q}_{c["cell"]}_low_resolution'), recursive=True)[0]
            paths = [band_path(cell_dir, bn) for bn in ('B04', 'B03', 'B02')]
            out = {}
            # S0: native crop
            native = []
            for p in paths:
                with rasterio.open(p) as ds:
                    if 'src_meta' not in res[name]:
                        res[name]['src_meta'] = {'crs': str(ds.crs), 'res_deg': list(ds.res), 'size': [ds.width, ds.height],
                                                 'dtype': ds.dtypes[0], 'compress': str(ds.compression), 'bounds': list(ds.bounds)}
                    win = win_from_bounds(lng0, lat0, lng1, lat1, ds.transform).round_offsets().round_lengths()
                    native.append(ds.read(1, window=win).astype(np.float32))
            nat = np.stack(native, -1)
            nat_u8 = tone(nat)
            Image.fromarray(nat_u8).save(os.path.join(out_dir, f'{name}-{q}-S0-native.png'))
            out['S0_native'] = {'shape': list(nat_u8.shape[:2]), 'lapvar': round(lapvar_rgb(nat_u8), 1)}
            # S1: direct reprojection to the z9 tile grid
            dst_t = from_bounds(*b, 256, 256)
            for rs_name, rs in (('nearest', Resampling.nearest), ('bilinear', Resampling.bilinear), ('cubic', Resampling.cubic),
                                ('lanczos', Resampling.lanczos), ('average', Resampling.average)):
                bands = []
                for p in paths:
                    with rasterio.open(p) as ds:
                        dst = np.zeros((256, 256), np.float32)
                        reproject(rasterio.band(ds, 1), dst, src_transform=ds.transform, src_crs=ds.crs, src_nodata=0,
                                  dst_transform=dst_t, dst_crs='EPSG:3857', dst_nodata=0, resampling=rs)
                        bands.append(dst)
                rgb = tone(np.stack(bands, -1))
                Image.fromarray(rgb).save(os.path.join(out_dir, f'{name}-{q}-S1-{rs_name}.png'))
                j = jpeg_roundtrip(rgb, os.path.join(out_dir, f'{name}-{q}-S1-{rs_name}.jpg'))
                out[f'S1_{rs_name}'] = {'lossless': round(lapvar_rgb(rgb), 1), 'jpeg_q2': round(lapvar_rgb(j), 1)}
            res[name]['quarters'][q] = out
            print(name, q, json.dumps(out), flush=True)
    json.dump(res, open(os.path.join(out_dir, 'diag-pi.json'), 'w'), indent=1)


def cmd_vm(cache_root, out_dir):
    """S2: production window caches (sample.py output) for the same tile."""
    import rasterio
    res = {}
    for name, c in CITIES.items():
        x, y = tile_xy(c['lat'], c['lng'], Z)
        wx, wy = map(int, c['win'].split('_')[1:])
        dx, dy = x - wx, y - wy
        res[name] = {'tile': f'{Z}/{x}/{y}', 'window': c['win'], 'quarters': {}}
        for f in sorted(glob.glob(os.path.join(cache_root, c['win'], '*.tif'))):
            q = os.path.basename(f).split('__')[0].replace('2025-', '')
            with rasterio.open(f) as ds:
                a = ds.read()
            crop = a[:, dy * 256:(dy + 1) * 256, dx * 256:(dx + 1) * 256].astype(np.float32)
            rgb = tone(np.stack([crop[2], crop[1], crop[0]], -1))
            Image.fromarray(rgb).save(os.path.join(out_dir, f'{name}-{q}-S2-prodcache.png'))
            j = jpeg_roundtrip(rgb, os.path.join(out_dir, f'{name}-{q}-S2-prodcache.jpg'))
            res[name]['quarters'][q] = {'lossless': round(lapvar_rgb(rgb), 1), 'jpeg_q2': round(lapvar_rgb(j), 1)}
            print(name, q, res[name]['quarters'][q], flush=True)
    json.dump(res, open(os.path.join(out_dir, 'diag-vm.json'), 'w'), indent=1)


if __name__ == '__main__':
    if sys.argv[1] == 'pi':
        cmd_pi(sys.argv[2], sys.argv[3])
    else:
        cmd_vm(sys.argv[2], sys.argv[3])
