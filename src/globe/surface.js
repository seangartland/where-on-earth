// ---------------------------------------------------------------------------
// The globe surface (refactor Phase 5): the surface shader, land data baked
// into its texture, the coast/lake/river outlines, satellite imagery with its
// detail insets, and the asset loading behind the boot and detail bars.
// main.js calls initGlobeSurface(), initImagery() and initAssets() at the
// spots these sections used to run.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { feature as topoFeature } from 'topojson-client';
import { DEG, FOV, RESET_DAILY } from '../core/config.js';
import { clamp, smoothstep } from '../core/math.js';
import { state } from '../core/state.js';
import { latLngToVec3, canvas, renderer, camera, globe, pointers, radPerPx } from './scene.js';

let blankTex;
export let globeMat;

// ---------------------------------------------------------------------------
// Globe surface
// ---------------------------------------------------------------------------
export function initGlobeSurface() {
  blankTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  blankTex.needsUpdate = true;
  const coast = parseInt(new URLSearchParams(location.search).get('coast') ?? '2');

  globeMat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: blankTex },
      uLand: { value: 0 },
      uMapTexel: { value: new THREE.Vector2(1 / 4096, 1 / 2048) },
      // satellite imagery (see "Satellite imagery" below): equirectangular base
      uSatBase: { value: blankTex },
      uSatMix: { value: 0 },
      uLegFadeOn: { value: coast === 0 ? 0 : 1 },
      uOceanFlatFade: { value: 1 },
      uOceanFlat: { value: coast === 2 ? 0.55 : coast === 3 ? 0.85 : 0 },
      // detail insets: A draws under B; bounds are Mercator (x0, y0, x1, y1)
      uInsetA: { value: blankTex },
      uInsetB: { value: blankTex },
      uInsetBoundsA: { value: new THREE.Vector4(0, 0, 1, 1) },
      uInsetBoundsB: { value: new THREE.Vector4(0, 0, 1, 1) },
      uInsetMixA: { value: 0 },
      uInsetMixB: { value: 0 },
      // Country Blackout: found countries drop the imagery (see "Country Blackout")
      uBlackout: { value: blankTex },
      uBlackoutMix: { value: 0 },
    },
    vertexShader: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vPosW;
    void main() {
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vPosW = wp.xyz;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
    fragmentShader: /* glsl */ `
    uniform sampler2D uMap;
    uniform float uLand;
    uniform vec2 uMapTexel;
    uniform sampler2D uSatBase;
    uniform float uSatMix;
    uniform float uLegFadeOn;
    uniform float uOceanFlatFade;
    uniform float uOceanFlat;
    uniform sampler2D uInsetA;
    uniform sampler2D uInsetB;
    uniform vec4 uInsetBoundsA;
    uniform vec4 uInsetBoundsB;
    uniform float uInsetMixA;
    uniform float uInsetMixB;
    uniform sampler2D uBlackout;
    uniform float uBlackoutMix;
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vPosW;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    // Inset texels are premultiplied: cleared to alpha 0, tiles land opaque,
    // so bilinear and mip edges between loaded and empty tiles stay clean.
    // x wraps (fract) so an inset can straddle the antimeridian; local coords
    // are relative to the bounds to hold precision at z11. ~2% feathered edge.
    vec4 insetSample(sampler2D t, vec4 b, vec2 m) {
      vec2 l = vec2(fract(m.x - b.x), m.y - b.y) / (b.zw - b.xy);
      vec2 e = smoothstep(vec2(0.0), vec2(0.02), l) * smoothstep(vec2(0.0), vec2(0.02), 1.0 - l);
      return texture2D(t, l) * (e.x * e.y);
    }

    void main() {
      vec4 m = texture2D(uMap, vUv) * uLand;
      float land = m.r;
      float glow = m.g;
      float shelf = m.b;

      vec3 N = normalize(vNormalW);
      vec3 V = normalize(cameraPosition - vPosW);
      float ndv = clamp(dot(N, V), 0.0, 1.0);

      // ocean
      vec3 col = vec3(0.030, 0.085, 0.185);
      col += vec3(0.020, 0.085, 0.160) * shelf;

      // graticule, 15 degree spacing, fading near poles
      vec2 g = vec2(vUv.x * 24.0, vUv.y * 12.0);
      vec2 gd = abs(fract(g - 0.5) - 0.5) / fwidth(g);
      float grid = 1.0 - min(min(gd.x, gd.y), 1.0);
      float poleFade = smoothstep(0.02, 0.14, min(vUv.y, 1.0 - vUv.y));
      col += vec3(0.10, 0.24, 0.42) * grid * 0.16 * poleFade * (1.0 - land * 0.7);

      // land
      vec3 landCol = vec3(0.105, 0.230, 0.340);
      col = mix(col, landCol, land * 0.94);

      // coastal glow
      col += vec3(0.22, 0.70, 1.00) * glow * 0.70;

      // soft ocean sheen (fixed light for depth)
      vec3 H = normalize(vec3(0.5, 0.8, 0.6) + V);
      col += vec3(0.30, 0.52, 0.85) * pow(max(dot(N, H), 0.0), 24.0) * 0.16 * (1.0 - land);

      // The local Blue Marble base and the sphere UVs are equirectangular, so
      // the base covers both poles directly. Detail tiles remain Web Mercator.
      // Replaces the graticule, glow and sheen wholesale via the crossfade.
      vec3 sat = texture2D(uSatBase, vUv).rgb;
      float latRaw = (vUv.y - 0.5) * 3.14159265;
      float lat = clamp(latRaw, -1.48442, 1.48442);
      vec2 merc = vec2(vUv.x, 0.5 - log(tan(0.78539816 + 0.5 * lat)) / 6.28318531);
      vec4 ia = insetSample(uInsetA, uInsetBoundsA, merc) * uInsetMixA;
      sat = sat * (1.0 - ia.a) + ia.rgb;
      vec4 ib = insetSample(uInsetB, uInsetBoundsB, merc) * uInsetMixB;
      sat = sat * (1.0 - ib.a) + ib.rgb;
      sat *= mix(0.72, 1.0, sqrt(ndv)); // soft limb darkening
      vec2 wx = uMapTexel * 10.0;
      float wideLand = max(max(texture2D(uMap, vUv - vec2(wx.x, 0.0)).r,
                               texture2D(uMap, vUv + vec2(wx.x, 0.0)).r),
                           max(texture2D(uMap, vUv - vec2(0.0, wx.y)).r,
                               texture2D(uMap, vUv + vec2(0.0, wx.y)).r)) * uLand;
      float openWater = 1.0 - smoothstep(0.02, 0.60, wideLand);
      // openWater is sampled from the baked equirectangular land texture at a
      // fixed texel offset, so its resolution doesn't scale with zoom. At
      // close inset zoom that fixed-resolution falloff blows up into soft
      // ellipses offset from the real (tile-sharp) coastline (2026-10-22 ghost
      // blobs); uOceanFlatFade zeroes the flat tint once insets are detailed
      // enough to show real coastline, leaving it untouched at whole-globe zoom.
      sat = mix(sat, vec3(0.045, 0.125, 0.255), openWater * uOceanFlat * uOceanFlatFade);
      float boM = texture2D(uBlackout, vUv).r * uBlackoutMix;
      float satMix = uSatMix * (1.0 - boM);
      col = mix(col, sat, satMix);
      vec3 oceanTone = mix(vec3(0.105, 0.230, 0.340), texture2D(uSatBase, vec2(0.083, 0.555)).rgb, 0.55) * mix(0.72, 1.0, sqrt(ndv));
      col = mix(col, oceanTone, boM * uSatMix);

      // Island legibility over satellite (2026-10-16): the crossfade above
      // discards the classic style's fill contrast, so small islands blend
      // into the ocean (player feedback: Tuvalu, the Pacific chains, New
      // Guinea's coast). Rebuild the separation from the baked land
      // channels, scaled by the local satellite mix so the classic style
      // and blacked-out countries are untouched.
      float legFade = mix(1.0, smoothstep(1.15, 1.38, length(cameraPosition)), uLegFadeOn);
      if (satMix > 0.001) {
        // shelf fringe: lighten the water just off the coast
        col += vec3(0.020, 0.085, 0.160) * shelf * 0.60 * satMix * legFade;
        // coastal glow, softer than the classic style's own
        col += vec3(0.22, 0.70, 1.00) * glow * 0.30 * satMix * legFade;
        // coastline rim: land-mask gradient, brightened on the land side
        vec2 tx = uMapTexel * 1.6;
        float nMin = min(min(texture2D(uMap, vUv - vec2(tx.x, 0.0)).r,
                             texture2D(uMap, vUv + vec2(tx.x, 0.0)).r),
                         min(texture2D(uMap, vUv - vec2(0.0, tx.y)).r,
                             texture2D(uMap, vUv + vec2(0.0, tx.y)).r)) * uLand;
        float rim = land * (1.0 - nMin);
        col += vec3(0.35, 0.60, 0.66) * rim * 0.30 * satMix * legFade;
        // minimum land tint: where the mask says land but the photo reads
        // as dark water, lift the fill toward a pale land tone. Suppressed
        // in land interiors (neighbours all land at a wider radius), so
        // dark continents keep their photo; small islands and coasts,
        // whose neighbourhood includes water, get the lift.
        vec2 fx = uMapTexel * 6.0;
        float interior = min(min(texture2D(uMap, vUv - vec2(fx.x, 0.0)).r,
                                  texture2D(uMap, vUv + vec2(fx.x, 0.0)).r),
                              min(texture2D(uMap, vUv - vec2(0.0, fx.y)).r,
                                  texture2D(uMap, vUv + vec2(0.0, fx.y)).r)) * uLand;
        // presence responds to a few percent of land: at gameplay zoom a
        // small island's mask value is mip-diluted to a faint average even
        // though the island is solid in the data (measured: Funafuti peaks
        // at 255 but averages 2.8 over its neighbourhood).
        float presence = smoothstep(0.008, 0.10, land);
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        float watery = 1.0 - smoothstep(0.06, 0.20, lum);
        col = mix(col, vec3(0.44, 0.50, 0.36), presence * (1.0 - interior) * watery * 0.50 * satMix * legFade);
      }

      // atmospheric rim haze (eased back over imagery)
      float fres = pow(1.0 - ndv, 2.6);
      col += vec3(0.18, 0.48, 1.00) * fres * mix(0.80, 0.32, mix(satMix, uSatMix, boM));

      col += (hash(gl_FragCoord.xy) - 0.5) / 255.0; // dither against banding
      gl_FragColor = vec4(col, 1.0);
    }`,
  });
  const globeMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 100), globeMat);
  globe.add(globeMesh);
}

