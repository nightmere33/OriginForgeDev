"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { GalaxyItem } from "@/lib/types";
import { BEATS, introClock } from "@/motion/intro";
import { frameScroll } from "@/motion/smooth";
import { prefersAv1 } from "@/lib/video";
import { themeStore } from "@/lib/theme";

/*
 * The Forge Galaxy (DESIGN.md §6). Project clips ride a slowly turning
 * spiral out of the OF mark: born small, blurred and ember-hot at the core,
 * squares that open into their own shape, sharp within a few seconds, until
 * they leave past the edge of the screen while new ones surface. There are
 * a few more cards than clips: a card reborn at the core takes the clip shown
 * longest ago, and two copies never sit close together.
 *
 * The motion follows a study of getartcraft.com's hero (its tunings and
 * mechanisms, re-implemented here; none of its code is used):
 *  - cards travel Archimedean arms and stay upright while the system spins;
 *    the arms are drawn as hairline ribbons with comets running outward,
 *    ticks on their outer half and a dashed construction circle;
 *  - the cursor field: cards near the pointer drift a little toward it and
 *    their surface bulges toward the camera where it is nearest the hand,
 *    leaving a dispersion flare that fades behind a sweep;
 *  - a hold: the card under the cursor brakes almost at once and the rest of
 *    the spiral follows more slowly, so the stop spreads out from the hand;
 *    the held card clears (no blur, warp or fringe) while the comets keep
 *    running. Releasing resumes from where everything stands.
 *
 * One canvas where 1 world unit == 1 CSS px on the z=0 plane. Colours stay
 * raw sRGB end to end (no colour management, NoColorSpace textures) so the
 * ember and steel match the CSS tokens.
 */
THREE.ColorManagement.enabled = false;

const FOV = 30;

// count: cards at TUNED_MPX of viewport (fewer on smaller screens); capH: the
// tallest a card may be, as a share of the viewport height; density: the
// share of the gap to its nearest neighbour a card may fill.
type Profile = { arms: number; turns: number; outer: number; birth: number; count: number; capH: number; density: number };
// Small screens get their own composition: fewer, straighter arms, wider reach.
const DESKTOP: Profile = { arms: 6, turns: 1.05, outer: 0.7, birth: 0.08, count: 64, capH: 0.25, density: 0.82 };
const MOBILE: Profile = { arms: 3, turns: 0.7, outer: 0.8, birth: 0.08, count: 14, capH: 0.3, density: 0.94 };
const TUNED_MPX = 1.65; // viewport area the desktop count is set for
const MOBILE_MPX = 0.6; // viewports under this many CSS megapixels use MOBILE
const EXIT = 1.2; // cards travel to this share of the half-diagonal: fully off screen, so no exit fade
const ARM_STAGGER = 0.382; // per-arm offset in slot gaps (golden): arms never line up in rings

// Motion
const JOURNEYS_PER_MIN = 0.57; // birth-to-edge trips per minute, unattended
const SCRUB_PER_PX = 0.2 / 1000; // trips per scrolled px
const SPIN = THREE.MathUtils.degToRad(-50) / 60; // rad/s, the whole system
const WOBBLE_PX = 6;
const WOBBLE_HZ = 0.25;
const BURST_X = 3; // the field arrives moving this much faster...
const BURST_S = 2.5; // ...and eases to its drift over this long
const REVEAL_S = 2.4; // the reveal front sweeps out from the mark
const REVEAL_BAND = 220; // px over which a card fades in behind the front

// Pointer
const FIELD_PX = 320; // reach of the cursor's influence
const TUG_PX = 8; // how far cards in the field drift toward it
const BULGE_PX = 200; // how far a surface rises toward the camera under the hand
const FLARE_ADD = 0.032; // dispersion picked up near the cursor
const FLARE_DECAY = 3; // per second: the lens trail behind a sweep
const HOLD_TAU = 0.15; // the held card brakes...
const REST_TAU = 1; // ...the rest of the spiral follows more slowly
const FIELD_TAU = 0.12; // the field eases off while a card is held
const CLEAR_TAU = 0.12; // the held card clears this fast
const TARGET_TAU = 0.25; // and settles (paint order, wobble, decode priority)
const HOLD_WOBBLE = 1.2; // the rest strains a little against the brake

// Look
const CURVE_PX = 32; // every card bows toward the camera
const BLUR_BIRTH = 0.12; // blur radius at birth, in card heights
const BLUR_END = 0.18; // journey share where cards are sharp
const FADE_IN = 0.15;
const SQUARE_UNTIL = 0.3; // newborn cards open from a rounded square into their shape
const INNER_CAP = 0.45; // newborns are at most this share of full size
const ABERRATION = 0.019;
const PLAY_FROM = 0.14; // journey share past which a clip earns a live decoder
const CORNER_PX = 10;
const MAX_PLAYING = 8;
// Performance (as on getartcraft.com): textures decode off the main thread a
// couple at a time and reach the GPU one per frame; below FPS_FLOOR (after a
// grace period, since load always stutters) the galaxy sheds cards and their
// decoders, then regrows slowly so it never oscillates.
const POSTERS_IN_FLIGHT = 2;
const FPS_FLOOR = 30;
const PERF_GRACE_S = 4;
const PARK_DELAY_MS = 2500; // scrolled away this long before decoders are parked
const DEDUP_PX = 300; // two visible cards with the same clip closer than this: the younger one swaps

// Lines
const LINE_PX = 2;
const LINE_ALPHA = 0.15;
const TICK_ALPHA = 0.3;
const TICKS_PER_ARM = 16;
const TICK_LEN = 12;
const CIRCLE = 0.56; // dashed construction circle, share of the drawn edge
const PULSES = 3; // comets per arm
const PULSE_SPEED = 0.19; // comet spacings travelled per second
const PULSE_LEN = 0.05; // comet length, share of the spacing
const PULSE_PX = 3.5; // extra thickness at a comet's peak
const PULSE_ALPHA = 0.72;

const srgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const EMBER = srgb("#ff6a1a");
const STEEL_RIM = srgb("#c9cbd0");
const THEME = {
  dark: { line: "#a9acb3", pulseA: "#ff6a1a", pulseB: "#e6e7ea" },
  light: { line: "#3a3c41", pulseA: "#c2410c", pulseB: "#5d6066" },
} as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeOutCubic = (v: number) => 1 - (1 - v) ** 3;
const fract = (x: number) => x - Math.floor(x);
const ease = (dt: number, tau: number) => 1 - Math.exp(-dt / tau);

/** Same-origin path, so WebGL can read the pixels (no CORS needed). */
const local = (url: string) => {
  try {
    return new URL(url, location.href).pathname;
  } catch {
    return url;
  }
};

const CARD_VERT = /* glsl */ `
  uniform float uCurve;
  uniform float uBulge;
  uniform vec2 uMouse;
  uniform vec2 uSize;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    // The plane bows toward the camera: most at the centre, nothing at the corners.
    float r2 = dot(position.xy, position.xy) * 2.0;
    world.z += uCurve * (1.0 - r2);
    // The hand's weight: the surface rises toward the camera where it is
    // nearest the cursor (uMouse in card units, often outside the card).
    vec2 toMouse = (position.xy - uMouse) * uSize;
    float reach = 0.6 * max(uSize.x, uSize.y);
    world.z += uBulge * exp(-dot(toMouse, toMouse) / (reach * reach));
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const CARD_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uCover;
  uniform vec2 uCoverOffset;
  uniform vec2 uSize;
  uniform float uBlur;
  uniform float uAlpha;
  uniform float uHeat;
  uniform float uAber;
  uniform float uFocus;
  uniform float uRadius;
  uniform vec3 uEmber;
  uniform vec3 uRim;
  varying vec2 vUv;

  vec3 tap(vec2 uv) { return texture2D(uMap, uv * uCover + uCoverOffset).rgb; }

  void main() {
    vec2 uv = vUv;
    vec2 k = vec2(uBlur * uSize.y / uSize.x, uBlur);
    // 12-tap poisson disc: the blur that also reads as "still forming".
    vec3 c = tap(uv) * 0.16;
    c += tap(uv + k * vec2(-0.326, -0.406)) * 0.07;
    c += tap(uv + k * vec2(-0.840, -0.074)) * 0.07;
    c += tap(uv + k * vec2(-0.696,  0.457)) * 0.07;
    c += tap(uv + k * vec2(-0.203,  0.621)) * 0.07;
    c += tap(uv + k * vec2( 0.962, -0.195)) * 0.07;
    c += tap(uv + k * vec2( 0.473, -0.480)) * 0.07;
    c += tap(uv + k * vec2( 0.519,  0.767)) * 0.07;
    c += tap(uv + k * vec2( 0.185, -0.893)) * 0.07;
    c += tap(uv + k * vec2( 0.507,  0.064)) * 0.07;
    c += tap(uv + k * vec2( 0.896,  0.412)) * 0.07;
    c += tap(uv + k * vec2(-0.322, -0.933)) * 0.07;
    c += tap(uv + k * vec2(-0.792, -0.598)) * 0.07;

    // Chromatic dispersion toward the edges.
    vec2 fromC = uv - 0.5;
    float edge = smoothstep(0.18, 0.5, max(abs(fromC.x), abs(fromC.y)));
    vec2 shift = fromC * uAber * 2.0 * edge;
    c.r = mix(c.r, tap(uv + shift).r, edge);
    c.b = mix(c.b, tap(uv - shift).b, edge);

    // Young cards glow with forge heat.
    float luma = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, uEmber * (0.25 + 0.95 * luma), uHeat * 0.6);

    // Inner vignette so cards sit in the dark instead of on it.
    c *= mix(0.78, 1.0, smoothstep(0.82, 0.28, length(fromC)));

    // Rounded corners (signed distance to a rounded rect, in card px) with a
    // hairline along the edge, brighter on the held card.
    float radius = min(uRadius, min(uSize.x, uSize.y) * 0.2);
    vec2 q = abs(fromC * uSize) - (uSize * 0.5 - radius);
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    float shape = clamp(0.5 - sd, 0.0, 1.0);
    float frame = 1.0 - smoothstep(0.0, 1.25, -sd);
    c = mix(c, uRim, frame * (0.22 + 0.4 * uFocus));

    // The canvas is premultiplied: straight alpha would lighten faded cards.
    float a = uAlpha * shape;
    gl_FragColor = vec4(c * a, a);
  }
`;

// Comets on the arm ribbons: each arm carries PULSES of them, spaced evenly,
// travelling outward; sharp head, longer tail behind.
const RIBBON_VERT = /* glsl */ `
  attribute vec2 aNormal;
  attribute float aSide;
  attribute float aT;
  attribute float aArm;
  uniform float uTime;
  uniform float uReveal;
  varying float vPulse;
  varying float vSide;
  varying float vArm;

  float comet(float t, float head) {
    float s = t - head;
    s -= floor(s + 0.5); // nearest copy around the loop
    float sigma = (s < 0.0 ? 1.7 : 0.55) * ${(PULSE_LEN / PULSES).toFixed(5)};
    return exp(-0.5 * (s / sigma) * (s / sigma));
  }

  void main() {
    float g = 0.0;
    for (int k = 0; k < ${PULSES}; k++) {
      float head = fract(uTime * ${(PULSE_SPEED / PULSES).toFixed(5)} + float(k) / ${PULSES.toFixed(1)} + aArm * ${ARM_STAGGER.toFixed(3)});
      g = max(g, comet(aT, head));
    }
    g *= smoothstep(0.04, 0.14, aT); // no comets in the blurred birth zone
    g *= clamp((uReveal - length(position.xy)) / ${REVEAL_BAND.toFixed(1)}, 0.0, 1.0);
    vPulse = g;
    vSide = aSide;
    vArm = aArm;
    float w = ${LINE_PX.toFixed(1)} + ${PULSE_PX.toFixed(1)} * g;
    vec3 p = position;
    p.xy += aNormal * aSide * w * 0.5;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const RIBBON_FRAG = /* glsl */ `
  uniform vec3 uLine;
  uniform vec3 uPulseA;
  uniform vec3 uPulseB;
  uniform float uAlpha;
  varying float vPulse;
  varying float vSide;
  varying float vArm;
  void main() {
    // Soft ribbon edges double as antialiasing.
    float edge = 1.0 - smoothstep(0.5, 1.0, abs(vSide));
    vec3 pulse = mod(vArm, 2.0) < 0.5 ? uPulseA : uPulseB;
    vec3 col = mix(uLine, pulse, clamp(vPulse, 0.0, 1.0));
    float a = (${LINE_ALPHA.toFixed(2)} + ${PULSE_ALPHA.toFixed(2)} * vPulse) * edge * uAlpha;
    gl_FragColor = vec4(col * a, a);
  }
