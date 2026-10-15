// ---------------------------------------------------------------------------
// The globe's renderer and scene (refactor Phase 5): the WebGL renderer,
// camera and globe group, the deep-space backdrop, the starfield and the
// atmosphere shell, plus the lat/lng <-> vector helpers every globe module
// shares. main.js calls initScene() and initAtmosphere() at the spots these
// sections used to run, so objects are built in the same order as before.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { DEG, FOV, ATMO_RADIUS } from '../core/config.js';

export const PIN_COLOR = new THREE.Color('#ffb54a');
export const ANSWER_COLOR = new THREE.Color('#67e8ff');

// lat/lng <-> unit vector, matching THREE.SphereGeometry's UV layout
// (u = 0 at lng -180, v = 1 at the north pole).
export function latLngToVec3(lat, lng, r = 1, out = new THREE.Vector3()) {
  const phi = (lng + 180) * DEG;
  const la = lat * DEG;
  return out.set(-Math.cos(phi) * Math.cos(la) * r, Math.sin(la) * r, Math.sin(phi) * Math.cos(la) * r);
}

export function vec3ToLatLng(v) {
  const n = v.clone().normalize();
  let lng = Math.atan2(n.z, -n.x) / DEG - 180;
  if (lng < -180) lng += 360;
  return { lat: Math.asin(n.y) / DEG, lng };
}

export const _UP = new THREE.Vector3(0, 1, 0);
export const _RIGHT = new THREE.Vector3(1, 0, 0);
const _qy = new THREE.Quaternion();
const _qx = new THREE.Quaternion();

export function setGlobeQuaternion(target, y, p) {
  _qy.setFromAxisAngle(_UP, y);
  _qx.setFromAxisAngle(_RIGHT, p);
  return target.quaternion.multiplyQuaternions(_qx, _qy);
}

export let canvas;
export let hud;
export let renderer;
export let pixelRatio;
export let scene;
export let camera;
export let globe;
export let stars;
export let atmosphere;

// ---------------------------------------------------------------------------
// Starfield
// ---------------------------------------------------------------------------
function makeStars(count) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const v = new THREE.Vector3();
  const cool = new THREE.Color('#bcd4ff');
  const warm = new THREE.Color('#ffe2c4');
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    v.randomDirection().multiplyScalar(60);
    pos.set([v.x, v.y, v.z], i * 3);
    c.copy(cool).lerp(warm, Math.random() ** 2);
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = 0.6 + Math.random() ** 7 * 3.2;
    phase[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: pixelRatio } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aPhase;
      attribute vec3 color;
      uniform float uTime;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.72 + 0.28 * sin(uTime * (0.6 + fract(aPhase * 7.13) * 1.6) + aPhase);
        vAlpha = tw * clamp(aSize / 2.2, 0.35, 1.0);
        vColor = color;
        gl_PointSize = aSize * uPixelRatio * (0.85 + 0.15 * tw) * 1.6;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        a = a * a * vAlpha;
        gl_FragColor = vec4(vColor * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = -10;
  return pts;
}

// ---------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------
export function initScene() {
  canvas = document.getElementById('globe');
  hud = document.getElementById('hud');

  // stencil: the reveal's country outline blends each pixel once (see buildCountryOutline)
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x020409, 1);
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 200);

  globe = new THREE.Group();
  scene.add(globe);

  // ---------------------------------------------------------------------------
  // Deep-space backdrop (matches the CSS fallback gradient), drawn behind everything
  // ---------------------------------------------------------------------------
  const backdropMat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.9999, 1.0);
    }`,
    fragmentShader: /* glsl */ `
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float blob(vec2 c, vec2 r) { return 1.0 - smoothstep(0.0, 1.0, length((vUv - c) / r)); }
    void main() {
      float d = length((vUv - vec2(0.5, 0.55)) / vec2(1.2, 0.8));
      vec3 col = mix(vec3(0.039, 0.082, 0.192), vec3(0.020, 0.039, 0.098), smoothstep(0.0, 0.48, d));
      col = mix(col, vec3(0.008, 0.016, 0.035), smoothstep(0.48, 1.0, d));
      col += vec3(0.282, 0.204, 0.549) * 0.16 * blob(vec2(0.82, 0.88), vec2(0.6, 0.4));
      col += vec3(0.071, 0.337, 0.502) * 0.14 * blob(vec2(0.12, 0.12), vec2(0.55, 0.35));
      col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
      gl_FragColor = vec4(col, 1.0);
    }`,
    depthTest: false,
    depthWrite: false,
  });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backdropMat);
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -20;
  scene.add(backdrop);
  stars = makeStars(2400);
  scene.add(stars);
}

// ---------------------------------------------------------------------------
// Atmosphere: back-face shell, intensity from the ray's closest approach to the core
// ---------------------------------------------------------------------------
export function initAtmosphere() {
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { uRadius: { value: ATMO_RADIUS } },
    vertexShader: /* glsl */ `
    varying vec3 vPosW;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vPosW = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
    fragmentShader: /* glsl */ `
    uniform float uRadius;
    varying vec3 vPosW;
    void main() {
      vec3 dir = normalize(vPosW - cameraPosition);
      float b = length(cross(cameraPosition, dir));       // ray distance from globe center
      float t = clamp((b - 1.0) / (uRadius - 1.0), 0.0, 1.0);
      float i = exp(-t * 4.2) * (1.0 - t) * (1.0 - t);
      vec3 col = mix(vec3(0.42, 0.78, 1.00), vec3(0.16, 0.34, 1.00), smoothstep(0.0, 0.6, t));
      gl_FragColor = vec4(col * i * 0.95, 1.0);
    }`,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  atmosphere = new THREE.Mesh(new THREE.SphereGeometry(ATMO_RADIUS, 96, 64), atmoMat);
  scene.add(atmosphere);
}