// ---------------------------------------------------------------------------
// Land data -> texture (fill / coastal glow / shelf haze) + crisp outlines
// ---------------------------------------------------------------------------
export function unwrap(points) {
  const out = [];
  let off = 0;
  let prev = null;
  for (const [lon, lat] of points) {
    let L = lon + off;
    if (prev !== null) {
      if (L - prev > 180) { off -= 360; L -= 360; }
      else if (L - prev < -180) { off += 360; L += 360; }
    }
    out.push([L, lat]);
    prev = L;
  }
  return out;
}

// Coast cleanup for the 50m data. Islands under MIN_ISLAND deg across render
// as sub-pixel scribbles at globe scale (Norwegian skerries, Aegean, Arctic
// shards), so they're dropped from fill, glow and outline alike. Remaining
// lines are Douglas-Peucker simplified to SIMPLIFY_TOL deg, which strips the
// zigzag noise below ~0.5 px at fit zoom while keeping real coast shape.
export const MIN_ISLAND = 0.12;
export const SIMPLIFY_TOL = 0.015;

export function ringExtent(pts) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return Math.hypot((x1 - x0) * Math.cos(((y0 + y1) / 2) * DEG), y1 - y0);
}

export const isClosed = (pts) => pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];

export function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const k = Math.cos(((pts[a][1] + pts[b][1]) / 2) * DEG); // squash longitude toward true distance
    const ax = pts[a][0] * k, ay = pts[a][1];
    const dx = pts[b][0] * k - ax, dy = pts[b][1] - ay;
    const len = Math.hypot(dx, dy);
    let best = -1, bestD = tol;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][0] * k - ax, py = pts[i][1] - ay;
      const d = len > 1e-12 ? Math.abs(px * dy - py * dx) / len : Math.hypot(px, py);
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

export function cleanCoast(lines) {
  const out = [];
  for (const line of lines) {
    if (isClosed(line) && ringExtent(line) < MIN_ISLAND) continue;
    // a closed ring has no natural split point, so simplify it as two halves
    const half = isClosed(line) ? line.length >> 1 : 0;
    const pts = half
      ? [...simplify(line.slice(0, half + 1), SIMPLIFY_TOL).slice(0, -1), ...simplify(line.slice(half), SIMPLIFY_TOL)]
      : simplify(line, SIMPLIFY_TOL);
    out.push(pts);
  }
  return out;
}

export function addToPath(path, pts, W, H, close) {
  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) { min = Math.min(min, p[0]); max = Math.max(max, p[0]); }
  for (const shift of [-360, 0, 360]) {
    if (max + shift < -180 || min + shift > 180) continue;
    pts.forEach(([L, lat], i) => {
      const x = ((L + shift + 180) / 360) * W;
      const y = ((90 - lat) / 180) * H;
      i ? path.lineTo(x, y) : path.moveTo(x, y);
    });
    if (close) path.closePath();
  }
}

// Lake shorelines as closed rings (outer + island rings), fed through the same
// cleanCoast pass as the sea coast so they share its island rule and smoothing.
export function lakeRings(lakes) {
  const rings = [];
  for (const f of lakes.features) for (const poly of f.geometry.coordinates) rings.push(...poly);
  return rings;
}

// Bbox area for sorting lakes largest-first (drives the bright/dim split).
export function lakeArea(f) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const poly of f.geometry.coordinates)
    for (const ring of poly)
      for (const [x, y] of ring) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
  return (x1 - x0) * (y1 - y0);
}

// Remote OSM islands (islands.topo.json `blob`) bake at least this wide, in
// 4096-texture texels (~13 km), so a 2 km atoll still reads as a dot of land.
export const ISLAND_BLOB_TEXELS = 1.5;

