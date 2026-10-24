/**
 * The board's two GLSL ES 3.00 programs (docs/DESIGN.md §4.5). One full-screen triangle, one RGBA8 state texture,
 * one analytic fragment shader: ellipse discs with device-pixel AA, motion-blur taps, Lambert + Blinn-Phong from the
 * orbiting light, the rim sliver, the off-face ring + highlight, offset soft shadows (own cell + the three up/left
 * neighbours) and the feathered hero exclusions. Output is premultiplied; the browser composites the transparent canvas
 * over the CSS paper.
 *
 * Packed state (§4.3, matches `sim.ts`): per texel `[θ hi, θ lo, charge, ω]` with
 * `θ = (u16 / 65535 · 1.30 − 0.15) · π`, `charge = b / 255`, `ω = (a / 255 · 2 − 1) · 40 rad/s`.
 *
 * Theme: `uThemeBit` says which physical side is the *off* (paper) face — day: `cos θ > 0`, night: `cos θ < 0` — so the
 * colour uniforms are always the current CSS tokens (`uFaceA` = paper, `uFaceB` = ink) and never swap.
 *
 * Precision: positions and the 16-bit θ decode are highp; every shading quantity is mediump (half precision on
 * Apple and mobile GPUs, where the fragment cost halves). Discs at rest (|ω| < 0.25 rad/s, i.e. the packed ω byte at
 * its zero) take a single blur tap because every tap would coincide — most of the board, most of the time.
 */

