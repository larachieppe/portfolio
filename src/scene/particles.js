import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { generators } from "./shapes.js";

const VERT = /* glsl */ `
  attribute vec3 aShapeA;
  attribute vec3 aShapeB;
  attribute vec3 aShapeC;
  attribute vec3 aBurst;
  attribute float aSeed;
  attribute float aScale;

  uniform float uTime;
  uniform float uProgress;   // 0 = attention, 1 = transformer, 2 = globe
  uniform float uReveal;     // 0 = scattered burst, 1 = settled
  uniform float uSize;
  uniform float uPixelRatio;
  uniform vec3  uMouse;
  uniform float uMouseRadius;
  uniform float uMouseForce;
  // Screen-space guard: particles fade out across this NDC-x band so the
  // field can never wash out the text column, whatever shape it is in.
  uniform float uFadeStart;
  uniform float uFadeEnd;

  varying float vFade;
  varying float vHeat;
  varying float vSeed;
  varying float vMix;

  // Cheap gradient noise — enough character for drift and turbulence.
  vec3 hash3(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
             dot(p, vec3(269.5, 183.3, 246.1)),
             dot(p, vec3(113.5, 271.9, 124.6)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float gnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(dot(hash3(i + vec3(0,0,0)), f - vec3(0,0,0)),
              dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
          mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)),
              dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
      mix(mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)),
              dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
          mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)),
              dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
  }

  vec3 curl(vec3 p) {
    float e = 0.35;
    float n1 = gnoise(p + vec3(0.0, e, 0.0));
    float n2 = gnoise(p - vec3(0.0, e, 0.0));
    float n3 = gnoise(p + vec3(0.0, 0.0, e));
    float n4 = gnoise(p - vec3(0.0, 0.0, e));
    float n5 = gnoise(p + vec3(e, 0.0, 0.0));
    float n6 = gnoise(p - vec3(e, 0.0, 0.0));
    return normalize(vec3(n3 - n4 - (n1 - n2), n5 - n6 - (n3 - n4), n1 - n2 - (n5 - n6)) + 1e-5);
  }

  // Per-particle staggered easing, so the field morphs as a wave rather
  // than every point arriving on the same frame.
  float stagger(float t, float seed) {
    float delay = seed * 0.42;
    float local = clamp((t - delay) / (1.0 - 0.42), 0.0, 1.0);
    return local * local * (3.0 - 2.0 * local);
  }

  void main() {
    vSeed = aSeed;

    // --- shape blend -------------------------------------------------
    float p = clamp(uProgress, 0.0, 2.0);
    float legT = fract(min(p, 1.999999));
    float leg = floor(min(p, 1.999999));
    float eased = stagger(legT, aSeed);

    vec3 from = leg < 0.5 ? aShapeA : aShapeB;
    vec3 to   = leg < 0.5 ? aShapeB : aShapeC;
    vec3 pos  = mix(from, to, eased);

    // Turbulence peaks mid-transition, so shapes scatter and re-form.
    float heat = sin(eased * 3.14159265);
    pos += curl(pos * 0.16 + uTime * 0.05 + aSeed * 4.0) * heat * 2.6;

    // --- intro reveal ------------------------------------------------
    float rev = stagger(clamp(uReveal, 0.0, 1.0), aSeed * 0.8);
    pos = mix(aBurst, pos, rev);

    // --- ambient life ------------------------------------------------
    float drift = gnoise(pos * 0.22 + uTime * 0.11);
    pos += curl(pos * 0.1 - uTime * 0.03) * (0.11 + drift * 0.09);

    // --- pointer repulsion -------------------------------------------
    vec3 toMouse = pos - uMouse;
    float d = length(toMouse);
    float push = 1.0 - smoothstep(0.0, uMouseRadius, d);
    pos += normalize(toMouse + 1e-5) * push * uMouseForce;

    vHeat = heat + push * 0.85;
    vMix = clamp(p * 0.5, 0.0, 1.0);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vec4 clip = projectionMatrix * mv;
    gl_Position = clip;

    float size = uSize * aScale * (1.0 + heat * 0.55 + push * 1.4);
    gl_PointSize = size * uPixelRatio * (14.0 / max(-mv.z, 0.1));

    // Fade the far side of the cloud so it reads as depth, not soup.
    float depthFade = smoothstep(46.0, 8.0, -mv.z);

    // Fade anything that strays into the text column. uFadeEnd <= uFadeStart
    // disables the guard (phones, where the field is centred).
    float ndcX = clip.x / max(abs(clip.w), 0.0001);
    float sideFade = uFadeEnd > uFadeStart
      ? smoothstep(uFadeStart, uFadeEnd, ndcX)
      : 1.0;

    vFade = depthFade * rev * sideFade;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform vec3 uColorA;   // attention
  uniform vec3 uColorB;   // transformer
  uniform vec3 uColorC;   // globe
  uniform vec3 uColorHot;
  uniform float uOpacity;

  varying float vFade;
  varying float vHeat;
  varying float vSeed;
  varying float vMix;

  void main() {
    // Soft round sprite, no texture needed.
    vec2 uv = gl_PointCoord - 0.5;
    float r = length(uv);
    if (r > 0.5) discard;
    float alpha = pow(1.0 - r * 2.0, 2.4);

    vec3 base = vMix < 0.5
      ? mix(uColorA, uColorB, smoothstep(0.0, 0.5, vMix))
      : mix(uColorB, uColorC, smoothstep(0.5, 1.0, vMix));

    // Per-particle variation keeps the field from looking flat-tinted.
    base = mix(base, uColorHot, clamp(vSeed * 0.55 + vHeat * 0.7, 0.0, 1.0));

    gl_FragColor = vec4(base, alpha * vFade * uOpacity);
  }
`;