// The land texture is baked in three passes on one canvas so the globe can
// show as soon as the land fill arrives: buildLandTexture (land + shelf haze,
// R/B), then addCoastGlow (G) once the 10m coast lands, then knockOutLakes.
// The passes commute: the glow only adds G and the lake multiply keeps G, so
// the result matches the old single-pass bake. The caller sets needsUpdate;
// each re-upload of the 4096 texture is costly, so glow and lakes share one.
export function buildLandTexture(geo, islands) {
  const maxTex = renderer.capabilities.maxTextureSize;
  const W = maxTex >= 4096 ? 4096 : 2048;
  const H = W / 2;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  // CPU-backed: on a GPU-raster canvas the blurs are deferred to the GPU
  // process, and drawing passes after the first upload stalled frames for
  // 15+ s in a software-GL test
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  const land = new Path2D();
  for (const f of geo.features) {
    if (f.properties.kind !== 'land') continue;
    for (const poly of f.geometry.coordinates) {
      if (ringExtent(poly[0]) < MIN_ISLAND) continue; // same islands the outline drops
      for (const ring of poly) {
        if (ring !== poly[0] && ringExtent(ring) < MIN_ISLAND) continue; // and pinhole lakes
        const pts = unwrap(ring);
        const span = pts[pts.length - 1][0] - pts[0][0];
        if (Math.abs(span) > 180) {
          // ring encircles a pole (Antarctica): close it along the pole edge
          const poleLat = pts.reduce((s, p) => s + p[1], 0) / pts.length < 0 ? -90 : 90;
          pts.push([pts[pts.length - 1][0], poleLat], [pts[0][0], poleLat]);
        }
        addToPath(land, pts, W, H, true);
      }
    }
  }

  // Supplemental OSM islands: own path, nonzero fill, so one lying over coarse
  // base land can't punch an evenodd hole in it. No MIN_ISLAND rule.
  const isles = new Path2D();
  const blobs = new Path2D();
  for (const f of islands.features) {
    for (const [ring] of f.geometry.coordinates) {
      const pts = unwrap(ring);
      addToPath(isles, pts, W, H, true);
      if (f.properties.blob) addToPath(blobs, pts, W, H, true);
    }
  }

  const s = W / 4096;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // all land in the current fill colour: base land, islands at true size, and
  // remote islands stroked out to their minimum blob size
  const fillLand = () => {
    ctx.fill(land, 'evenodd');
    ctx.fill(isles);
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = ISLAND_BLOB_TEXELS * s;
    ctx.stroke(blobs);
    ctx.restore();
  };

  // B: broad shelf haze around landmasses
  ctx.fillStyle = 'rgb(0,0,140)';
  ctx.shadowColor = 'rgb(0,0,255)';
  ctx.shadowBlur = 46 * s;
  fillLand();
  ctx.shadowBlur = 16 * s;
  fillLand();

  // R: land fill
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgb(255,0,0)';
  ctx.strokeStyle = 'rgb(255,0,0)';
  ctx.lineWidth = 1 * s;
  fillLand();
  ctx.stroke(land);

  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

export function addCoastGlow(tex, coastLines) {
  const cv = tex.image;
  const W = cv.width;
  const H = cv.height;
  const s = W / 4096;
  const ctx = cv.getContext('2d');
  const coast = new Path2D();
  for (const line of coastLines) addToPath(coast, unwrap(line), W, H, false);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // G: coastal glow as a soft halo only. The crisp core is the vector outline;
  // a baked core stroke here sat under it, a texel off, and read as a doubled,
  // fuzzy edge. Draw the stroke off-canvas and keep just its shadow.
  ctx.save();
  ctx.translate(-2 * W, 0);
  ctx.shadowOffsetX = 2 * W;
  ctx.strokeStyle = '#000';
  ctx.shadowColor = 'rgb(0,92,0)';
  ctx.lineWidth = 1.35 * s;
  ctx.shadowBlur = 10 * s;
  ctx.stroke(coast);
  ctx.shadowColor = 'rgb(0,68,0)';
  ctx.shadowBlur = 3.5 * s;
  ctx.stroke(coast);
  ctx.restore();
  // Internal country borders are intentionally never drawn: coastlines only.
}

export function knockOutLakes(tex, lakes) {
  const cv = tex.image;
  const W = cv.width;
  const H = cv.height;
  const ctx = cv.getContext('2d');
  // big lakes, island rings included so evenodd keeps lake islands as land
  const water = new Path2D();
  for (const f of lakes.features) {
    for (const poly of f.geometry.coordinates) {
      for (const ring of poly) {
        if (ring !== poly[0] && ringExtent(ring) < MIN_ISLAND) continue;
        addToPath(water, unwrap(ring), W, H, true);
      }
    }
  }
  // knock lakes out of the land fill (R -> 0) and dim the shelf haze under
  // them (B) to a near-shore level; at full haze a lake is as bright as land
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgb(0,255,30)';
  ctx.fill(water, 'evenodd');
  ctx.restore();
}

export const outlineMaterials = [];
export const outlineMeshes = [];
export function buildOutline(lines, radius, opts) {
  const pos = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      latLngToVec3(line[i - 1][1], line[i - 1][0], 1, a);
      latLngToVec3(line[i][1], line[i][0], 1, b);
      const steps = Math.max(1, Math.ceil(a.angleTo(b) / (1.2 * DEG)));
      p.copy(a).multiplyScalar(radius);
      for (let k = 1; k <= steps; k++) {
        q.copy(a).lerp(b, k / steps).normalize().multiplyScalar(radius);
        pos.push(p.x, p.y, p.z, q.x, q.y, q.z);
        p.copy(q);
      }
    }
  }
  const geo = new LineSegmentsGeometry();
  geo.setPositions(pos);
  // Drawn as independent segments, so neighbours overlap at every vertex. With
  // opacity < 1 those overlaps double up into a beaded, jittery line; the line
  // is only transparent during the reveal fade, then goes opaque.
  const mat = new LineMaterial({
    color: opts.color,
    linewidth: opts.width,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  mat.userData.baseOpacity = opts.opacity ?? 1;
  // per-layer fade-in clock: layers arrive at different times while loading
  mat.userData.reveal = 0;
  outlineMaterials.push(mat);
  const mesh = new LineSegments2(geo, mat);
  mesh.renderOrder = 2;
  mesh.userData.radius = radius;
  outlineMeshes.push(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// Satellite imagery (docs/satellite-plan.md)
// Satellite is the default and only user-facing map. The stylized ("classic")
// map always loads underneath, so a failed fetch just leaves it showing.
// ?map=classic forces the stylized map for testing; it is kept intact for a
// future mode.
//   base:   the whole world in one local 2048x1024 equirectangular texture
//   insets: two detail windows (A under B) that follow the camera at z4-z9,
//           filled tile by tile once the camera settles (see "Detail insets")
// ---------------------------------------------------------------------------
export const SAT_PROVIDERS = [
  {
    id: 'eox2025',
    // ?v=3: 2025 imagery replaced 2016, bust edge and browser cache
    // policy without Access-Control-Allow-Origin (immutable, 1 year); a new
    // query string is a new cache key, so every tile is fetched with CORS.
    tiles: 'https://tiles.where-on.earth/tiles/{z}/{x}/{y}.jpg?v=3',
    base: './assets/eox-z4-base-2k.jpg',
    credit: 'EOxCloudless <a href="https://cloudless.eox.at" target="_blank" rel="noopener">https://cloudless.eox.at</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)',
    // z9 mirrored wide (13x17 per location) and z10 over the same ground,
    // 2026-10-27 (eox-z9/download_tiles.py); beyond the mirror the game
    // upscales from the nearest mirrored ancestor.
    maxZ: 10,
  },
  {
    id: 's2gm2025',
    // Our own mosaic (docs/eox-r2-upload.md): rendered locally from the
    // Copernicus Sentinel-2 quarterly mosaics, served from our R2 bucket.
    // ?v=2: the z4-z8 tiles were repaired (lakes, snow) and z9 detail added;
    // a new query string is a new cache key for every tile.
    tiles: 'https://tiles.where-on.earth/s2gm2025/{z}/{x}/{y}.jpg?v=2',
    // ?v=2 on the base too: the bare URL can be served from the CDN edge
    // cache without a CORS allow header (the cached variant predates the
    // per-origin policy), which fails the texture load exactly like a
    // missing whitelist entry. A fresh query string is a fresh cache key.
    base: 'https://tiles.where-on.earth/s2gm2025/base-ours.jpg?v=2',
    credit: 'Satellite imagery: our own mosaic, built from Copernicus Sentinel data 2025 and processed locally',
    maxZ: 9,
  },
];
export const DEFAULT_SAT_PROVIDER_ID = 'eox2025';
export const tileURL = (provider, z, y, x) => provider.tiles
  .replace('{z}', z).replace('{x}', x).replace('{y}', y);
export const getSatProvider = () => {
  const id = new URLSearchParams(location.search).get('sat');
  return SAT_PROVIDERS.find((provider) => provider.id === id)
    || SAT_PROVIDERS.find((provider) => provider.id === DEFAULT_SAT_PROVIDER_ID);
};
export const SAT_FADE_S = 0.4;
let mapStyle; // read in initImagery(), after main.js has handled ?reset=daily
export let satTarget = 0; // uSatMix eases toward this
export let satT = 0;
export let satApplied = 0; // last satT pushed to the uniforms and overlays
export let satProvider = null; // tile provider used only by the detail insets
export let satDisabled = false; // for the session, after a second context loss

export async function loadSatBase(provider) {
  const tex = await new THREE.TextureLoader().loadAsync(provider.base);
  tex.colorSpace = THREE.NoColorSpace; // globeMat writes gl_FragColor raw
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

export function showSatToast(text) {
  const el = document.createElement('div');
  el.className = 'sat-toast';
  el.textContent = text;
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3500);
}

// Load the local NASA base first. Esri is retained only for detail insets.
// Resolves true once satellite is up, false when classic is what shows.
export async function initSatellite() {
  if (mapStyle !== 'satellite') return false;
  try {
    satProvider = getSatProvider();
    const base = await loadSatBase(satProvider);
    if (satDisabled) { base.dispose(); return false; }
    globeMat.uniforms.uSatBase.value = base;
    satTarget = 1;
    return true;
  } catch (err) {
    console.warn(err);
  }
  showSatToast('Satellite view unavailable, showing classic map.');
  return false;
}
let satReady;

// ---------------------------------------------------------------------------
// Detail insets
// Two render-target textures hold a window of z4-z9 tiles around the view.
// A new window fills the buffer that isn't showing, drawn on top (B) and
// cleared to alpha 0, so unloaded tiles show the older inset or the base.
// Once every visible tile has landed, the old buffer fades out underneath.
// Nothing fetches or uploads while the camera moves fast; a window is only
// chosen once it settles (or, during the slow idle drift, when the view
// outruns the current window).
// ---------------------------------------------------------------------------
export const INSET_MIN_Z = 4;
export const INSET_Q = devicePixelRatio >= 2 ? 0.5 : 1; // target texels per css px: 1 = css px, 0.5 = device px
let INSET_COLS; // footprint cap in tiles, margin included
let INSET_ROWS;
export const INSET_FADE_S = 0.25;
export const INSET_FETCHES = 6;
export const INSET_FETCHES_SLOW = 3;
export const INSET_UPLOADS_PER_FRAME = 4;
export const INSET_SETTLE_MS = 150;
export const INSET_FAST_PX_S = 400; // screen speed above which nothing streams
export const INSET_STILL_PX_S = 25;
export const INSET_LRU_TILES = 400;
export const INSET_LRU_BYTES = 8 << 20;
export const INSET_TRIES = 2;
export const MERC_MAX_LAT = 85.05112878 * DEG;
export const imod = (a, n) => ((a % n) + n) % n;

export const inset = {
  bufs: null, // [{ rt, bounds, mix, fadeTo, win }]; bufs[over] draws on top
  over: 0,
  win: null, // window being fed (fetch/decode/upload target); null = off
  gen: 0,
  queue: [], // tiles of `win` waiting for a fetch slot, centre first
  prefetch: [], // z+1 sources warmed only after the needed queue is empty
  prefetchGen: 0,
  inflight: new Map(), // tile key -> { ctrl }
  uploads: [], // decoded bitmaps waiting for a frame's upload budget
  lru: new Map(), // tile key -> compressed Blob, oldest first
  lruBytes: 0,
  missing: new Set(), // tile keys that 404 (open ocean): never refetched
  fails: 0, // consecutive fetch failures
  trips: 0, // breaker trips since the last success (exponential backoff)
  pausedUntil: 0,
  latency: [], // last few fetch times, for the slow-network fallback
  slow: false,
  prevYaw: 0, prevPitch: 0, prevDist: 0, hasPrev: false,
  stillSince: -1,
  lastCheck: 0,
  lastBuild: 0,
  losses: 0, // webgl context losses this session
};

export const _tileSrc = new THREE.Texture(); // wrapper so copyTextureToTexture reads an ImageBitmap
export const _tileDst = new THREE.Vector2();
export const _insetRay = new THREE.Raycaster();
export const _insetNdc = new THREE.Vector2();
export const _insetP = new THREE.Vector3();
export const _insetQ = new THREE.Quaternion();
export const _origin = new THREE.Vector3();
export const _insetSphere = new THREE.Sphere(new THREE.Vector3(), 1);
export const _insetClear = new THREE.Color();

export function ensureInsets() {
  if (inset.bufs) return inset.bufs;
  inset.bufs = [0, 1].map(() => {
    const rt = new THREE.WebGLRenderTarget(INSET_COLS * 256, INSET_ROWS * 256, { depthBuffer: false, colorSpace: THREE.NoColorSpace });
    rt.texture.generateMipmaps = false; // copyTextureToTexture would rebuild them per tile; we do it once per window
    return { rt, bounds: new THREE.Vector4(0, 0, 1, 1), mix: 0, fadeTo: 0, win: null };
  });
  return inset.bufs;
}

// Mip levels are built once per completed window with raw GL (three only sets
// sampler state at upload time, and render-target textures never re-upload).
// While a window fills, sampling stays on level 0 so stale levels never show.
export function setInsetMips(buf, on) {
  const gl = renderer.getContext();
  const handle = renderer.properties.get(buf.rt.texture).__webglTexture;
  if (!handle || gl.isContextLost()) return;
  renderer.state.bindTexture(gl.TEXTURE_2D, handle);
  if (on) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, on ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
}

export function clearInset(buf) {
  const prev = renderer.getRenderTarget();
  renderer.getClearColor(_insetClear);
  const prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(buf.rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, false, false);
  renderer.setRenderTarget(prev);
  renderer.setClearColor(_insetClear, prevAlpha);
  setInsetMips(buf, false);
}

export function lruGet(key) {
  const blob = inset.lru.get(key);
  if (blob) { inset.lru.delete(key); inset.lru.set(key, blob); }
  return blob;
}

export function lruPut(key, blob) {
  const old = inset.lru.get(key);
  if (old) { inset.lruBytes -= old.size; inset.lru.delete(key); }
  inset.lru.set(key, blob);
  inset.lruBytes += blob.size;
  while (inset.lru.size > INSET_LRU_TILES || inset.lruBytes > INSET_LRU_BYTES) {
    const [k, b] = inset.lru.entries().next().value;
    inset.lru.delete(k);
    inset.lruBytes -= b.size;
  }
}

// Globe-local unit point under an NDC point; rays that miss the globe take
// the nearest point on the limb, so a view showing space still bounds itself.
export function insetPointAt(nx, ny, out) {
  _insetRay.setFromCamera(_insetNdc.set(nx, ny), camera);
  const hit = _insetRay.ray.intersectSphere(_insetSphere, out);
  if (!hit) _insetRay.ray.closestPointToPoint(_origin, out);
  out.normalize().applyQuaternion(_insetQ);
  return hit;
}

export const mercX = (p) => { const a = Math.atan2(p.z, -p.x) / (2 * Math.PI); return a < 0 ? a + 1 : a; };
export const mercY = (p) => {
  const lat = clamp(Math.asin(clamp(p.y, -1, 1)), -MERC_MAX_LAT, MERC_MAX_LAT);
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + lat / 2)) / (2 * Math.PI);
};

// The visible region in Mercator units, from a 9x9 grid of screen rays. x is
// kept relative to the screen centre in [-0.5, 0.5) so a view across the
// antimeridian stays one contiguous range.
export function sampleInsetView() {
  _insetQ.copy(globe.quaternion).invert();
  if (!insetPointAt(0, 0, _insetP)) return null;
  const cx = mercX(_insetP);
  const view = { cx, cy: mercY(_insetP), lat: Math.asin(clamp(_insetP.y, -1, 1)), rx0: 0, rx1: 0, y0: 1, y1: 0 };
  const N = 9;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      insetPointAt((i / (N - 1)) * 2 - 1, (j / (N - 1)) * 2 - 1, _insetP);
      let rx = mercX(_insetP) - cx;
      rx -= Math.round(rx);
      const my = mercY(_insetP);
      view.rx0 = Math.min(view.rx0, rx); view.rx1 = Math.max(view.rx1, rx);
      view.y0 = Math.min(view.y0, my); view.y1 = Math.max(view.y1, my);
    }
  }
  return view;
}