/** Full-screen triangle from `gl_VertexID` — no buffers, no attributes. The fragment stage reads `gl_FragCoord`. */
export const VERTEX_SHADER = `#version 300 es
void main() {
  // ids 0, 1, 2 → (−1,−1), (3,−1), (−1,3): one triangle that covers clip space
  vec2 v = vec2(float((gl_VertexID & 1) << 2), float((gl_VertexID & 2) << 1)) - 1.0;
  gl_Position = vec4(v, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uState;     // RGBA8 C×R, NEAREST: [θ hi, θ lo, charge, ω]
uniform ivec2 uGrid;          // C, R
uniform float uCellPx;        // pitch in device px
uniform vec2 uRes;            // backing store size in device px
uniform mediump vec3 uFaceA;  // --paper: the off face
uniform mediump vec3 uFaceB;  // --ink: the on face
uniform mediump vec3 uSignal; // --signal: charged discs
uniform mediump vec3 uLight;  // unit vector, x right / y down / z toward the viewer
uniform mediump vec3 uHalf;   // normalize(uLight + (0, 0, 1)), the Blinn-Phong half vector (set per frame by gl.ts)
uniform ivec3 uShading;       // specular, rim, charge colour (0/1)
uniform int uShadow;          // 0/1
uniform int uBlurTaps;        // 1–3
uniform int uThemeBit;        // 0: discs rest at θ = 0, 1: at θ = π
uniform vec4 uExclusion[4];   // x, y, w, h in device px, top-left origin
uniform int uExclusionCount;

out mediump vec4 fragColor;

const float PI = 3.141592653589793;
const float R_FRAC = 0.44;        // disc radius as a fraction of the pitch (§4.2)
const mediump float RY_MIN = 0.3; // an edge-on disc keeps a 0.6 px sliver instead of vanishing
const float FRAME = 1.0 / 60.0;   // motion-blur exposure
const float OMEGA_REST = 0.25;    // below this (rad/s) the taps coincide: the packed ω byte's zero decodes to 0.157
const mediump float RING_ALPHA = 0.06;
const mediump float HIGHLIGHT = 0.04;
const mediump vec2 HIGHLIGHT_DIR = vec2(-0.7, -0.7);

float decodeTheta(vec4 t) {
  return ((t.r * 65280.0 + t.g * 255.0) / 65535.0 * 1.30 - 0.15) * PI;
}

float decodeOmega(vec4 t) {
  return (t.a * 2.0 - 1.0) * 40.0;
}

vec2 centreOf(ivec2 cell) {
  return (vec2(cell) + 0.5) * uCellPx;
}

// 1 inside an exclusion rect, feathered to 0 one cell outside. Evaluated at the cell centre so a disc keeps its shape.
float exclusion(vec2 c) {
  float e = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= uExclusionCount) break;
    vec4 r = uExclusion[i];
    vec2 d = max(r.xy - c, c - (r.xy + r.zw));
    e = max(e, 1.0 - smoothstep(0.0, uCellPx, max(d.x, d.y)));
  }
  return e;
}

// θ of a neighbour cell with its exclusion applied (its shadow may reach this pixel; its disc cannot, r < pitch / 2)
float neighbourTheta(ivec2 cell, float rest) {
  float th = decodeTheta(texelFetch(uState, cell, 0));
  return mix(th, rest, exclusion(centreOf(cell)));
}

// signed distance in device px (negative inside) to the disc of a cell flipped by angle th, for a pixel at rel
mediump float discDist(mediump vec2 rel, mediump float r, mediump float ct) {
  mediump float ry = max(r * abs(ct), RY_MIN);
  mediump vec2 q = rel / vec2(r, ry);
  return (length(q) - 1.0) * min(r, ry);
}

mediump float coverage(mediump float d) {
  return 1.0 - smoothstep(-0.75, 0.75, d);
}

// soft shadow of a flipping disc, offset down-right by (0.18, 0.30)·r·|sin θ|
mediump float shadowAlpha(vec2 rel, mediump float r, float th) {
  mediump float s = abs(sin(th));
  if (s < 0.001) return 0.0;
  mediump vec2 q = rel - vec2(0.18, 0.30) * r * s;
  mediump float d = discDist(q, r, cos(th));
  return 0.22 * s * (1.0 - smoothstep(0.0, 1.5, d));
}

mediump vec3 shade(mediump float ct, mediump float st, mediump float charge, mediump float d, mediump vec2 rel, bool paperSide) {
  // outward normal of the face that shows (z > 0)
  mediump vec3 n = ct >= 0.0 ? vec3(0.0, st, ct) : vec3(0.0, -st, -ct);
  mediump vec3 col;
  if (paperSide) {
    col = uFaceA * (0.90 + 0.10 * max(dot(n, uLight), 0.0));
    // a 1 px ring inside the edge, 6 % ink, with a 4 % white highlight in the upper-left quadrant
    mediump float ring = smoothstep(-1.75, -0.75, d);
    col = mix(col, uFaceB, RING_ALPHA * ring);
    mediump vec2 dir = rel / max(length(rel), 1e-3);
    mediump float hl = smoothstep(0.2, 0.4, dot(dir, HIGHLIGHT_DIR));
    col = mix(col, vec3(1.0), HIGHLIGHT * ring * hl);
  } else {
    col = mix(uFaceB, uSignal, uShading.z == 1 ? charge : 0.0);
    if (uShading.x == 1) col += 0.18 * pow(max(dot(n, uHalf), 0.0), 24.0);
  }
  if (uShading.y == 1) {
    mediump float a = abs(ct);
    if (a < 0.15) col = mix(col, uFaceB * 0.6, 1.0 - a / 0.15);
  }
  return col;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  ivec2 cell = ivec2(floor(p / uCellPx));
  if (cell.x >= uGrid.x || cell.y >= uGrid.y) {
    fragColor = vec4(0.0);
    return;
  }
  vec2 centre = centreOf(cell);
  vec2 rel = p - centre;
  mediump float r = R_FRAC * uCellPx;
  float rest = float(uThemeBit) * PI;

  vec4 s = texelFetch(uState, cell, 0);
  float ex = exclusion(centre);
  float theta = mix(decodeTheta(s), rest, ex);
  float omega = decodeOmega(s) * (1.0 - ex);
  mediump float charge = s.b * (1.0 - ex);

  // shadows sit under the discs: the own cell plus the up / left neighbours whose shadows can spill into this cell
  mediump float shadow = 0.0;
  if (uShadow == 1) {
    shadow = shadowAlpha(rel, r, theta);
    bool nearLeft = cell.x > 0 && rel.x < -0.47 * uCellPx + 2.0;
    bool nearTop = cell.y > 0 && rel.y < -0.42 * uCellPx + 2.0;
    if (nearLeft) {
      ivec2 c = cell + ivec2(-1, 0);
      shadow = 1.0 - (1.0 - shadow) * (1.0 - shadowAlpha(p - centreOf(c), r, neighbourTheta(c, rest)));
    }
    if (nearTop) {
      ivec2 c = cell + ivec2(0, -1);
      shadow = 1.0 - (1.0 - shadow) * (1.0 - shadowAlpha(p - centreOf(c), r, neighbourTheta(c, rest)));
    }
    if (nearLeft && nearTop) {
      ivec2 c = cell + ivec2(-1, -1);
      shadow = 1.0 - (1.0 - shadow) * (1.0 - shadowAlpha(p - centreOf(c), r, neighbourTheta(c, rest)));
    }
  }

  // the disc: coverage and colour averaged over the motion-blur taps (θ_t = θ − ω · 1/60 · t, t ∈ [0, 1])
  mediump vec3 rgb = vec3(0.0);
  mediump float cov = 0.0;
  if (dot(rel, rel) < (r + 1.0) * (r + 1.0)) {
    int taps = abs(omega) < OMEGA_REST ? 1 : clamp(uBlurTaps, 1, 3);
    bool dayRest = uThemeBit == 0;
    mediump vec2 q = rel;
    for (int i = 0; i < 3; i++) {
      if (i >= taps) break;
      float t = taps == 1 ? 0.0 : float(i) / float(taps - 1);
      float th = theta - omega * FRAME * t;
      mediump float ct = cos(th);
      mediump float d = discDist(q, r, ct);
      mediump float c = coverage(d);
      if (c > 0.0) {
        rgb += shade(ct, sin(th), charge, d, q, (ct >= 0.0) == dayRest) * c;
        cov += c;
      }
    }
    mediump float inv = 1.0 / float(taps);
    rgb *= inv;
    cov *= inv;
  }

  // premultiplied: the disc over a black shadow adds no colour, only alpha
  fragColor = vec4(rgb, cov + shadow * (1.0 - cov));
}
`;