`;

type Clip = {
  item: GalaxyItem;
  poster: THREE.Texture | null; // null until decoded
  posterState: 0 | 1 | 2; // none, loading, ready
  shown: number; // eased 0..1 once it has something to show
  video: HTMLVideoElement | null;
  videoTex: THREE.VideoTexture | null;
  lastWanted: number;
};

type Card = {
  clip: number;
  arm: number;
  base: number; // starting journey position
  offset: number; // accumulated brake, so releasing resumes in place
  flare: number;
  target: number; // eased 0..1: held (paint order, wobble, decode priority)
  clear: number; // eased 0..1: optically clean (no blur, warp or fringe)
  c: number; // journey 0..1
  prevC: number; // last frame's journey, to spot a rebirth
  x: number; // world position and size, px
  y: number;
  w: number;
  h: number;
  pickable: boolean;
  live: boolean; // inside the governor's live set
  mesh: THREE.Mesh | null;
  material: THREE.ShaderMaterial;
};

type Layout = {
  profile: Profile;
  w: number;
  h: number;
  halfDiag: number;
  b: number; // r = b·θ
  thetaBirth: number;
  thetaOuter: number; // where the drawn arms end
  thetaExit: number; // where cards leave the screen
};

type FrameContext = {
  width: number;
  height: number;
  scroll: number; // px
  canvasTop: number; // the canvas's page offset, px
  tip: HTMLDivElement | null;
};

function layoutFor(w: number, h: number): Layout {
  const profile = (w * h) / 1e6 < MOBILE_MPX ? MOBILE : DESKTOP;
  const halfDiag = Math.hypot(w, h) / 2;
  const rOuter = profile.outer * halfDiag;
  // Archimedean arms: θ runs `turns` windings from birth to the drawn edge,
  // and the birth radius is a share of the edge radius.
  const thetaOuter = (Math.PI * 2 * profile.turns) / (1 - profile.birth);
  const b = rOuter / thetaOuter;
  return { profile, w, h, halfDiag, b, thetaBirth: profile.birth * thetaOuter, thetaOuter, thetaExit: (EXIT * halfDiag) / b };
}

/**
 * The galaxy's mutable world, kept out of React: textures, video decoders,
 * per-card journey state and the arm guides. The component creates it once
 * per item set and drives it through methods from the frame loop.
 */
class GalaxyWorld {
  readonly clips: Clip[];
  readonly cards: Card[];
  readonly geometry = new THREE.PlaneGeometry(1, 1, 16, 16);
  /** Arms, ticks and the construction circle; spins with the system. */
  readonly rig = new THREE.Group();
  private ribbons: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private ticks: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private circle: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
  private layout: Layout | null = null;
  private time = 0;
  private introT = 0;
  private idle = 0;
  private lastP: number | null = null;
  private spin = 0;
  private holdTarget = 0;
  private holdRest = 0;
  private field = 1;
  private cullTimer = 0;
  private readonly ptr = { x: 0, y: 0, clientX: 0, clientY: 0, active: false };
  /** The card under the cursor, or -1. */
  target = -1;
  private tipFor = -1;
  /** Autoplay refused (iOS Low Power Mode, some in-app browsers): retry on the next tap. */
  private blocked = false;
  /** AV1 or H.264 for this device, decided once before any clip loads (lib/video). */
  private av1: boolean | null = null;
  private readonly maxPlaying: number;
  private readonly placeholder = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  private readonly posterQueue: Clip[] = [];
  private readonly decoded: Clip[] = [];
  private postersLoading = 0;
  private frameEma = 1 / 60;
  private perfScale = 1;
  /** Cards in the order the governor sheds and regrows them (golden scatter, never in rings). */
  private readonly liveOrder: number[];
  /** Per clip, when it was last handed to a card (higher = more recent). */
  private readonly clipUsed: number[];
  private useCounter = 0;

  constructor(items: GalaxyItem[], mobile: boolean) {
    this.maxPlaying = mobile ? 3 : MAX_PLAYING;
    prefersAv1(360, 640).then((ok) => (this.av1 = ok));
    // Deal projects in turn (one clip from each, then the next round), so a
    // project's clips never sit side by side on neighbouring arms.
    const byProject = new Map<string, GalaxyItem[]>();
    for (const item of items) byProject.set(item.slug, [...(byProject.get(item.slug) ?? []), item]);
    const queues = [...byProject.values()];
    const dealt: GalaxyItem[] = [];
    while (dealt.length < items.length) for (const q of queues) if (q.length) dealt.push(q.shift()!);
    // Stills load on demand (requestPoster), so a galaxy of hundreds of items
    // costs only what its cards show.
    this.clips = dealt.map((item) => ({ item, poster: null, posterState: 0, shown: 0, video: null, videoTex: null, lastWanted: 0 }));
    // Fewer cards on smaller screens; repeats are fine (rebirth and dedupe keep them apart).
    const profile = mobile ? MOBILE : DESKTOP;
    const area = (innerWidth * innerHeight) / 1e6;
    const count = mobile ? profile.count : Math.max(12, Math.min(profile.count, Math.round((profile.count * area) / TUNED_MPX)));
    const arms = profile.arms;
    const slots = Math.ceil(count / arms);
    this.clipUsed = dealt.map(() => 0);
    this.cards = Array.from({ length: count }, (_, i) => {
      const clip = i % dealt.length;
      this.clipUsed[clip] = ++this.useCounter;
      const { width, height } = this.clips[clip].item;
      const arm = i % arms;
      return {
        clip,
        arm,
        base: (Math.floor(i / arms) + 0.5 + arm * ARM_STAGGER) / slots,
        offset: 0,
        flare: 0,
        target: 0,
        clear: 0,
        c: 0,
        prevC: Number.NaN,
        x: 0,
        y: 0,
        w: 0, // grows in from nothing
        h: 0,
        pickable: false,
        mesh: null,
        live: true,
        material: cardMaterial(this.placeholder, width, height),
      };
    });
    this.liveOrder = this.cards.map((_, i) => i).sort((a, b) => ((a * 0.618034) % 1) - ((b * 0.618034) % 1));
    this.cards.forEach((card) => this.requestPoster(this.clips[card.clip]));
    this.ribbons = new THREE.Mesh(new THREE.BufferGeometry(), ribbonMaterial());
    this.ticks = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false }),
    );
    this.circle = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({ dashSize: 6, gapSize: 10, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }),
    );
    for (const o of [this.ribbons, this.ticks, this.circle]) {
      o.renderOrder = 1;
      o.raycast = () => {};
      this.rig.add(o);
    }
  }

  /** Arm guides for this viewport: rebuilt only when the size changes. */
  private relayout(w: number, h: number) {
    const L = layoutFor(w, h);
    this.layout = L;
    const { arms } = L.profile;
    const SAMPLES = 240;
    const pos: number[] = [], normal: number[] = [], side: number[] = [], along: number[] = [], armId: number[] = [], index: number[] = [];
    const tickPos: number[] = [];
    for (let a = 0; a < arms; a++) {
      const phi = (a * Math.PI * 2) / arms;
      const start = pos.length / 3;
      for (let s = 0; s <= SAMPLES; s++) {
        const t = s / SAMPLES;
        const theta = L.thetaBirth + t * (L.thetaOuter - L.thetaBirth);
        const r = L.b * theta;
        const ang = theta + phi;
        const cx = Math.cos(ang), sy = Math.sin(ang);
        // Tangent of (bθ cos(θ+φ), bθ sin(θ+φ)); the ribbon widens along its normal.
        let tx = cx - theta * sy, ty = sy + theta * cx;
        const len = Math.hypot(tx, ty);
        tx /= len;
        ty /= len;
        for (const sd of [-1, 1]) {
          pos.push(r * cx, r * sy, -2);
          normal.push(-ty, tx);
          side.push(sd);
          along.push(t);
          armId.push(a);
        }
        if (s < SAMPLES) {
          const i0 = start + s * 2;
          index.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2);
        }
      }
      // Ticks straddle the outer half of each arm.
      for (let k = 0; k < TICKS_PER_ARM; k++) {
        const t = 0.5 + (0.5 * (k + 0.5)) / TICKS_PER_ARM;
        const theta = L.thetaBirth + t * (L.thetaOuter - L.thetaBirth);
        const r = L.b * theta;
        const ang = theta + phi;
        const ux = Math.cos(ang), uy = Math.sin(ang);
        tickPos.push(ux * (r - TICK_LEN / 2), uy * (r - TICK_LEN / 2), -2, ux * (r + TICK_LEN / 2), uy * (r + TICK_LEN / 2), -2);
      }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    rg.setAttribute("aNormal", new THREE.Float32BufferAttribute(normal, 2));
    rg.setAttribute("aSide", new THREE.Float32BufferAttribute(side, 1));
    rg.setAttribute("aT", new THREE.Float32BufferAttribute(along, 1));
    rg.setAttribute("aArm", new THREE.Float32BufferAttribute(armId, 1));
    rg.setIndex(index);
    this.ribbons.geometry.dispose();
    this.ribbons.geometry = rg;

    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.Float32BufferAttribute(tickPos, 3));
    this.ticks.geometry.dispose();
    this.ticks.geometry = tg;

    const rc = CIRCLE * L.profile.outer * L.halfDiag;
    const pts = new THREE.EllipseCurve(0, 0, rc, rc).getPoints(200).map((p) => new THREE.Vector3(p.x, p.y, -3));
    this.circle.geometry.dispose();
    this.circle.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    this.circle.computeLineDistances();
  }

  /** The lines are tuned light-on-dark; on paper they go graphite. */
  setLight(light: boolean) {
    const t = light ? THEME.light : THEME.dark;
    const u = this.ribbons.material.uniforms;
    u.uLine.value.copy(srgb(t.line));
    u.uPulseA.value.copy(srgb(t.pulseA));
    u.uPulseB.value.copy(srgb(t.pulseB));
    this.ticks.material.color.set(t.line);
    this.circle.material.color.set(t.line);
  }

  /** Hand a card the clip shown longest ago (not the one it has, not `avoid`). */
  private reassign(card: Card, avoid = -1) {
    let best = -1;
    for (let k = 0; k < this.clips.length; k++) {
      if (k === card.clip || k === avoid) continue;
      if (best < 0 || this.clipUsed[k] < this.clipUsed[best]) best = k;
    }
    if (best < 0) return;
    card.clip = best;
    this.clipUsed[best] = ++this.useCounter;
    const clip = this.clips[best];
    card.material.uniforms.uMap.value = clip.videoTex ?? clip.poster ?? this.placeholder;
    this.requestPoster(clip);
  }

  /** Queue a clip's still for decoding (once). */
  private requestPoster(clip: Clip) {
    if (clip.posterState !== 0) return;
    clip.posterState = 1;
    this.posterQueue.push(clip);
  }

  /**
   * Decode stills off the main thread (createImageBitmap), a couple at a time,
   * and hand the GPU one new texture per frame: a burst of decodes and uploads
   * at load is what made the field stutter in.
   */
  private pumpPosters() {
    while (this.postersLoading < POSTERS_IN_FLIGHT && this.posterQueue.length) {
      const clip = this.posterQueue.shift()!;
      this.postersLoading++;
      const done = (tex: THREE.Texture | null) => {
        this.postersLoading--;
        if (!tex) {
          clip.posterState = 0; // try again later
          return;
        }
        tex.colorSpace = THREE.NoColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.needsUpdate = true;
        clip.poster = tex;
        this.decoded.push(clip);
      };
      if (typeof createImageBitmap === "function") {
        new THREE.ImageBitmapLoader()
          .setOptions({ imageOrientation: "flipY", premultiplyAlpha: "none" })
          .load(local(clip.item.poster), (bitmap) => {
            const tex = new THREE.Texture(bitmap as unknown as HTMLImageElement);
            tex.flipY = false; // flipped at decode, as video frames are
            done(tex);
          }, undefined, () => done(null));
      } else {
        new THREE.TextureLoader().load(local(clip.item.poster), (tex) => done(tex), undefined, () => done(null));
      }
    }
    // One upload per frame.
    const clip = this.decoded.shift();
    if (!clip) return;
    clip.posterState = 2;
    for (const card of this.cards) {
      if (this.clips[card.clip] === clip && !clip.videoTex) card.material.uniforms.uMap.value = clip.poster;
    }
  }

  attach(i: number, mesh: THREE.Mesh | null) {
    this.cards[i].mesh = mesh;
    if (mesh) mesh.raycast = () => {};
  }

  slugOf(i: number) {
    return this.clips[this.cards[i].clip].item.slug;
  }

  /** The pointer in client px; mapped into the world each frame. */
  setPointer(clientX: number, clientY: number, active: boolean) {
    this.ptr.clientX = clientX;
    this.ptr.clientY = clientY;
    this.ptr.active = active;
  }

  /** The card at a client point (for clicks and taps), or -1. */
  cardAt(clientX: number, clientY: number, ctx: Pick<FrameContext, "width" | "height" | "scroll" | "canvasTop">) {
    const x = clientX - ctx.width / 2;
    const y = ctx.height / 2 - (clientY - (ctx.canvasTop - ctx.scroll));
    let best = -1;
    for (let i = 0; i < this.cards.length; i++) {
      const k = this.cards[i];
      if (k.pickable && Math.abs(x - k.x) <= k.w / 2 && Math.abs(y - k.y) <= k.h / 2 && (best < 0 || k.c > this.cards[best].c)) best = i;
    }
    return best;
  }

  update(rawDt: number, ctx: FrameContext, label: string) {
    const dt = Math.min(rawDt, 0.1);
    this.time += dt;
    this.pumpPosters();
    // Governor: shed cards below the floor, regrow slowly; never during load.
    this.frameEma += (Math.min(rawDt, 0.25) - this.frameEma) * 0.05;
    if (this.time > PERF_GRACE_S) {
      if (this.frameEma > 1 / FPS_FLOOR) this.perfScale = Math.max(0.35, this.perfScale - dt * 0.3);
      else if (this.frameEma < 0.7 / FPS_FLOOR) this.perfScale = Math.min(1, this.perfScale + dt * 0.05);
    }
    const liveN = Math.max(6, Math.round(this.cards.length * this.perfScale));
    this.liveOrder.forEach((ci, rank) => (this.cards[ci].live = rank < liveN));
    for (const clip of this.clips) clip.shown += ((clip.videoTex || clip.posterState === 2 ? 1 : 0) - clip.shown) * ease(dt, 0.3);
    const { width: w, height: h } = ctx;
    if (!this.layout || this.layout.w !== w || this.layout.h !== h) this.relayout(w, h);
    const L = this.layout!;
    const unit = Math.min(1, Math.max(0.55, Math.min(w, 1600) / 1440));
    // The copy under the wordmark (line, paragraph, CTAs), px from the centre:
    // cards may cross the wordmark itself; only the small text needs room.
    const zoneW = Math.min(w * 0.3, 470);
    const zoneH = Math.min(h * 0.2, 170);
    const zoneY = h * 0.14; // world y is up: the copy sits ~0.14 vh below the centre

    // Intro: a reveal front sweeps out from the mark once the copy has landed,
    // and the conveyor arrives fast and settles into its drift.
    if (introClock.done || introClock.t >= BEATS.galaxy) this.introT += dt;
    const revealR = easeOutCubic(clamp01(this.introT / REVEAL_S)) * L.halfDiag * EXIT + REVEAL_BAND;
    const burst = 1 + (BURST_X - 1) * (1 - easeOutCubic(clamp01(this.introT / BURST_S)));
    const shown = clamp01(this.introT / 0.6);

    // The pointer in world px (y up), active only over the canvas.
    const ptr = this.ptr;
    const px = ptr.clientX - w / 2;
    const py = h / 2 - (ptr.clientY - (ctx.canvasTop - ctx.scroll));
    const inside = ptr.active && Math.abs(px) <= w / 2 && Math.abs(py) <= h / 2;

    // Conveyor: idle drift plus scroll scrub, braked while a card is held.
    this.idle += (dt * JOURNEYS_PER_MIN * burst) / 60;
    const P = this.idle + ctx.scroll * SCRUB_PER_PX;
    const dP = this.lastP === null ? 0 : P - this.lastP;
    this.lastP = P;
    const holding = this.target >= 0;
    this.holdTarget += ((holding ? 1 : 0) - this.holdTarget) * ease(dt, HOLD_TAU);
    this.holdRest += ((holding ? 1 : 0) - this.holdRest) * ease(dt, REST_TAU);
    this.field += ((holding ? 0 : 1) - this.field) * ease(dt, FIELD_TAU);
    this.spin += dt * SPIN * (1 - this.holdRest);
    this.rig.rotation.z = this.spin;
    const cosS = Math.cos(this.spin), sinS = Math.sin(this.spin);

    const ru = this.ribbons.material.uniforms;
    ru.uTime.value = this.time; // comets keep running through a hold
    ru.uReveal.value = revealR;
    ru.uAlpha.value = shown;
    this.ticks.material.opacity = TICK_ALPHA * shown;
    this.circle.material.opacity = LINE_ALPHA * shown;

    // Pass 1: where every card is.
    const { arms } = L.profile;
    this.cards.forEach((card, i) => {
      card.offset -= dP * (i === this.target ? Math.max(this.holdTarget, this.holdRest) : this.holdRest);
      const c = fract(card.base + P + card.offset);
      // Reborn at the core (the wrap happens off screen or at zero alpha):
      // take the clip shown longest ago, so repeats spread as far as they can.
      if (this.introT > REVEAL_S && Math.abs(c - card.prevC) > 0.5) this.reassign(card);
      card.prevC = c;
      card.c = c;
      const theta = L.thetaBirth + c * (L.thetaExit - L.thetaBirth);
      const r = L.b * theta;
      const ang = theta + (card.arm * Math.PI * 2) / arms;
      const ux = Math.cos(ang), uy = Math.sin(ang);
      // Floating drift, tangential plus a lighter radial part; it swells while
      // the spiral is held and dies on the held card so it can't slip the cursor.
      const wob = WOBBLE_PX * (1 + (HOLD_WOBBLE - 1) * this.holdRest) * (1 - card.target);
      const wt = Math.sin(this.time * WOBBLE_HZ * Math.PI * 2 + i * 1.37);
      const wr = Math.cos(this.time * WOBBLE_HZ * Math.PI * 2 * 0.7 + i * 2.11);
      const lx = r * ux + wob * (-uy * wt + 0.6 * ux * wr);
      const ly = r * uy + wob * (ux * wt + 0.6 * uy * wr);
      // Spun with the rig; the card itself stays upright.
      let x = cosS * lx - sinS * ly;
      let y = sinS * lx + cosS * ly;
      if (inside) {
        // Cards in the field drift a little toward the hand.
        const dx = px - x, dy = py - y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const tug = TUG_PX * Math.exp(-(d * d) / (FIELD_PX * FIELD_PX)) * this.field * (1 - card.target);
        x += (dx / d) * tug;
        y += (dy / d) * tug;
      }
      card.x = x;
      card.y = y;
    });

    // Collision-free sizing: two upright cards clear each other when their
    // centre gap beats their half-extents on either axis. If every card takes
    // at most `density` of its nearest such separation (in heights, widths
    // counted as 16:9), no pair can overlap. Growth eases, shrinking is
    // instant so the guarantee holds every frame. The held card is pinned on a
    // smooth ease instead, and its neighbours yield to its actual height.
    const cap = Math.min(340, Math.max(70, h * L.profile.capH));
    const held = this.target >= 0 && this.cards[this.target].target > 0.3 ? this.target : -1;
    this.cards.forEach((card, i) => {
      let sep = Infinity;
      let besideHeld = Infinity;
      if (!card.live) {
        card.h = 0;
        card.w = 0;
        return;
      }
      for (let j = 0; j < this.cards.length; j++) {
        if (j === i) continue;
        const o = this.cards[j];
        if (!o.live) continue;
        const m = Math.max((Math.abs(o.x - card.x) * 9) / 16, Math.abs(o.y - card.y));
        if (j === held) besideHeld = Math.min(besideHeld, Math.max(0, 2 * m - o.h) * 0.98);
        else sep = Math.min(sep, m);
      }
      // Newborns stay smaller than outer cards even with room to spare.
      const goal = Math.min(cap * (INNER_CAP + (1 - INNER_CAP) * card.c), L.profile.density * sep, besideHeld);
      if (i === held) card.h += (goal - card.h) * ease(dt, 1 / 6);
      else card.h = goal < card.h ? goal : card.h + (goal - card.h) * ease(dt, 1 / 3);
      const { width: cw, height: ch } = this.clips[card.clip].item;
      // Newborns are rounded squares that open into their clip's shape (portrait
      // clips end narrower than 16:9, so the guarantee above still holds).
      card.w = card.h * THREE.MathUtils.lerp(1, cw / ch, smoothstep(0, SQUARE_UNTIL, card.c));
    });

    // The held card: kept while the pointer stays on it (plus a margin that
    // covers the tug), otherwise the outermost card under the pointer.
    let next = -1;
    if (inside) {
      const cur = this.target >= 0 ? this.cards[this.target] : null;
      const m = TUG_PX + 8;
      if (cur && cur.pickable && Math.abs(px - cur.x) <= cur.w / 2 + m && Math.abs(py - cur.y) <= cur.h / 2 + m) next = this.target;
      else {
        for (let i = 0; i < this.cards.length; i++) {
          const k = this.cards[i];
          if (k.pickable && Math.abs(px - k.x) <= k.w / 2 && Math.abs(py - k.y) <= k.h / 2 && (next < 0 || k.c > this.cards[next].c)) next = i;
        }
      }
    }
    this.target = next;

    // Pass 2: how every card looks.
    const wanted: { clip: Clip; t: number }[] = [];
    this.cards.forEach((card, i) => {
      const held = i === this.target;
      card.target += ((held ? 1 : 0) - card.target) * ease(dt, TARGET_TAU);
      card.clear += ((held ? 1 : 0) - card.clear) * ease(dt, CLEAR_TAU);
      const { x, y, w: W, h: H, c } = card;
      let fall = 0;
      if (inside) {
        const dx = px - x, dy = py - y;
        fall = Math.exp(-(dx * dx + dy * dy) / (FIELD_PX * FIELD_PX)) * this.field;
      }
      card.flare = Math.max(card.flare * Math.exp(-FLARE_DECAY * dt), FLARE_ADD * fall);

      // Quiet zone: cards behind the copy fade and soften so the words read.
      const sx = Math.abs(x) / zoneW;
      const sy = Math.abs(y + zoneY) / zoneH;
      const quiet = THREE.MathUtils.lerp(0.35, 1, smoothstep(0.8, 1.08, Math.max(sx, sy)));
      const r = Math.hypot(x, y);
      const revealed = clamp01((revealR - r) / REVEAL_BAND);
      // Shown once its still (or clip) has arrived, faded in; shed cards are gone.
      const alpha = card.live ? smoothstep(0, FADE_IN, c) * revealed * (held ? 1 : quiet) * this.clips[card.clip].shown : 0;
      if (card.mesh) card.mesh.visible = alpha > 0.001;
      card.pickable = alpha > 0.5 && quiet > 0.8;

      const mesh = card.mesh;
      if (mesh) {
        mesh.position.set(x, y, 0);
        mesh.scale.set(W, H, 1);
        // Outer paints over inner; the held card lifts above everything.
        mesh.renderOrder = 10 + Math.round(c * 100) + Math.round(card.target * 500);
      }
      const u = card.material.uniforms;
      u.uAlpha.value = alpha;
      const clean = 1 - card.clear;
      u.uBlur.value = Math.max(BLUR_BIRTH * (1 - smoothstep(0, BLUR_END, c)), (1 - revealed) * BLUR_BIRTH, (1 - quiet) * 0.05) * clean;
      u.uAber.value = (ABERRATION + card.flare) * clean;
      u.uCurve.value = CURVE_PX * clean;
      u.uBulge.value = BULGE_PX * fall * clean;
      u.uMouse.value.set((px - x) / Math.max(1, W), (py - y) / Math.max(1, H));
      u.uHeat.value = (1 - smoothstep(0.02, 0.22, c)) * clean;
      u.uFocus.value = card.clear;
      u.uRadius.value = CORNER_PX * unit;
      u.uSize.value.set(W, H);
      const { width: cw, height: ch } = this.clips[card.clip].item;
      fitCover(u, W, H, cw, ch);

      const clip = this.clips[card.clip];
      if (clip.item.kind === "video" && c > PLAY_FROM && alpha > 0.3) wanted.push({ clip, t: c + card.target * 2 });
    });

    this.dedupe();
    this.cull(dt, wanted);
    this.placeTip(ctx, label);
  }

  /** Two visible copies of a clip close together: the younger, blurrier one swaps. */
  private dedupe() {
    const cards = this.cards;
    for (let i = 0; i < cards.length; i++) {
      const a = cards[i];
      if (a.material.uniforms.uAlpha.value < 0.2) continue;
      for (let j = i + 1; j < cards.length; j++) {
        const b = cards[j];
        if (b.clip !== a.clip || b.material.uniforms.uAlpha.value < 0.2) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) > DEDUP_PX) continue;
        const younger = a.c < b.c ? a : b;
        if (younger === cards[this.target]) continue;
        this.reassign(younger, a.clip);
      }
    }
  }

  /** Decode budget: the held card first, then the outermost visible ones. */
  private cull(dt: number, wanted: { clip: Clip; t: number }[]) {
    this.cullTimer += dt;
    if (this.cullTimer < 0.25 || this.av1 === null) return;
    this.cullTimer = 0;
    wanted.sort((a, b) => b.t - a.t);
    const keep = new Set<Clip>();
    for (const w of wanted) {
      if (keep.size >= this.maxPlaying) break;
      keep.add(w.clip);
    }
    let started = 0;
    for (const clip of this.clips) {
      if (keep.has(clip)) {
        clip.lastWanted = this.time;
        const v = this.videoFor(clip);
        // Starting a decoder is the expensive moment: a few per tick.
        if (v.paused && started < 3) {
          started++;
          v.play().catch((e: DOMException) => {
            if (e.name === "NotAllowedError") this.blocked = true;
          });
        }
      } else if (clip.video && !clip.video.paused && this.time - clip.lastWanted > 1.2) {
        clip.video.pause();
      }
    }
  }

  /**
   * Off-screen or hidden: give every decoder back. Phones only have a few,
   * and the work grid and showreel below need them; the cull loop picks the
   * clips up again when the hero is back.
   */
  sleep() {
    for (const clip of this.clips) if (clip.video && !clip.video.paused) clip.video.pause();
  }

  /** Called inside a user gesture, where a refused play() is allowed again. */
  unlock() {
    if (!this.blocked) return;
    this.blocked = false;
    for (const clip of this.clips) {
      if (clip.video?.paused && this.time - clip.lastWanted < 1) clip.video.play().catch(() => {});
    }
  }

  private videoFor(clip: Clip) {
    if (clip.video) return clip.video;
    const v = document.createElement("video");
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "auto";
    v.crossOrigin = "anonymous";
    v.src = local(this.av1 && clip.item.file_av1 ? clip.item.file_av1 : clip.item.file);
    // VideoTexture uploads frames from requestVideoFrameCallback, which never
    // fires while paused: swap the poster out only once the clip is playing.
    v.addEventListener("playing", () => {
      const tex = new THREE.VideoTexture(v);
      tex.colorSpace = THREE.NoColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
      clip.videoTex = tex;
      for (const card of this.cards) {
        if (this.clips[card.clip] === clip) card.material.uniforms.uMap.value = tex;
      }
    }, { once: true });
    clip.video = v;
    return v;
  }

  /** The label rides above the held card; the page cursor turns to a pointer. */
  private placeTip({ tip, width, height }: FrameContext, label: string) {
    const root = document.documentElement;
    if (this.target !== this.tipFor) {
      this.tipFor = this.target;
      root.style.cursor = this.target >= 0 ? "pointer" : "";
      if (tip && this.target >= 0) {
        tip.replaceChildren();
        const dot = document.createElement("span");
        dot.className = "inline-block size-1.5 bg-ember-500";
        tip.append(dot, `${this.clips[this.cards[this.target].clip].item.title} · ${label}`);
      }
    }
    if (!tip) return;
    if (this.target < 0) {
      tip.style.opacity = "0";
      return;
    }
    const k = this.cards[this.target];
    tip.style.transform = `translate3d(${Math.round(width / 2 + k.x)}px, ${Math.round(height / 2 - k.y - k.h / 2 - 44)}px, 0) translateX(-50%)`;
    tip.style.opacity = "1";
  }

  dispose() {
    document.documentElement.style.cursor = "";
    this.geometry.dispose();
    this.cards.forEach((c) => c.material.dispose());
    this.clips.forEach((c) => {
      c.poster?.dispose();
      c.videoTex?.dispose();
      if (c.video) {
        c.video.pause();
        c.video.removeAttribute("src");
        c.video.load();
      }
    });
    for (const o of [this.ribbons, this.ticks, this.circle]) {
      o.geometry.dispose();
      o.material.dispose();
    }
    this.placeholder.dispose();
  }
}

export type GalaxyProps = {
  items: GalaxyItem[];
  lang: string;
  label: string;
  onReady: () => void;
};

export default function ForgeGalaxy(props: GalaxyProps) {
  const tip = useRef<HTMLDivElement>(null);
  const active = useRef(true);

  return (
    <div aria-hidden className="absolute inset-0">
      <Canvas
        linear
        flat
        // Footage planes gain nothing from a 2x framebuffer; 1.5x keeps the hairlines clean for far less fill.
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ fov: FOV, near: 1, far: 20000, position: [0, 0, 1000] }}
        onCreated={() => props.onReady()}
        style={{ position: "absolute", inset: 0 }}
      >
        <Scene {...props} tip={tip} active={active} />
      </Canvas>
      <div
        ref={tip}
        className="hud frost pointer-events-none absolute left-0 top-0 z-10 flex items-center gap-2 border border-line px-3 py-2 text-ink opacity-0 transition-opacity duration-[var(--dur-micro)]"
      />
    </div>
  );
}

function Scene({
  items, lang, label, tip, active,
}: GalaxyProps & {
  tip: React.RefObject<HTMLDivElement | null>;
  active: React.RefObject<boolean>;
}) {
  const router = useRouter();
  const { camera, size, gl } = useThree();
  const setFrameloop = useThree((s) => s.setFrameloop);
  const mobile = (size.width * size.height) / 1e6 < MOBILE_MPX;
  const world = useMemo(() => new GalaxyWorld(items, mobile), [items, mobile]);
  // The canvas's page offset, measured on resize (never in the frame loop).
  const canvasTop = useRef(0);

  useEffect(() => () => world.dispose(), [world]);
  useEffect(() => {
    const apply = () => world.setLight(themeStore.read() === "light");
    apply();
    return themeStore.subscribe(apply);
  }, [world]);

  useEffect(() => {
    canvasTop.current = gl.domElement.getBoundingClientRect().top + frameScroll();
  }, [gl, size.width, size.height]);

  // The cursor is tracked on the window: the hero copy sits above the canvas.
  // A click on a card (not on a link or button) opens it; taps work the same.
  useEffect(() => {
    const ctx = () => ({ width: size.width, height: size.height, scroll: frameScroll(), canvasTop: canvasTop.current });
    const onMove = (e: PointerEvent) => world.setPointer(e.clientX, e.clientY, e.pointerType === "mouse" || e.pointerType === "pen");
    const onOut = (e: PointerEvent) => {
      if (!e.relatedTarget) world.setPointer(e.clientX, e.clientY, false);
    };
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.("a, button, input, select, textarea, label, [role='button']")) return;
      const i = world.target >= 0 ? world.target : world.cardAt(e.clientX, e.clientY, ctx());
      if (i >= 0) router.push(`/${lang}/work/${world.slugOf(i)}`);
    };
    addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onOut, { passive: true });
    addEventListener("click", onClick);
    return () => {
      removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onOut);
      removeEventListener("click", onClick);
    };
  }, [world, router, lang, size.width, size.height]);

  // Off-screen or hidden tab: stop rendering and release every video decoder.
  useEffect(() => {
    let visible = true;
    let park = 0;
    const apply = () => {
      const on = visible && !document.hidden;
      active.current = on;
      // Park the decoders only after a grace period, so scrolling around the
      // hero's edge doesn't keep pausing and restarting them.
      clearTimeout(park);
      if (!on) park = window.setTimeout(() => world.sleep(), PARK_DELAY_MS);
      setFrameloop(on ? "always" : "never");
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      apply();
    });
    io.observe(gl.domElement);
    document.addEventListener("visibilitychange", apply);
    const unlock = () => world.unlock();
    addEventListener("pointerdown", unlock, { passive: true });
    addEventListener("touchstart", unlock, { passive: true });
    return () => {
      clearTimeout(park);
      io.disconnect();
      document.removeEventListener("visibilitychange", apply);
      removeEventListener("pointerdown", unlock);
      removeEventListener("touchstart", unlock);
    };
  }, [gl, world, setFrameloop, active]);
  useEffect(() => fitCamera(camera as THREE.PerspectiveCamera, size.height), [camera, size.height]);

  useFrame((_, dt) => {
    if (!active.current) return;
    world.update(dt, { width: size.width, height: size.height, scroll: frameScroll(), canvasTop: canvasTop.current, tip: tip.current }, label);
  });

  return (
    <>
      <primitive object={world.rig} />
      {world.cards.map((card, i) => (
        <mesh key={i} ref={(m: THREE.Mesh | null) => world.attach(i, m)} geometry={world.geometry} material={card.material} />
      ))}
    </>
  );
}

/** Perspective camera fitted so 1 world unit == 1 CSS px on the z=0 plane. */
function fitCamera(cam: THREE.PerspectiveCamera, height: number) {
  cam.position.z = height / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  cam.far = cam.position.z * 4;
  cam.updateProjectionMatrix();
}

function cardMaterial(map: THREE.Texture, width: number, height: number) {
  return new THREE.ShaderMaterial({
    vertexShader: CARD_VERT,
    fragmentShader: CARD_FRAG,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    uniforms: {
      uMap: { value: map },
      uCover: { value: new THREE.Vector2(1, 1) },
      uCoverOffset: { value: new THREE.Vector2(0, 0) },
      uSize: { value: new THREE.Vector2(width, height) },
      uBlur: { value: BLUR_BIRTH },
      uAlpha: { value: 0 },
      uHeat: { value: 1 },
      uAber: { value: ABERRATION },
      uFocus: { value: 0 },
      uRadius: { value: CORNER_PX },
      uCurve: { value: CURVE_PX },
      uBulge: { value: 0 },
      uMouse: { value: new THREE.Vector2(9, 9) },
      uEmber: { value: EMBER },
      uRim: { value: STEEL_RIM },
    },
  });
}

function ribbonMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: RIBBON_VERT,
    fragmentShader: RIBBON_FRAG,
    // The strip's winding flips with the spiral's direction: never cull it.
    side: THREE.DoubleSide,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uAlpha: { value: 0 },
      uLine: { value: srgb(THEME.dark.line) },
      uPulseA: { value: srgb(THEME.dark.pulseA) },
      uPulseB: { value: srgb(THEME.dark.pulseB) },
    },
  });
}

/** object-fit: cover for the clip inside the card's current aspect. */
function fitCover(u: Record<string, THREE.IUniform>, pw: number, ph: number, cw: number, ch: number) {
  const img = (u.uMap.value as THREE.Texture).image as
    | { videoWidth?: number; width?: number; videoHeight?: number; height?: number }
    | undefined;
  const iw = img?.videoWidth || img?.width || cw;
  const ih = img?.videoHeight || img?.height || ch;
  const sx = Math.min(1, pw / ph / (iw / ih));
  const sy = Math.min(1, iw / ih / (pw / ph));
  u.uCover.value.set(sx, sy);
  u.uCoverOffset.value.set((1 - sx) / 2, (1 - sy) / 2);
}