// Tile window at zoom z: visible tiles plus a one-tile margin, or null when
// that footprint doesn't fit the inset texture. tx is unwrapped (it may run
// past either edge of the world); fetches wrap it.
export function insetWindowAt(view, z) {
  const n = 1 << z;
  const vx0 = Math.floor((view.cx + view.rx0) * n);
  const vx1 = Math.floor((view.cx + view.rx1) * n);
  const vy0 = clamp(Math.floor(view.y0 * n), 0, n - 1);
  const vy1 = clamp(Math.floor(view.y1 * n), 0, n - 1);
  const tx0 = vx0 - 1;
  const cols = vx1 - vx0 + 3;
  const ty0 = Math.max(0, vy0 - 1);
  const rows = Math.min(n - 1, vy1 + 1) - ty0 + 1;
  if (cols > INSET_COLS || rows > INSET_ROWS) return null;
  return { z, n, tx0, ty0, cols, rows, vx0, vx1, vy0, vy1, ccx: view.cx * n, ccy: view.cy * n };
}

// z = ceil(log2(156543 cos(lat) / (mpp q))), clamped to [4, provider max],
// one level lower on a slow network, then dropped until the footprint fits.
// Returns { view, want } with want = null when the inset should be off.
export function pickInsetWindow() {
  const view = sampleInsetView();
  if (!view) return { view, want: null };
  const mpp = ((state.dist - 1) * 6371000 * 2 * Math.tan((FOV / 2) * DEG)) / state.viewH;
  let z = Math.ceil(Math.log2((156543.03 * Math.cos(view.lat)) / (mpp * INSET_Q)));
  z = clamp(z, INSET_MIN_Z, satProvider.maxZ);
  if (inset.slow) z = Math.max(INSET_MIN_Z, z - 1);
  for (; z >= INSET_MIN_Z; z--) {
    const want = insetWindowAt(view, z);
    if (want) return { view, want };
  }
  return { view, want: null };
}

// Does window `win` already hold every visible tile of `want` (same zoom)?
export function insetCovers(win, want) {
  if (!win || !want || win.z !== want.z) return false;
  if (want.vy0 < win.ty0 || want.vy1 > win.ty0 + win.rows - 1) return false;
  return imod(want.vx0 - win.tx0, win.n) + (want.vx1 - want.vx0) <= win.cols - 1;
}

export function startInsetWindow(want) {
  const bufs = ensureInsets();
  // Keep whatever shows underneath: a completed top window always, a partly
  // filled one unless the buffer below is complete. Refilling a top that
  // already shows tiles would blank them back to the base.
  const top = bufs[inset.over].win;
  const under = bufs[1 - inset.over].win;
  if (top && (top.ready || (top.loaded > 0 && !(under && under.ready)))) inset.over = 1 - inset.over;
  const buf = bufs[inset.over];
  clearInset(buf);
  buf.mix = 0;
  buf.fadeTo = 0; // stay hidden until every visible tile can crossfade together
  const { z, n } = want;
  const x0 = imod(want.tx0, n) / n;
  buf.bounds.set(x0, want.ty0 / n, x0 + INSET_COLS / n, (want.ty0 + INSET_ROWS) / n);
  const win = { ...want, providerId: satProvider.id, gen: ++inset.gen, buf, tiles: [], visLeft: 0, visMissing: 0, allLeft: 0, loaded: 0, ready: false, mipped: false };
  for (let sy = 0; sy < want.rows; sy++) {
    for (let sx = 0; sx < want.cols; sx++) {
      const tx = want.tx0 + sx;
      const ty = want.ty0 + sy;
      const x = imod(tx, n);
      const visible = tx >= want.vx0 && tx <= want.vx1 && ty >= want.vy0 && ty <= want.vy1;
      const tile = {
        x, y: ty, sx, sy, visible,
        k: 0, src: '', url: '', // source: own tile (k = 0) or the ancestor k levels up
        pri: (visible ? 0 : 1000) + Math.hypot(tx + 0.5 - want.ccx, ty + 0.5 - want.ccy),
        state: 0, // 0 idle, 1 decoding / awaiting upload, 2 done (uploaded or given up)
        tries: 0,
        gen: win.gen,
      };
      setInsetSrc(win, tile);
      while (inset.missing.has(tile.src) && tile.k < z) { tile.k++; setInsetSrc(win, tile); }
      win.tiles.push(tile);
      win.allLeft++;
      if (visible) win.visLeft++;
    }
  }
  win.tiles.sort((a, b) => a.pri - b.pri);
  buf.win = win;
  // abort fetches the new window doesn't need; the rest land in it
  const srcs = new Set(win.tiles.map((t) => t.src));
  for (const [key, f] of inset.inflight) {
    if (!srcs.has(key)) { f.ctrl.abort(); inset.inflight.delete(key); }
  }
  inset.prefetch = [];
  inset.prefetchGen = 0;
  inset.win = win;
  inset.lastBuild = performance.now();
  feedInsetWindow(win);
}

// R2 holds every tile only at z0-3; z4+ is just the 3x3 around each location
// (scripts/prefetch-eox-tiles.mjs). A tile it doesn't hold is filled from its
// nearest ancestor, cropped and upscaled, so the view stays one EOX mosaic
// instead of stepping to the NASA base at hard tile edges.
export function setInsetSrc(win, t) {
  const z = win.z - t.k;
  const x = t.x >> t.k;
  const y = t.y >> t.k;
  t.src = `${win.providerId}/${z}/${x}/${y}`;
  t.url = tileURL(satProvider, z, y, x);
}

// Start an idle tile from its source: cached blob, a fetch already in flight
// (it is delivered here when it lands), or the fetch queue in priority order.
// Known-missing sources step up to the parent.
export function loadInsetTile(win, t) {
  while (inset.missing.has(t.src)) {
    if (t.k >= win.z) { finishInsetTile(win, t); return; }
    t.k++;
    setInsetSrc(win, t);
  }
  const inflight = inset.inflight.get(t.src);
  if (inflight) { inflight.prefetch = false; return; }
  const blob = lruGet(t.src);
  if (blob) { decodeInsetTile(win, t, blob); return; }
  const q = inset.queue;
  const i = q.findIndex((o) => o.pri > t.pri);
  q.splice(i < 0 ? q.length : i, 0, t);
  for (const [key, f] of inset.inflight) {
    if (f.prefetch) { f.ctrl.abort(); inset.inflight.delete(key); }
  }
}

// Queue every idle tile: straight to decode from the blob cache, else fetch.
export function feedInsetWindow(win) {
  inset.queue = [];
  for (const t of win.tiles) if (t.state === 0) loadInsetTile(win, t);
}

export function insetsOff() {
  if (inset.win) {
    for (const f of inset.inflight.values()) f.ctrl.abort();
    inset.inflight.clear();
    inset.queue = [];
    inset.prefetch = [];
    inset.prefetchGen = 0;
    inset.win = null;
  }
  if (inset.bufs) for (const b of inset.bufs) b.fadeTo = 0;
}