export function createField(canvas, opts = {}) {
  const reduced = opts.reducedMotion ?? false;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const isSmall = window.innerWidth < 760;

  // Particle budget scales with the device so phones stay smooth.
  const COUNT = opts.count ?? (isSmall ? 14000 : reduced ? 12000 : 34000);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 0, 26);

  const group = new THREE.Group();
  scene.add(group);

  // --- attributes ----------------------------------------------------
  const geometry = new THREE.BufferGeometry();
  const shapeA = generators.attention(COUNT); // hero / about
  const shapeB = generators.transformer(COUNT); // work / experience
  const shapeC = generators.globe(COUNT); // skills / contact

  const burst = new Float32Array(COUNT * 3);
  const seeds = new Float32Array(COUNT);
  const scales = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    // Start scattered on a wide shell, then implode into the first shape.
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(Math.random() * 2 - 1);
    const r = 26 + Math.random() * 26;
    burst[i * 3] = Math.sin(ph) * Math.cos(th) * r;
    burst[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * r * 0.6;
    burst[i * 3 + 2] = Math.cos(ph) * r;
    seeds[i] = Math.random();
    scales[i] = 0.45 + Math.pow(Math.random(), 2.2) * 1.5;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(shapeA.slice(), 3));
  geometry.setAttribute("aShapeA", new THREE.BufferAttribute(shapeA, 3));
  geometry.setAttribute("aShapeB", new THREE.BufferAttribute(shapeB, 3));
  geometry.setAttribute("aShapeC", new THREE.BufferAttribute(shapeC, 3));
  geometry.setAttribute("aBurst", new THREE.BufferAttribute(burst, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);

  const uniforms = {
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uReveal: { value: 0 },
    uSize: { value: isSmall ? 2.0 : 2.4 },
    uPixelRatio: { value: dpr },
    uMouse: { value: new THREE.Vector3(999, 999, 999) },
    uMouseRadius: { value: 4.2 },
    uMouseForce: { value: reduced ? 0 : 1.9 },
    uFadeStart: { value: opts.fadeZone?.[0] ?? 0 },
    uFadeEnd: { value: opts.fadeZone?.[1] ?? 0 },

    uOpacity: { value: 1 },
    uColorA: { value: new THREE.Color("#4bf0c0") },
    uColorB: { value: new THREE.Color("#7aa2ff") },
    uColorC: { value: new THREE.Color("#c58bff") },
    uColorHot: { value: new THREE.Color("#fff3d6") },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  group.add(points);

  // --- postprocessing (bloom) ----------------------------------------
  let composer = null;
  if (!reduced && !isSmall) {
    try {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.62, // strength
        0.75, // radius
        0.12  // threshold
      );
      composer.addPass(bloom);
      composer.setPixelRatio(dpr);
      composer.setSize(window.innerWidth, window.innerHeight);
    } catch {
      composer = null; // plain render is a perfectly good fallback
    }
  }

  // --- interaction state ---------------------------------------------
  const pointer = new THREE.Vector2(0, 0);      // normalised device coords
  const pointerTarget = new THREE.Vector2(0, 0);
  const mouseWorld = new THREE.Vector3(999, 999, 999);
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const raycaster = new THREE.Raycaster();
  let pointerActive = false;

  // Start already in position and on the right shape — sliding in from the
  // centre on every load would read as a glitch, not an intro.
  let targetProgress = opts.initialProgress ?? 0;
  let currentProgress = targetProgress;
  let targetSpin = 0;
  let scrollVelocity = 0;
  let targetOffsetX = opts.offsetX ?? 0;
  group.position.x = targetOffsetX;

  function onPointerMove(e) {
    const t = e.touches ? e.touches[0] : e;
    pointerTarget.x = (t.clientX / window.innerWidth) * 2 - 1;
    pointerTarget.y = -(t.clientY / window.innerHeight) * 2 + 1;
    pointerActive = true;
  }
  function onPointerLeave() {
    pointerActive = false;
  }

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerleave", onPointerLeave, { passive: true });
  window.addEventListener("touchmove", onPointerMove, { passive: true });
  window.addEventListener("touchend", onPointerLeave, { passive: true });

  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    uniforms.uSize.value = w < 760 ? 2.0 : 2.4;
  }
  window.addEventListener("resize", onResize);

  // --- loop ------------------------------------------------------------
  const clock = new THREE.Clock();
  let running = true;
  let revealStart = null;
  let prevT = 0;

  // Frame-rate-independent exponential smoothing. Without this, everything
  // eases twice as fast on a 120Hz display as on a 60Hz one.
  const approach = (rate, dt) => 1 - Math.exp(-rate * dt);

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);

    const t = clock.getElapsedTime();
    // Clamp so returning to a backgrounded tab doesn't jump everything.
    const dt = Math.min(t - prevT, 0.1);
    prevT = t;
    uniforms.uTime.value = t;

    if (revealStart === null) revealStart = t;
    uniforms.uReveal.value = Math.min((t - revealStart) / 2.6, 1);

    // Ease the morph so fast scrolling never snaps between shapes.
    currentProgress += (targetProgress - currentProgress) * approach(2.8, dt);
    uniforms.uProgress.value = currentProgress;

    // Pointer → a point on the z=0 plane, for repulsion.
    const pk = approach(7.7, dt);
    pointer.x += (pointerTarget.x - pointer.x) * pk;
    pointer.y += (pointerTarget.y - pointer.y) * pk;
    if (pointerActive && !reduced) {
      raycaster.setFromCamera(pointer, camera);
      raycaster.ray.intersectPlane(plane, mouseWorld);
      uniforms.uMouse.value.copy(mouseWorld);
    } else {
      uniforms.uMouse.value.set(999, 999, 999);
    }

    // Idle rotation + a nudge from scroll momentum + mouse parallax.
    const spinSpeed = reduced ? 0.02 : 0.075;
    targetSpin += spinSpeed * dt + scrollVelocity * 0.0009;
    scrollVelocity *= Math.exp(-5 * dt);
    group.rotation.y = targetSpin + pointer.x * 0.28;
    group.rotation.x = Math.sin(t * 0.16) * 0.06 - pointer.y * 0.16;

    // Keep the field out of the text column on wide screens.
    group.position.x += (targetOffsetX - group.position.x) * approach(3.1, dt);

    const ck = approach(2.5, dt);
    camera.position.x += (pointer.x * 1.7 - camera.position.x) * ck;
    camera.position.y += (pointer.y * 1.1 - camera.position.y) * ck;
    camera.lookAt(0, 0, 0);

    if (composer) composer.render();
    else renderer.render(scene, camera);
  }
  frame();

  return {
    /** progress: 0 attention → 1 transformer → 2 globe */
    setProgress(p) {
      targetProgress = Math.max(0, Math.min(2, p));
    },
    setZoom(z) {
      camera.position.z = z;
    },
    /** Slide the whole field sideways, in world units. */
    setOffsetX(x) {
      targetOffsetX = x;
    },
    /**
     * Screen-space band (NDC x, -1 left → 1 right) across which particles
     * fade in. Pass end <= start to disable the guard entirely.
     */
    setFadeZone(start, end) {
      uniforms.uFadeStart.value = start;
      uniforms.uFadeEnd.value = end;
    },
    addScrollImpulse(delta) {
      scrollVelocity += delta;
    },
    setOpacity(o) {
      uniforms.uOpacity.value = o;
    },
    get particleCount() {
      return COUNT;
    },
    /** Read-only snapshot of the animated state, for debugging. */
    get state() {
      return {
        offsetX: group.position.x,
        targetOffsetX,
        progress: currentProgress,
        fade: [uniforms.uFadeStart.value, uniforms.uFadeEnd.value],
        cameraZ: camera.position.z,
        rotationY: group.rotation.y,
      };
    },
    destroy() {
      running = false;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