export function finishInsetTile(win, t, covered = false) {
  if (t.state === 2) return;
  t.state = 2;
  win.allLeft--;
  if (t.visible) { win.visLeft--; if (!covered) win.visMissing++; }
  if (!win.ready && win.visLeft === 0) {
    win.ready = true;
    const other = inset.bufs[inset.bufs[0] === win.buf ? 1 : 0];
    win.buf.fadeTo = 1;
    other.fadeTo = win.visMissing ? 1 : 0; // retain old coverage under transparent holes
  }
  if (!win.mipped && win.allLeft === 0) {
    win.mipped = true;
    setInsetMips(win.buf, true);
  }
}

// A failed tile retries once (after any breaker pause), then is given up so
// the window can complete; the base or older inset shows through there.
export function failInsetTile(win, t) {
  t.state = 0;
  if (++t.tries >= INSET_TRIES) finishInsetTile(win, t);
  else if (inset.win === win) loadInsetTile(win, t);
}

// The part of ancestor bitmap `bmp` under tile t, upscaled to a 256 px tile.
// drawImage filters across the crop edge from the real neighbouring pixels,
// so adjacent fallback tiles stay continuous.
export let _insetCrop = null;
export function cropInsetTile(t, bmp) {
  if (!_insetCrop) _insetCrop = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  const ctx = _insetCrop.getContext('2d');
  const m = (1 << t.k) - 1;
  const s = 256 / (1 << t.k);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, (t.x & m) * s, (t.y & m) * s, s, s, 0, 0, 256, 256);
  bmp.close();
  return createImageBitmap(_insetCrop);
}

export function decodeInsetTile(win, t, blob) {
  t.state = 1;
  const stale = () => inset.win !== win || win.buf.win !== win;
  createImageBitmap(blob)
    .then((bmp) => {
      if (stale()) { bmp.close(); return null; }
      if (bmp.width !== 256 || bmp.height !== 256) { bmp.close(); throw new Error('tile size'); }
      return t.k ? cropInsetTile(t, bmp) : bmp;
    })
    .then((bmp) => {
      if (!bmp) { t.state = 0; return; }
      if (stale()) { bmp.close(); t.state = 0; return; }
      inset.uploads.push({ win, t, bmp });
    }, () => failInsetTile(win, t));
}

// Circuit breaker: 5 consecutive failures or any 429 pause detail loading,
// 60 s doubling per trip (capped at 8 min). Silent; base + current inset stay.
export function tripInsetBreaker() {
  inset.fails = 0;
  // the other in-flight requests of a burst land after the trip; one pause per burst
  if (performance.now() < inset.pausedUntil) return;
  inset.trips++;
  inset.pausedUntil = performance.now() + Math.min(60000 * 2 ** (inset.trips - 1), 480000);
}

// Slow network (iOS has no navigator.connection): rolling median latency
// over 1.5 s drops the inset a zoom level and halves concurrency; under 0.6 s
// restores it.
export function noteInsetLatency(ms) {
  const l = inset.latency;
  l.push(ms);
  if (l.length > 15) l.shift();
  if (l.length < 5) return;
  const med = [...l].sort((a, b) => a - b)[l.length >> 1];
  if (med > 1500) inset.slow = true;
  else if (med < 600) inset.slow = false;
}

// One fetch per source key; every tile of the current window waiting on that
// source gets the result (several tiles can share an ancestor).
export function fetchInsetTile(t) {
  const key = t.src;
  const ctrl = new AbortController();
  const entry = { ctrl, prefetch: !!t.prefetch };
  inset.inflight.set(key, entry);
  const wanted = !!(inset.win && inset.win.tiles.some((tile) => tile.src === key));
  window.__tileRound2Log?.({ event: 'start', z: t.z ?? inset.win?.z - t.k, x: t.x, y: t.y, src: key, wanted, prefetch: !!t.prefetch });
  ctrl.signal.addEventListener('abort', () => {
    const wantedNow = !!(inset.win && inset.win.tiles.some((tile) => tile.src === key));
    window.__tileRound2Log?.({ event: 'abort', z: t.z ?? inset.win?.z - t.k, x: t.x, y: t.y, src: key, wanted: wantedNow, prefetch: entry.prefetch });
  }, { once: true });
  const t0 = performance.now();
  fetch(t.url, { signal: ctrl.signal, mode: 'cors', priority: t.visible ? 'high' : 'low' })
    .then((r) => {
      if (r.status === 429) { tripInsetBreaker(); throw new Error('HTTP 429'); }
      if (r.status === 404) return null; // no tile here (ocean): not a failure
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.blob();
    })
    .then((blob) => {
      noteInsetLatency(performance.now() - t0);
      inset.fails = 0;
      inset.trips = 0;
      if (blob) lruPut(key, blob);
      else inset.missing.add(key);
      // deliver to whichever window wants this source now; a missing source
      // sends its tiles on to the parent (z0-3 always exist, so it ends)
      const win = inset.win;
      if (!win) return;
      for (const tile of win.tiles) {
        if (tile.state !== 0 || tile.src !== key) continue;
        if (blob) decodeInsetTile(win, tile, blob);
        else loadInsetTile(win, tile);
      }
    })
    .catch((err) => {
      if (err.name === 'AbortError') return;
      if (++inset.fails >= 5) tripInsetBreaker();
      if (inset.inflight.get(key) === entry) inset.inflight.delete(key);
      const win = inset.win;
      if (!win) return;
      for (const tile of win.tiles) if (tile.state === 0 && tile.src === key) failInsetTile(win, tile);
    })
    .finally(() => { if (inset.inflight.get(key) === entry) inset.inflight.delete(key); });
}

export function pumpInsetFetches(now) {
  if (!inset.win || navigator.onLine === false || now < inset.pausedUntil) return;
  const max = inset.slow ? INSET_FETCHES_SLOW : INSET_FETCHES;
  while (inset.inflight.size < max && inset.queue.length) {
    const t = inset.queue.shift();
    if (t.gen !== inset.win.gen || t.state !== 0 || inset.inflight.has(t.src)) continue;
    fetchInsetTile(t);
  }
  if (inset.slow || state.gameMode !== 'guess' || inset.queue.length || !inset.win.ready) return;
  prepareInsetPrefetch(false);
  while (inset.inflight.size < max && inset.prefetch.length) {
    const t = inset.prefetch.shift();
    if (inset.inflight.has(t.src) || inset.lru.has(t.src) || inset.missing.has(t.src)) continue;
    fetchInsetTile(t);
  }
}

// Warm the next zoom level without occupying a slot needed by the live
// window. A gesture refreshes the list centre-first and drops unrelated
// speculative fetches; ordinary calls preserve the current list.
export function prepareInsetPrefetch(prioritize) {
  const win = inset.win;
  if (!win || !win.ready || inset.slow || state.gameMode !== 'guess' || win.z >= satProvider.maxZ) return;
  if (inset.prefetchGen === win.gen && !prioritize) return;
  const z = win.z + 1;
  const n = 1 << z;
  const seen = new Set();
  const next = [];
  for (const tile of win.tiles) {
    if (!tile.visible) continue;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const x = imod(tile.x * 2 + dx, n);
      const y = tile.y * 2 + dy;
      const src = `${win.providerId}/${z}/${x}/${y}`;
      if (seen.has(src)) continue;
      seen.add(src);
      next.push({ x, y, z, src, url: tileURL(satProvider, z, y, x), prefetch: true,
        pri: Math.hypot(x + 0.5 - win.ccx * 2, y + 0.5 - win.ccy * 2) });
    }
  }
  next.sort((a, b) => a.pri - b.pri);
  inset.prefetch = next;
  inset.prefetchGen = win.gen;
  if (prioritize) {
    for (const [key, f] of inset.inflight) {
      if (f.prefetch && !seen.has(key)) { f.ctrl.abort(); inset.inflight.delete(key); }
    }
  }
}

export function prioritizeInsetZoom() {
  prepareInsetPrefetch(true);
  if (!inset.queue.length) pumpInsetFetches(performance.now());
}

// Frame budget: at most 4 tile sub-uploads (texSubImage2D) per frame.
export function pumpInsetUploads() {
  for (let done = 0; done < INSET_UPLOADS_PER_FRAME && inset.uploads.length;) {
    const { win, t, bmp } = inset.uploads.shift();
    if (inset.win !== win || win.buf.win !== win) { bmp.close(); t.state = 0; continue; }
    _tileSrc.image = bmp;
    renderer.copyTextureToTexture(_tileSrc, win.buf.rt.texture, null, _tileDst.set(t.sx * 256, t.sy * 256));
    _tileSrc.image = null;
    bmp.close(); // never hoard decoded pixels
    win.loaded++;
    finishInsetTile(win, t, true);
    done++;
  }
}

// Choose the window for the current view and start, resume, or keep it.
export function evaluateInsets(now, drifting) {
  const { view, want } = pickInsetWindow();
  if (!want) { insetsOff(); return; }
  const top = inset.bufs && inset.bufs[inset.over];
  const cur = top && top.win;
  if (insetCovers(cur, want)) {
    if (inset.win !== cur) { // back after an off spell: show it and finish it
      inset.win = cur;
      top.fadeTo = 1;
      feedInsetWindow(cur);
    }
    return;
  }
  // While the globe drifts, only chase it when the view outruns the window
  // or the zoom is two levels off, at most once a second.
  if (drifting && cur && inset.win === cur) {
    if (now - inset.lastBuild < 1000) return;
    if (Math.abs(cur.z - want.z) < 2 && insetCovers(cur, insetWindowAt(view, cur.z))) return;
  }
  startInsetWindow(want);
}

export function updateInsets(dt) {
  if (!satProvider || satDisabled || satTarget === 0) return;
  _insetQ.copy(globe.quaternion).invert();
  if (insetPointAt(0, 0, _insetP)) {
    const lat = Math.asin(clamp(_insetP.y, -1, 1));
    const mpp = ((state.dist - 1) * 6371000 * 2 * Math.tan((FOV / 2) * DEG)) / state.viewH;
    const detailZoom = Math.log2((156543.03 * Math.cos(lat)) / (mpp * INSET_Q));
    globeMat.uniforms.uOceanFlatFade.value = 1 - smoothstep(clamp(detailZoom - 7, 0, 1));
  }
  const now = performance.now();
  // camera motion in screen px/s at the centre, and zoom in log-altitude/s
  let speed = 0;
  let zoomRate = 0;
  if (inset.hasPrev && dt > 0) {
    const dYaw = (state.yaw - inset.prevYaw) * Math.cos(state.pitch);
    speed = Math.hypot(dYaw, state.pitch - inset.prevPitch) / dt / radPerPx();
    zoomRate = Math.abs(Math.log((state.dist - 1) / (inset.prevDist - 1))) / dt;
  }
  inset.prevYaw = state.yaw; inset.prevPitch = state.pitch; inset.prevDist = state.dist; inset.hasPrev = true;
  const easing = Math.abs(Math.log((state.targetDist - 1) / (state.dist - 1))) > 0.01;
  const fast = pointers.size > 0 || speed > INSET_FAST_PX_S || zoomRate > 0.4;
  const still = !fast && !easing && speed < INSET_STILL_PX_S && zoomRate < 0.03;
  if (!still) inset.stillSince = -1;
  else if (inset.stillSince < 0) inset.stillSince = now;
  const settled = still && now - inset.stillSince >= INSET_SETTLE_MS;

  if (!fast && (settled || !still) && now - inset.lastCheck > (settled ? 500 : 300)) {
    inset.lastCheck = now;
    evaluateInsets(now, !settled);
  }
  if (!fast) {
    pumpInsetFetches(now);
    pumpInsetUploads();
  }

  if (!inset.bufs) return;
  const u = globeMat.uniforms;
  for (const b of inset.bufs) {
    b.mix = b.fadeTo > b.mix ? Math.min(b.fadeTo, b.mix + dt / INSET_FADE_S) : Math.max(b.fadeTo, b.mix - dt / INSET_FADE_S);
  }
  const top = inset.bufs[inset.over];
  const under = inset.bufs[1 - inset.over];
  u.uInsetA.value = under.rt.texture; u.uInsetBoundsA.value = under.bounds; u.uInsetMixA.value = smoothstep(under.mix);
  u.uInsetB.value = top.rt.texture; u.uInsetBoundsB.value = top.bounds; u.uInsetMixB.value = smoothstep(top.mix);
}

export function releaseSatellite() {
  const u = globeMat.uniforms;
  if (u.uSatBase.value !== blankTex) { u.uSatBase.value.dispose(); u.uSatBase.value = blankTex; }
  insetsOff();
  for (const { bmp } of inset.uploads) bmp.close();
  inset.uploads = [];
  if (inset.bufs) { for (const b of inset.bufs) b.rt.dispose(); inset.bufs = null; }
  u.uInsetA.value = u.uInsetB.value = blankTex;
  u.uInsetMixA.value = u.uInsetMixB.value = 0;
}

export const outlineRevealOpacity = (m) => (1 - Math.pow(1 - m.userData.reveal, 3)) * (m.userData.baseOpacity ?? 1);

// Per frame: stream the insets, ease the crossfade and fade the coast/lake/
// river overlays out under the imagery. Answer outlines, pins and arcs are
// not touched.
export function updateSatellite(dt) {
  updateInsets(dt);
  if (satT === satTarget && satT === satApplied) return;
  satT = satTarget > satT ? Math.min(satTarget, satT + dt / SAT_FADE_S) : Math.max(satTarget, satT - dt / SAT_FADE_S);
  satApplied = satT;
  const s = smoothstep(satT);
  globeMat.uniforms.uSatMix.value = s;
  for (const m of outlineMaterials) {
    m.visible = s < 1;
    const opaque = s === 0 && m.userData.reveal >= 1 && (m.userData.baseOpacity ?? 1) >= 1;
    if (m.transparent === opaque) { m.transparent = !opaque; m.needsUpdate = true; }
    m.opacity = outlineRevealOpacity(m) * (1 - s);
  }
  document.body.classList.toggle('sat-on', s > 0);
}

export let landReveal = 0;
export let landLoaded = false;

// lakes-10m.geo.json is built from Natural Earth 10m lakes;
// rivers-10m-scalerank.geo.json from Natural Earth 10m rivers (all 655,
// per-feature scalerank; production uses scalerank <= 7). world-10m.geo.json
// detailed 10m coastlines; world.geo.json is still loaded for the land fill.
// The page loads the *.topo.json versions (build/make-topojson.mjs): same
// coordinates, quantized on the source's 1e-4 degree grid, ~2x smaller.
// islands.topo.json (build/make-islands.mjs): OSM outlines for island pins
// Natural Earth is too coarse to draw, already simplified at build time.
export const getJSON = (url, init) => fetch(url, init).then((r) => (r.ok ? r.json() : Promise.reject(new Error(url + ' ' + r.status))));

// ---------------------------------------------------------------------------
// Asset loading with progress
// ---------------------------------------------------------------------------
// Two phases, each with its own bar:
//  - critical: land fill + islands + locations (~2 MB). That is everything a
//    round needs, so the boot screen's bar covers only these bytes and the
//    game is revealed, playable, the moment they're built.
//  - detail: 10m coast, then lakes + rivers (~4 MB). Purely visual, fetched
//    at low priority only after the critical bytes are in (so they never
//    compete for bandwidth), drawn onto the live globe as each lands. The
//    slim pill on the start screen shows this phase.
// Every file streams through loadJSON so the bars track real bytes.
// Sizes are decoded bytes, the denominator until a response reports its own.
// Vercel compresses JSON, so its Content-Length is the compressed size and
// can't be compared with streamed (decoded) bytes. deploy.sh restamps these
// from the shipped files; drift only skews the bar, it is corrected per file
// on completion.
// Repeat visits: deploy.sh appends ?v=<content hash> to each asset URL, which
// vercel.json serves as immutable, so unchanged assets come straight from the
// HTTP cache with no revalidation round trip.
export const LOAD = {
  land: { url: 'assets/world.topo.json', size: 970247 },
  islands: { url: 'assets/islands.topo.json', size: 4605 },
  locations: { url: 'assets/locations.json', size: 1069753 },
  coast: { url: 'assets/world-10m.topo.json', size: 1681949 },
  lakes: { url: 'assets/lakes-10m.topo.json', size: 726015 },
  rivers: { url: 'assets/rivers-10m-scalerank.topo.json', size: 1782934 },
  pins: { url: 'assets/daily-pins.json', size: 18 },
  // Lazy, in no load phase: the reveal outline and Borders mode (see "Country outlines")
  countries: { url: 'assets/country-outlines.topo.json', size: 1211450 },
  countryBands: { url: 'assets/country-bands.json', size: 2855 },
  // Lazy, in no load phase: Blackout's United States scope (see "Country outlines")
  states: { url: 'assets/us-states.topo.json', size: 107056 },
  // Lazy, in no load phase: Blackout's land-cleared progress statistic
  landAreas: { url: 'assets/land-areas.json', size: 7354 },
};
for (const entry of Object.values(LOAD)) { entry.loaded = 0; entry.done = false; entry.built = false; }

export function loadJSON(entry, init) {
  return fetch(entry.url, init)
    .then(async (r) => {
      if (!r.ok) throw new Error(entry.url + ' ' + r.status);
      const len = Number(r.headers.get('content-length'));
      if (len > 0 && !r.headers.get('content-encoding')) entry.size = len;
      if (!r.body || !r.body.getReader) return r.json(); // no streaming: jumps at the end
      const reader = r.body.getReader();
      const chunks = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        entry.loaded += value.byteLength;
        if (entry.loaded > entry.size) entry.size = entry.loaded;
        queueLoadRender();
      }
      return JSON.parse(await new Blob(chunks).text());
    })
    .then((data) => {
      entry.size = entry.loaded = entry.loaded || entry.size;
      entry.done = true;
      queueLoadRender();
      return data;
    }, (err) => {
      entry.size = entry.loaded; // drop the failed remainder from the total
      entry.done = true;
      queueLoadRender();
      throw err;
    });
}

// A phase finishes when its jobs do: bytes landing is not enough, the layers
// (and the location list) also have to be built.
export const bootEl = document.getElementById('boot');
export const pillEl = document.getElementById('load-pill');
export const phaseEls = (root) => ({
  stage: root ? root.querySelectorAll('.load-stage') : [],
  fill: root ? root.querySelectorAll('.load-fill') : [],
  bar: root ? root.querySelectorAll('.load-bar') : [],
  pct: root ? root.querySelectorAll('.load-pct') : [],
  mb: root ? root.querySelectorAll('.load-mb') : [],
});
export const LOAD_PHASES = {
  critical: {
    entries: [LOAD.land, LOAD.islands, LOAD.locations],
    jobs: new Set(['map', 'locations']),
    els: phaseEls(bootEl),
    stageText() {
      if (!LOAD.land.done) return 'Loading world map…';
      if (!LOAD.locations.done) return 'Loading places…';
      return 'Almost there…';
    },
  },
  detail: {
    entries: [LOAD.coast, LOAD.lakes, LOAD.rivers],
    // On a fast connection these bytes land while the critical build still
    // holds the main thread, so the pill's visible life is mostly the layer
    // builds. Bytes fill the first half of the bar, each layer's build (weighted
    // by its size) the second, or the bar sat frozen and then jumped to 100%.
    builds: true,
    jobs: new Set(['detail']),
    els: phaseEls(pillEl),
    stageText() {
      return LOAD.coast.done ? 'Adding rivers & lakes…' : 'Sharpening coastlines…';
    },
  },
};
for (const phase of Object.values(LOAD_PHASES)) { phase.finished = false; phase.shown = 0; }
export let globeRevealed = false;
export let loadRenderQueued = false;

export function queueLoadRender() {
  if (loadRenderQueued) return;
  loadRenderQueued = true;
  requestAnimationFrame(() => { loadRenderQueued = false; renderLoad(); });
}

export function renderPhase(phase) {
  let loaded = 0;
  let total = 0;
  let built = 0;
  for (const entry of phase.entries) {
    loaded += entry.loaded;
    total += entry.size;
    if (entry.built) built += entry.size;
  }
  // progress in bytes, plus the built layers' bytes again for a building phase
  const progress = loaded + built;
  const span = phase.builds ? 2 * total : total;
  // Ease the shown progress toward the real one (20% of the gap per frame), so
  // a burst of chunks glides instead of jumps. Once every byte is in, snap:
  // a layer build is about to block the main thread, and the fill's CSS
  // transform transition runs on the compositor, so it still glides there.
  if (phase.entries.every((entry) => entry.done)) {
    phase.shown = progress;
  } else if (Math.abs(progress - phase.shown) > 1000) {
    phase.shown += (progress - phase.shown) * 0.2;
    queueLoadRender(); // keep animating until caught up
  } else {
    phase.shown = progress;
  }
  // hold at 99% while the last layers build, so 100% means really ready
  const frac = phase.finished ? 1 : Math.min(0.99, span ? phase.shown / span : 0);
  const pct = Math.round(frac * 100);
  // the MB readout counts downloaded bytes only
  const mb = (phase.finished ? total : Math.min(phase.shown, loaded)) / 1e6;
  const stage = phase.finished ? 'Ready' : phase.stageText();
  const { els } = phase;
  els.stage.forEach((el) => { if (el.textContent !== stage) el.textContent = stage; });
  els.fill.forEach((el) => { el.style.transform = `scaleX(${frac})`; });
  els.bar.forEach((el) => el.setAttribute('aria-valuenow', String(pct)));
  els.pct.forEach((el) => { el.textContent = pct + '%'; });
  els.mb.forEach((el) => { el.textContent = `${mb.toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`; });
}

export function renderLoad() {
  if (bootEl) bootEl.classList.remove('pending');
  renderPhase(LOAD_PHASES.critical);
  renderPhase(LOAD_PHASES.detail);
}

export function loadJobDone(phaseName, job) {
  const phase = LOAD_PHASES[phaseName];
  phase.jobs.delete(job);
  if (phase.jobs.size || phase.finished) return;
  phase.finished = true;
  renderLoad();
  if (phase === LOAD_PHASES.critical) revealGlobe();
  else if (pillEl) {
    pillEl.classList.add('done');
    setTimeout(() => { pillEl.classList.remove('on'); }, 700);
  }
}

// Boot screen out, playable globe in. Called once the critical phase is done
// (or failed, so the error banner isn't left behind a loading screen).
export function revealGlobe() {
  if (globeRevealed) return;
  globeRevealed = true;
  if (bootEl) {
    bootEl.classList.add('done');
    setTimeout(() => { bootEl.hidden = true; }, 600);
  }
  // CSS delays the pill's fade-in, so detail that's nearly done (or already
  // cached) never flashes it
  if (pillEl && detailStarted && !LOAD_PHASES.detail.finished) pillEl.classList.add('on');
}

// Let the browser paint the previous stage before the next CPU-heavy build.
export const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
// Detail builds block the main thread for a second or more each on a phone.
// Before one starts, paint the pill's new value and give the fill's .35s
// transition time to finish: an engine that doesn't run it off the main
// thread would otherwise hold the bar where it was until the build ends.
// Detail is background work, so the short wait costs nothing visible.
export const settleDetailBar = (entry) => {
  if (entry) entry.built = true;
  queueLoadRender();
  return nextPaint().then(() => new Promise((resolve) => setTimeout(resolve, 350)));
};

// Decode delta arcs ourselves as (q + t/s) / 1e4: division is correctly
// rounded, so points are bit-identical to parsing the original GeoJSON
// (topojson's q * 1e-4 + t leaves float noise that nudges the simplifier).
export function topoFeatures(topo) {
  const { scale, translate } = topo.transform;
  const k = 1 / scale[0];
  const tx = Math.round(translate[0] * k);
  const ty = Math.round(translate[1] * k);
  const arcs = topo.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => [((x += dx) + tx) / k, ((y += dy) + ty) / k]);
  });
  return topoFeature({ ...topo, transform: undefined, arcs }, topo.objects.data);
}
export const getTopo = (entry, init) => loadJSON(entry, init).then(topoFeatures);
let mapLab; // built in initAssets(), after main.js has handled ?reset=daily

// Critical: the land fill (with OSM islands) is all a round needs on the globe.
export async function loadLand() {
  await criticalBytesP;
  await nextPaint();
  const [geo, islands] = await Promise.all([landP, islandsP]);
  const tex = buildLandTexture(geo, islands);
  globeMat.uniforms.uMap.value = tex;
  globeMat.uniforms.uMapTexel.value.set(1 / tex.image.width, 1 / tex.image.height);
  landLoaded = true;
  if (window.__boot) window.__boot('land loaded');
  return { tex, islands };
}

// Detail: drawn onto the live globe in the background, each layer as it lands.
export async function loadDetail({ tex, islands }, { coastP, lakesP, riversP, detailBytesP }) {
  // Internal country borders hidden: coastlines only, keeps the challenge in
  // your geography, not in reading lines. (Border data stays in the GeoJSON
  // for a future practice mode.) Big-lake shores count as coastline, and so
  // do the OSM islands, which skip cleanCoast's MIN_ISLAND rule.
  await detailBytesP;
  const geo10m = await coastP;
  await settleDetailBar();
  const coast = [
    ...cleanCoast(geo10m.features.find((f) => f.properties.kind === 'coast').geometry.coordinates),
    ...islands.features.flatMap((f) => f.geometry.coordinates.map(([ring]) => ring)),
  ];
  addCoastGlow(tex, coast); // uploaded with the lakes pass below
  globe.add(buildOutline(coast, 1.002, { color: '#7fd2f4', width: 0.78, opacity: 0.92 }));
  if (window.__boot) window.__boot('coast loaded');

  // Lakes: largest 20 get the bright shoreline, the rest a softer dim line.
  // if lakes fail, still upload the glow
  const lakes = await lakesP.catch((err) => { tex.needsUpdate = true; throw err; });
  await settleDetailBar(LOAD.coast);
  // area once per lake: a comparator that rescans every ring per comparison
  // made this sort a large part of the lakes build
  const areas = new Map(lakes.features.map((f) => [f, lakeArea(f)]));
  const sortedLakes = [...lakes.features].sort((a, b) => areas.get(b) - areas.get(a));
  const bigLakeLines = cleanCoast(lakeRings({ features: sortedLakes.slice(0, 20) }));
  const smallLakeLines = cleanCoast(lakeRings({ features: sortedLakes.slice(20) }));
  knockOutLakes(tex, lakes);
  tex.needsUpdate = true;
  mapLab.lakeMesh = buildOutline(bigLakeLines, 1.002, { color: '#5f9fd0', width: 0.8, opacity: 0.45 });
  mapLab.lakeMeshDim = buildOutline(smallLakeLines, 1.002, { color: '#5f9fd0', width: 0.8, opacity: 0.28 });
  globe.add(mapLab.lakeMesh);
  globe.add(mapLab.lakeMeshDim);

  // Rivers: 655 Natural Earth features with per-feature scalerank; use <= 7.
  const rivers = await riversP;
  await settleDetailBar(LOAD.lakes);
  const riverCoords = [];
  for (const f of rivers.features)
    if (f.properties.scalerank <= 7) riverCoords.push(...f.geometry.coordinates);
  mapLab.riverMesh = buildOutline(cleanCoast(riverCoords), 1.002, { color: '#4a86b8', width: 0.6, opacity: 0.3 });
  globe.add(mapLab.riverMesh);
  LOAD.rivers.built = true;

  if (window.__boot) window.__boot('map data loaded');
  if (mapLab.on) initMapLab(lakes, rivers);
}

// Satellite skips the detail layers (10m coast + lakes + rivers, ~4 MB): the
// imagery already shows them, and the vector lines on top are just noise. They
// load only when classic shows: ?map=classic, satellite failing to come up, a
// second context loss turning it off, or the ?maplab tool (which edits them).
export let detailStarted = false;
export function startDetail() {
  if (detailStarted) return;
  detailStarted = true;
  const detailP = (entry) => criticalBytesP.then(() => getTopo(entry, { priority: 'low' }));
  const coastP = detailP(LOAD.coast);
  const lakesP = detailP(LOAD.lakes);
  const riversP = detailP(LOAD.rivers);
  const detailBytesP = Promise.allSettled([coastP, lakesP, riversP]);
  // awaited in order in loadDetail; mark handled so an early failure doesn't
  // also raise unhandled-rejection banners for the later stages
  for (const p of [coastP, lakesP, riversP]) p.catch(() => {});
  // started after the boot reveal (satellite fell back): show the pill now
  if (globeRevealed && pillEl && !LOAD_PHASES.detail.finished) pillEl.classList.add('on');
  // a land failure is already reported above; detail just stands down
  landReady
    .then((land) => loadDetail(land, { coastP, lakesP, riversP, detailBytesP }), () => {})
    .catch((err) => {
      console.error('failed to load map detail', err);
      if (window.__showErr) window.__showErr('MAPDETAIL: ' + (err && err.message ? err.message : err));
    })
    .finally(() => loadJobDone('detail', 'detail'));
}

// Rivers/lakes density lab (?maplab). Rebuilds the lake-shore and river
// outline layers on the live globe at the requested density. Only wired up
// when the page is loaded with ?maplab, so normal gameplay is untouched.
export function initMapLab(lakes, rivers) {
  // Lab view: hide all game UI so the bare globe is visible and spinnable.
  const gameMain = document.getElementById('game');
  if (gameMain) gameMain.style.display = 'none';
  const hud = document.getElementById('hud');
  if (hud) hud.style.display = 'none';
  // lakes-10m features sorted largest-first (bbox area); the lab shows the top N.
  const lakeFeats = [...lakes.features].sort((a, b) => lakeArea(b) - lakeArea(a));

  // Swap one outline layer, showing it immediately (the boot reveal fade is
  // long done by the time the lab runs, so new materials must not start at 0).
  function swap(which, lines, opts) {
    const old = which === 'lake' ? mapLab.lakeMesh
      : which === 'lakedim' ? mapLab.lakeMeshDim : mapLab.riverMesh;
    const nu = buildOutline(lines, 1.002, opts);
    nu.material.opacity = nu.material.userData.baseOpacity ?? 1;
    nu.material.userData.reveal = 1;
    globe.remove(old);
    const i = outlineMaterials.indexOf(old.material);
    if (i >= 0) outlineMaterials.splice(i, 1);
    old.geometry.dispose();
    old.material.dispose();
    globe.add(nu);
    if (which === 'lake') mapLab.lakeMesh = nu;
    else if (which === 'lakedim') mapLab.lakeMeshDim = nu;
    else mapLab.riverMesh = nu;
  }

  const api = {
    async setLakes(n) {
      const feats = n > 0 ? lakeFeats.slice(0, n) : [];
      // Same bright/dim split as production: top 20 bright, rest dim.
      swap('lake', cleanCoast(lakeRings({ features: feats.slice(0, 20) })), { color: '#5f9fd0', width: 0.8, opacity: 0.45 });
      swap('lakedim', cleanCoast(lakeRings({ features: feats.slice(20) })), { color: '#5f9fd0', width: 0.8, opacity: 0.28 });
      return feats.length;
    },
    async setRivers(maxSr) {
      // Rivers come pre-loaded via getTopo (no extra fetch); filter by scalerank.
      const coords = [];
      if (maxSr > 0)
        for (const f of rivers.features)
          if (f.properties.scalerank <= maxSr) coords.push(...f.geometry.coordinates);
      swap('river', cleanCoast(coords), { color: '#4a86b8', width: 0.6, opacity: 0.3 });
      return maxSr > 0 ? rivers.features.filter((f) => f.properties.scalerank <= maxSr).length : 0;
    },
  };
  window.__maplab = api;
  const pending = [];
  let ready = true;
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.type !== 'maplab') return;
    pending.push({ d, src: e.source });
    if (ready) drain();
  });
  async function drain() {
    ready = false;
    while (pending.length) {
      const { d, src } = pending.shift();
      let rivers = null, lakes = null;
      try {
        if (d.lakes !== undefined) lakes = await api.setLakes(d.lakes);
        if (d.rivers !== undefined) rivers = await api.setRivers(d.rivers);
      } catch (err) {
        console.error('maplab failed', err);
      }
      try { src.postMessage({ type: 'maplab-done', rivers, lakes }, '*'); } catch (_) {}
    }
    ready = true;
  }
  // Apply any initial density requested via the query string (?maplab&rivers=5&lakes=300).
  const q = new URLSearchParams(location.search);
  const init = {};
  if (q.has('rivers')) init.rivers = parseInt(q.get('rivers'), 10) || 0;
  if (q.has('lakes')) init.lakes = parseInt(q.get('lakes'), 10) || 0;
  if (init.rivers !== undefined || init.lakes !== undefined) {
    pending.push({ d: { type: 'maplab', ...init }, src: window.parent });
    drain();
  }
}

// Satellite imagery: the base load, the inset texture size for this GPU, the
// context-loss fallback and the test hook, in their original order.
export function initImagery() {
  mapStyle = new URLSearchParams(location.search).get('map') === 'classic' ? 'classic' : 'satellite';
  satReady = initSatellite();
  // 1536 square below 4096, else 2048 square, or 2048x4096 on a portrait view.
  // state.viewW/H are still unset here, so read the canvas box as resize() does.
  const box = canvas.getBoundingClientRect();
  const portrait = (box.height || window.innerHeight) > (box.width || window.innerWidth);
  INSET_COLS = renderer.capabilities.maxTextureSize < 4096 ? 6 : 8;
  INSET_ROWS = INSET_COLS === 8 && portrait ? 16 : INSET_COLS;
  // WebGL context loss: three restores the context and re-uploads the classic
  // and base textures on its own; the insets restart empty and refill on the
  // next settle. A second loss in one session turns satellite off for good.
  canvas.addEventListener('webglcontextlost', () => {
    inset.losses++;
    insetsOff();
    for (const { bmp } of inset.uploads) bmp.close();
    inset.uploads = [];
    if (inset.bufs) for (const b of inset.bufs) { b.win = null; b.mix = 0; }
    if (inset.losses >= 2 && !satDisabled) {
      satDisabled = true;
      satTarget = satT = 0; // snap to classic; updateSatellite applies it once
      releaseSatellite();
      startDetail(); // classic is showing now, so it needs its detail layers
    }
  });
  // test hook: inset state for headless checks
  window.__sat = {
    get provider() { return satProvider && satProvider.credit; },
    get mix() { return globeMat.uniforms.uSatMix.value; },
    get inset() {
      const w = inset.win;
      return {
        size: `${INSET_COLS * 256}x${INSET_ROWS * 256}`, gen: w && w.gen,
        z: w && w.z, cols: w && w.cols, rows: w && w.rows,
        tiles: w && w.tiles.length, fallback: w && w.tiles.filter((t) => t.k).length, visLeft: w && w.visLeft, allLeft: w && w.allLeft,
        ready: !!(w && w.ready), mipped: !!(w && w.mipped),
        inflight: inset.inflight.size, queued: inset.queue.length, uploads: inset.uploads.length,
        lru: inset.lru.size, lruKB: Math.round(inset.lruBytes / 1024),
        slow: inset.slow, latency: [...inset.latency].sort((a, b) => a - b).map(Math.round), pausedFor: Math.max(0, Math.round(inset.pausedUntil - performance.now())),
        mixA: globeMat.uniforms.uInsetMixA.value, mixB: globeMat.uniforms.uInsetMixB.value,
      };
    },
  };

}

let landP;
let islandsP;
export let locationsP;
export let criticalBytesP;
export let pinsP;
let landReady;

// The critical and detail fetches start here, where they always started.
export function initAssets() {
  // Map lab: density preview tool for the rivers/lakes lab page. Completely
  // inert unless the page is loaded with ?maplab in the URL; then it listens
  // for postMessage({type:'maplab', rivers, lakes}) from the embedding page and
  // rebuilds the river/lake outline layers at the requested density.
  mapLab = {
    on: new URLSearchParams(location.search).has('maplab'),
    lakeMesh: null,
    lakeMeshDim: null,
    riverMesh: null,
  };
  // Critical fetches start now at high priority; locations.json is consumed at
  // the bottom of the file, where it gates the play buttons.
  landP = getTopo(LOAD.land, { priority: 'high' });
  // optional: the globe still works (minus small islands) if this one fails
  islandsP = getTopo(LOAD.islands, { priority: 'high' }).catch(() => ({ features: [] }));
  locationsP = loadJSON(LOAD.locations, { priority: 'high', ...(RESET_DAILY ? { cache: 'reload' } : {}) });
  // Detail waits for every critical byte, then all three stream together.
  // Each phase's layer builds also wait for that phase's last byte: a build
  // blocks the main thread, and doing one while other files still stream froze
  // the bar and then jumped it (the "two big chunks").
  criticalBytesP = Promise.allSettled([landP, islandsP, locationsP]);
  // consumed at the bottom of the file; mark handled so a failure there doesn't
  // also raise an unhandled-rejection banner
  locationsP.catch(() => {});
  // Pinned daily games (deploy.sh records every in-play date before shipping).
  // Required like locations.json: computing a pinned date instead could change
  // a game players have already seen.
  pinsP = loadJSON(LOAD.pins, RESET_DAILY ? { cache: 'reload' } : undefined);
  pinsP.catch(() => {});
  landReady = loadLand();
  landReady
    .catch((err) => {
      console.error('failed to load land data', err);
      if (window.__showErr) window.__showErr('MAPDATA: ' + (err && err.message ? err.message : err));
    })
    .finally(() => loadJobDone('critical', 'map'));
  satReady.then((satOn) => { if (!satOn || mapLab.on) startDetail(); });
}

// Per frame: fade the land fill in once it is built.
export function updateLandReveal(dt) {
  if (landLoaded && landReveal < 1) {
    landReveal = Math.min(1, landReveal + dt / 1.1);
    globeMat.uniforms.uLand.value = 1 - Math.pow(1 - landReveal, 3);
  }
}
