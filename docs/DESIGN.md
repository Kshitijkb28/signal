# Portfolio v2 — **Signal** — Final Design Spec

## 1. Identity

- **Concept name:** Signal
- **Slug:** `signal` → project folder `portfolio-signal`
- **Tagline:** Signal from noise — a portfolio rendered one flip at a time.
- **Thesis:** Kshitij's current job is literally turning noise into signal: dataset preparation, evaluation pipelines, response-quality work — thousands of small binary decisions choreographed into something legible. Signal makes that physical. The whole site sits on one electromechanical flip-dot display (one bit per disc, 9,000–75,000 discs depending on the screen) that lives behind an ivory page of ruled Swiss "sheets". The machine captures his typeset name disc by disc, dissolves it as you scroll, spells his own résumé numbers in the gaps between sheets, prints cellular-automaton artwork seeded by each project's name inside the project windows, and physically flips every disc when the theme changes. Nothing is imported: discs are analytic SDFs in one fragment shader, their motion is a damped-spring simulation, titles are split-flap cells, project art is a rule-selected automaton, the favicon is the machine's own 5×7 alphabet. Where v1 was warm, dark, soft and inertial (a tower you push), v2 is light, mechanical, typographic and binary: ivory, ink, one ultramarine, flips instead of easing curves, hairlines instead of glow. Every sentence sits on opaque paper at ≥16:1 and the machine only ever speaks the résumé's own words.
- **The experience, first paint to footer:** The page paints ivory with the name already set in Archivo (the LCP element), a split-flap readout reading `00 HOME` top-left, two 44 px controls top-right, and a faint static dot field behind the hero. Within ~1 s the board wakes: a one-column self-test sweeps across the screen, the readout flaps three real boot milestones, then the discs under the name flip on left→right and the typeset name hands over to its dot-matrix twin (desktop; phones keep the crisp name and the machine types a 7-row copy beneath it). Scrolling dissolves the dot-name toward the readout, which flips to `KB`, then to `01 ABOUT` as the first ruled sheet slides over the machine. Between sheets the board spells `3 YRS`, `2 COMPANIES`, `3 PRODUCTS`, `17 TOOLS`, `B.TECH`, `LET'S BUILD`. The About sheet is an odometer, a flapped title, the summary and a 2×2 facts table; Experience is a ledger with a scrubbed dotted tape; Projects are three "printouts" whose sticky windows show the automaton printing one row per 24 px of scroll; Stack is a departure board of flap rows that spell where each tool was used; Education fills two 25-disc meters to 67.4 % and 64 %; Contact is a giant flap button holding the email that flips to `COPIED — TAP TO MAIL`. The footer is a last ruled sheet and then the page ends on the bare machine; `Back to top` wipes every disc once and re-captures the name.

## 2. Difference from v1 (every axis)

| Axis | v1 (Soft Stack) | v2 (Signal) |
|---|---|---|
| Palette | Near-black ink `#0A0B0E`, tangerine / amber / mint accents | Warm ivory paper `#F3EFE7`, ink `#121212`, one ultramarine `#1F2FD3`; night theme is bone-on-carbon, never orange |
| Typography | Bricolage Grotesque + Instrument Sans + JetBrains Mono | Archivo (variable width axis, animated) + Martian Mono (wide monospace for machine text); two families only |
| Hero object / metaphor | 3D tower of rounded slabs leaning/spinning under the pointer with inertia | A flat electromechanical flip-dot display that captures the typeset name disc by disc; signal from noise, not a stack |
| Canvas architecture | Absolute canvas inside the hero, three.js meshes + lights + bloom | One fixed, transparent, raw-WebGL2 canvas behind the whole page; no meshes, no three.js: a CPU spring sim feeding one RGBA8 texture and one SDF fragment shader |
| Rendering stack | MeshStandardMaterial, RoomEnvironment, Bloom post-pass | Custom GLSL: analytic ellipse SDFs, Lambert + Blinn-Phong from an orbiting light, offset soft shadows, 3-tap analytic motion blur, fwidth AA, charge colour; no post pass (AA and blur are in-shader) |
| Layout system | Stacked alternating full-width bands | Ruled Swiss sheets on a 12-column grid scrolling over the machine, with transparent gaps and windows where the board narrates |
| Navigation | Top nav bar + floating bottom pill tab bar on phones | A split-flap readout (top-left) that opens a full-screen board menu; same pattern on every device; no bars |
| Section titles | Thin word + bold word contrast pair | Split-flap cell titles that mechanically flip into place, with an odometer index |
| Entrance | No preloader; headline clip reveal | Self-test sweep → honest boot milestones in the readout → type-to-dot capture → crossfade |
| Motion language | Soft inertia, damping, whips, expo easings | Mechanical flips, stamps, rolls and wipes with hard starts; springs with a deliberate clack |
| Scrolling | Lenis smooth scroll, pinned horizontal projects, snap carousel | Native scroll, no pinning, no carousel; vertical printouts with sticky windows |
| Projects visuals | Giant-initial generative cards with skins | Cellular-automaton printouts seeded by name, rule-selected by tags, perturbable by the visitor |
| Skills | Marquee strips of chips | A departure board of split-flap rows with tag-derived `SEEN IN` cross-references |
| Education | Hairline percentages | 25-disc dot meters (16 + 0.85 discs, 16 + 0 discs) |
| Texture signature | Animated SVG grain overlay | A dotted grid on the sheets aligned to the board's cell pitch, 1 px rules; no grain |
| Cursor | Dot + lagging ring | A grid-quantised square cell that becomes corner brackets around targets |
| Hover signature | Flip-hover stacked spans, magnetic CTAs, spotlight cards | Inverse-video wipe on everything; re-clacking rows; no flips on links |
| Feedback | Toast component | The readout flaps the message (`COPIED`, `GOTO 03`), aria-live |
| Monogram / identity | KB ring monogram with ramp gradient | `KB` in the machine's 5×7 disc alphabet (also favicon + OG image) |
| Theme | Dark only | Day by default; night via a wave that physically flips every disc |
| Mobile pattern | Carousel + tab bar + horizontal swipes | Strictly vertical; touch paints the board while scrolling; tap pings |
| Dependencies | three, R3F, postprocessing, lenis, motion, maath, drei-free | next, react, gsap, zustand, lucide-react, clsx only (no three, no R3F, no drei, no postprocessing, no lenis, no motion, no maath); zero additional libraries |

## 3. Design tokens

### 3.1 Palette (CSS `@theme` tokens; contrast computed, WCAG)

Day (default, `html[data-theme="day"]` or absent):

| Token | Hex | Role | Contrast |
|---|---|---|---|
| `--paper` | `#F3EFE7` | Page, sheet fill, disc "off" face (uniform `uFaceA`), canvas is transparent so this shows between discs | — |
| `--paper-2` | `#E9E4DA` | Sunken cells: facts table, tag cells, menu list, secondary-button hover | — |
| `--line` | `#CFC9BC` | 1 px hairlines, dotted-grid texture, meter outlines (decorative, 1.44:1 by design) | — |
| `--ink` | `#121212` | Text, borders, disc "on" face (`uFaceB`), inverse-video fill | 16.34:1 on paper, 14.79:1 on paper-2 |
| `--ink-2` | `#514D47` | Muted text: labels, annotations, periods, captions | 7.32:1 on paper, 6.62:1 on paper-2 |
| `--ink-3` | `#5F5B52` | Tertiary meta ≥ 12 px (telemetry, EOF-style lines) | 5.90:1 on paper, 5.34:1 on paper-2 (AA everywhere; darkened from the draft's `#6B665F`, which was 4.49:1 on paper-2) |
| `--signal` | `#1F2FD3` | The single accent: link hover/active, focus ring, NOW rule, charged discs, cursor brackets, primary button fill | 7.61:1 on paper, 6.89:1 on paper-2; paper on signal 7.61:1 |
| `--signal-soft` | `#D7DBFF` | `::selection`, hovered departure-board row tint | ink on it 13.80:1 |

Night (`html[data-theme="night"]`, `color-scheme: dark`):

| Token | Hex | Role | Contrast |
|---|---|---|---|
| `--paper` | `#101010` | Page/sheet background, disc "off" face after the flip wave | — |
| `--paper-2` | `#1A1A1A` | Sunken cells | — |
| `--line` | `#2A2A2A` | Hairlines, dotted grid | — |
| `--ink` | `#EDE8DE` | Text, disc "on" face | 15.58:1 on paper, 14.25:1 on paper-2 |
| `--ink-2` | `#B5AFA4` | Muted text | 8.73:1 / 7.98:1 |
| `--ink-3` | `#8E897D` | Tertiary meta | 5.46:1 / 4.99:1 |
| `--signal` | `#7F8BFF` | Accent | 6.38:1 on paper; paper on signal 6.38:1 |
| `--signal-soft` | `#1E2566` | Selection / row tint | ink on it 11.38:1 |

Rules: `--ink-3` never below 12 px; `--line` never carries text; inverse-video hover = paper on ink (16.34:1); the primary button = paper on signal (7.61:1). The `theme-color` meta is `#F3EFE7` / `#101010`.

### 3.2 Typography (Google Fonts via `next/font/google`, verified in next's `font-data.json`)

| Role | Family / loader | Weights / axes | Sizes |
|---|---|---|---|
| Display + body (one family) | `Archivo({ subsets:['latin'], weight:'variable', axes:['wdth'], display:'swap', variable:'--font-archivo', preload:true })` — axes wdth 62–125, wght 100–900, normal only (italic not loaded) | 800 hero name · 700 intro lines, project/company/school names · 500 UI, facts values, buttons · 400 body. Width: hero `font-stretch: 100%` on desktop (animates 112 % → 100 % over 700 ms on first reveal, desktop only), `88 %` on phones so `BHARDWAJ` fits 288 px at 18vw; everything else 100 % | `--t-hero`: `clamp(3rem, 11vw, 10.5rem)` ≥ 64rem, `18vw` below (57.6 px at 320, 77.4 px at 430); line-height 0.88; letter-spacing −0.035em. `--t-3`: `clamp(2.2rem, 1.4rem + 3.6vw, 4.2rem)` lh 1.0 ls −0.02em. `--t-2`: `clamp(1.6rem, 1.25rem + 1.6vw, 2.4rem)` lh 1.1. `--t-1`: `clamp(1.2rem, 1.1rem + 0.5vw, 1.45rem)` lh 1.3. `--t-body`: `1.0625rem/1.6` desktop, `0.96875rem/1.6` (15.5 px) phones < 360 px, 16 px from 360; measure ≤ 64ch. `--t-small`: `0.9rem/1.5`. `text-wrap: balance` on headings, `pretty` on paragraphs |
| Machine type | `Martian_Mono({ subsets:['latin'], weight:'variable', axes:['wdth'], display:'swap', variable:'--font-martian', preload:true })` — axes wdth 75–112.5, wght 100–800 | 700 at `font-stretch: 112.5%` for flap cells, readout, odometer digits · 500 at 100 % for labels (`0.72rem`, uppercase, 0.08em tracking) · 400 at 100 % for captions, tags, telemetry (`0.8rem`) | Flap cell: width `0.72em`, height `1.3em`, 1 px `--line` hinge at 50 %. Cell font sizes: section titles `clamp(1.6rem, 1rem + 3vw, 3.2rem)`; readout `0.8rem`; departure board `1.05rem` desktop / `0.95rem` phone; email flap `1.1rem` desktop / `0.95rem` phone (29 cells × 10.9 px = 317 px → wraps to two flap rows below 352 px viewport width). Numerals are tabular by construction |

Fallbacks: next/font automatic `size-adjust` metrics (`system-ui` for Archivo, `ui-monospace` for Martian Mono) → CLS ≈ 0. Budget: ≤ 200 KB woff2 for both latin variable files; if Archivo's wdth file exceeds 150 KB, replace with two static instances (`wdth 88 / wght 800` and `wdth 100 / wght 400–700`) as two `next/font` declarations (see §13).

### 3.3 Spacing, grid, radii, textures, borders

- **Grid:** 12 columns, sheet content max-width 1280 px centred; gutters 16 px (320–399), 20 px (≥ 25rem), 24 px (≥ 40rem), 40 px (≥ 64rem), 64 px (≥ 80rem). Column gap 24 px desktop / 16 px phone. Baseline 8 px. Sheet vertical padding 64 px desktop / 40 px phone. Section `scroll-margin-top: 72px`.
- **Breakpoints:** base 320, `xs` 25rem, `sm` 40rem, `md` 48rem, `lg` 64rem (desktop layouts, sticky columns, cursor, tape), `xl` 80rem. Pointer capability (`hover: hover and pointer: fine`) gates cursor/hover effects independently of width.
- **Radii:** 0 everywhere (sheets, buttons, cells, dialog, meters). Discs are the only circles.
- **Textures:** sheets carry `background-image: radial-gradient(circle at 50% 50%, var(--line) 0.75px, transparent 0.8px)` at `background-size: var(--pitch) var(--pitch)` with `background-position` synced once by JS to the board's cell origin (default `--pitch: 7px` before JS). Nothing else: no grain, no noise, no gradients.
- **Borders / rules:** sheets have 1 px `--ink` rules top and bottom; header bands and table rows 1 px `--line`; buttons 1 px `--ink` rectangles; NOW cell 2 px `--signal` left rule; focus ring 2 px `--signal` outline, 3 px offset.
- **Board pitch (`--pitch`):** phones (< 48rem) `100vw / 72`; tablets (48–64rem) `100vw / 120`; desktop (≥ 64rem) `clamp(100vw / 192, 5px, 7px)`. Exported to CSS by JS from the measured canvas.
- **Easing / duration tokens:** `--ease-reveal: cubic-bezier(0.16, 1, 0.3, 1)` (expo.out, 600–800 ms); `--ease-wipe: cubic-bezier(0.45, 0, 0.55, 1)` (power2.inOut, 180–420 ms); flap fall `power3.in` 150 ms + settle `back.out(1.8)` 220 ms; odometer `power4.out` 700 ms; micro 120–180 ms; choreographies ≤ 1.2 s; board waves 600–900 ms.

## 4. WebGL / shader architecture

### 4.1 Canvas placement and renderer

- One `<canvas>` inside a `position: fixed; inset: 0; height: 100lvh; z-index: 0; pointer-events: none` wrapper, `aria-hidden="true"`, rendered by a **raw WebGL2 module (no three.js, no R3F, no drei)**. The board is one full-screen triangle, one RGBA8 texture and one fragment shader; a scene graph would add ~170 KB gz for nothing. Context: `getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: true })`.
- **Transparent canvas (jury conflict resolved):** one judge asked for an opaque canvas with a CSS-matched clear colour, another for a transparent canvas. Transparent wins: the only painted pixels are discs, rings and shadows; CSS `--paper` shows between discs, so there is no clear-colour seam to pixel-diff along sheet edges, the off-face colour uniform may differ from CSS by ±1 unit without being visible (the difference hides inside the 6 % ring), and the theme wave is a uniform swap plus the CSS token flip. The compositor blend it costs iOS is one full-screen quad (< 0.3 ms on an A14), less than the shader pass itself.
- Sizing: width = `100vw`, height = `100lvh`; backing store = CSS px × DPR cap (per tier). The canvas is **rebuilt only on orientation change or a > 5 % width/height change** (`visualViewport` resize, debounced 150 ms); the iOS toolbar collapse never resizes it. On rebuild the grid is recomputed and the current composition is re-rasterised into the new grid (θ/ω of surviving cells are carried over by nearest cell; never stretched).

### 4.2 Grid

- `pitch` (CSS px) = phones `vw / 72`, tablets `vw / 120`, desktop `clamp(vw / 192, 5, 7)`; `C = floor(vw / pitch)`, `R = ceil(100lvh / pitch)`. Device pitch `uCellPx = pitch × dpr`. Computed cells: 320×568 → 72×128 (9,216); 390×844 → 72×156 (11,232); 430×932 → 72×157; 768×1024 → 120×160 (19,200); 1024×768 → 192×144 (27,648); 1440×900 → 205×129 (26,445); 1920×1080 → 274×155 (42,470); 2560×1440 → 365×206 (75,190).
- Disc radius `r = 0.44·pitch` (a disc never crosses its cell edge; only its shadow may spill into the three down/right neighbours).

### 4.3 CPU spring simulation (`src/lib/board/sim.ts`) — replaces the GPGPU draft

Typed arrays of length C×R: `theta` (Float32), `omega` (Float32), `target` (Uint8, 0/1), `release` (Float64, ms timestamp; cell frozen until `now ≥ release`), `charge` (Float32), `k` (Float32, `120 + 80·hash(cell)`), `c` (Float32, `2·√k·0.55` → ζ 0.55, ≈ 10 % overshoot, settle ≈ 520 ms). Step (semi-implicit Euler): `ω += (k·(target·π − θ) − c·ω)·dt; θ += ω·dt; charge *= exp(−dt/1.2)`. Fixed step `dt = 1/120` with 2 substeps per 60 Hz frame (high), `1/60` × 1 (mid), `1/30` at 30 Hz (low). `|ω|` clamped to 40 rad/s. A cell is *active* while `|ω| > 0.01 || |target·π − θ| > 0.01 || release > now`; the sim keeps an active count. Target semantics: `target = messageBit XOR themeBit` (see §6 theme). Cost: ≤ 12 flops/cell/substep → 0.3 ms on phones (11 k cells), ≤ 1.5 ms on a 2560-wide desktop (75 k cells).

**Packing / upload:** one `Uint8Array(C·R·4)` → `gl.texSubImage2D` per rendered frame while the sim is dirty: byte0/byte1 = 16-bit `(θ/π + 0.15) / 1.30` (covers overshoot ±15 %), byte2 = `charge·255`, byte3 = `(clamp(ω/40, −1, 1)·0.5 + 0.5)·255`. ≤ 300 KB/frame worst case (2560 wide), 45 KB on phones. No half-float, no render targets, no extension dependency; the Canvas 2D fallback reuses the same class.

### 4.4 Message compositor (`src/lib/board/compositor.ts`)

- One `Uint8Array(C·R)` of message bits composed from layers in priority order: **base** (captured name / echo / blank), **interlude** words, **project windows** (automaton rows), **tape**, **menu labels**, **brush strokes**, **static flips**. Each write carries a `release` offset so sweeps, captures, dissolves and prints are choreographed per cell. A dirty flag per layer triggers recomposition; the sim receives `(cell, bit, release)` writes only for cells whose bit changed.
- **Bitmap font (`bitmap-font.ts`):** hand-authored 5×7 glyphs (6 columns per glyph including spacing): `A–Z 0–9 space . ' - / : + &`; unknown glyphs render as a 5×7 outlined box. Integer scale factor `s` (1 = 7 rows, 2 = 14 rows, 3 = 21 rows). Word-wrap: a line breaks at spaces when its width exceeds `C − 4` columns; lines centre inside their band; a word wider than `C − 4` at scale `s` drops to `s − 1`. Measured widths: `KSHITIJ` 41, `BHARDWAJ` 47, `3 YRS` 29, `2 COMPANIES` 65, `3 PRODUCTS` 59, `17 TOOLS` 47, `B.TECH` 35, `LET'S BUILD` 65, `EXPERIENCE` 59, `KB` 11 columns — all fit C = 72 on one line at scale 1.
- **Raster text (`raster.ts`):** used only when `C ≥ 120`. An `OffscreenCanvas` (feature-detected; hidden `<canvas>` fallback) at **4× cell resolution** draws the string with `ctx.font` taken from the element's computed style (next/font's hashed family name, weight, size), measures `ctx.measureText(line).width`, applies `ctx.scale(domWidth / measured, 1)` so the raster matches the DOM width regardless of `fontStretch` support, then thresholds coverage ≥ 50 % per cell. Baseline from `fontBoundingBoxAscent/Descent`. Rebuilt on `document.fonts.ready`, resize/orientation rebuilds and font swap.
- **Exclusion rects:** the hero's eyebrow, hook, CTA row (and on phones the h1) are measured by a `ResizeObserver` (never per frame) and passed as `uExclusion` (≤ 4 rects + 1-cell feather) to the shader and as a mask to the compositor: inside them no static, brush, interlude or print may write; the shader forces the off face with ring only. The h1 is the only text the machine may touch, and only in capture mode.

### 4.5 Render shader (`src/lib/board/shaders.ts`)

- **Vertex:** full-screen triangle from `gl_VertexID` (no buffers); passes device-pixel coordinates.
- **Uniforms:** `uState` (sampler2D RGBA8 C×R, NEAREST), `uGrid` (C, R), `uCellPx`, `uRes`, `uFaceA`, `uFaceB`, `uSignal`, `uLight` (unit vec3), `uShading`, `uShadow`, `uBlurTaps` (1–3), `uRim`, `uCharge`, `uExclusion[4]` + `uExclusionCount`, `uTime`. Colours are the CSS hex values / 255 and are used in sRGB space directly (stylised discs, no colour management).
- **Per pixel `p`:** `cell = floor(p / uCellPx)`. For the own cell: decode `θ, ω, charge`; for the three neighbours `(−1,0) (0,−1) (−1,−1)` decode `θ` only (their shadows can reach this pixel; their discs cannot, because `r < 0.5·pitch`).
  - Disc: an orthographically flipping disc is an ellipse `rx = r`, `ry = r·|cos θ|` about the cell centre (pivot is the horizontal axis). Normalised distance `d = (length((p − centre) / vec2(rx, ry)) − 1)·min(rx, ry)`; coverage `1 − smoothstep(−0.75, 0.75, d)` in device px (analytic AA; `antialias: false`).
  - Motion blur: coverage averaged over `uBlurTaps` samples at `θ_t = θ − ω·(1/60)·t`, `t ∈ {0, 0.5, 1}` (3 taps high, 2 mid, 1 low), so a flipping disc smears like a real one.
  - Face: `cos θ > 0` → face A (paper) else face B (ink). Normal `n = (0, sin θ, cos θ)` (negated for B). Lambert: face A colour `uFaceA·(0.90 + 0.10·max(n·L, 0))`; face B colour `mix(uFaceB, uSignal, charge)` + Blinn-Phong `0.18·pow(max(n·H, 0), 24)` with `H = normalize(uLight + (0,0,1))` (`uShading`). Rim sliver: when `|cos θ| < 0.15` the colour mixes toward `uFaceB·0.6` by `1 − |cos θ|/0.15` — the dark edge of a disc seen on edge (`uRim`).
  - Off-state ring: face A gets a 1-device-px band inside the edge at `--ink` 6 % alpha and a +4 % white highlight in the upper-left quadrant (`dot(normalize(p − centre), (−0.7, −0.7)) > 0.3 && |q| < 0.6`), so a blank board still reads as a machine.
  - Shadow (`uShadow`): a second ellipse at `centre + (0.18r, 0.30r)·|sin θ|`, same radii, alpha `0.22·|sin θ|·(1 − smoothstep(0, 1.5, d_s))`, composited under the discs; own-cell shadow plus the three neighbours' shadows.
  - Light: `uLight` orbits azimuth 60° over 40 s at 35° elevation; scroll velocity nudges azimuth ±15° (damped τ 0.3 s) so the reflections travel as you scroll.
  - Exclusion: pixels inside `uExclusion` (feathered 1 cell) render face A at rest with ring only.
  - Output: premultiplied `vec4(colour·alpha, alpha)`; blending disabled (single quad), canvas composited by the browser.
- **Scissor draws (`visible-rects.ts`):** the sheets register their rects (document coordinates, cached; refreshed on `document.fonts.ready`, resize/orientation, `ScrollTrigger.refresh`, sheet mount/unmount); windows and the Experience strip register as holes. Per rendered frame: visible rects = viewport − sheets + holes, decomposed into ≤ 8 axis-aligned rects (sheets are full-bleed so the subtraction yields y-bands). Clear the whole canvas (scissor off), then one draw per rect with `gl.scissor`. Zero rects → no draw; the sim ticks only if an interlude or print is within 200 px of the viewport. `?debug=bands` overlays the rects in translucent signal with their sizes.
- **Post-processing chain:** none. AA, motion blur and shading are analytic in the one pass; an effect composer would add a full-resolution copy to a transparent canvas for nothing.

### 4.6 Tiers (columns are a function of width, not tier — the render pass costs per pixel, the sim per cell on the CPU)

| | high | mid | low | 2d | static |
|---|---|---|---|---|---|
| Who | desktop fine pointer with `deviceMemory ≥ 8` & `cores ≥ 6`; phones promoted by the probe (p50 ≤ 12 ms) | desktop default; coarse-only pointers default | `deviceMemory ≤ 3` or `cores ≤ 4`; probe p50 > 20 ms; FrameGuard demotion | no hardware WebGL2 (`failIfMajorPerformanceCaveat`), probe < 30 fps, context lost | reduced motion, calm mode, `saveData` |
| DPR cap | 2 | 1.5 | 1 | 1 (2D) | 1.5 |
| Sim | 120 Hz (2 substeps) | 60 Hz | 30 Hz | 60 Hz, CPU, same class | none (one frame) |
| Blur taps / shadow / specular / rim / charge colour | 3 / on / on / on / on | 2 / on / off / on / on | 1 / off / off / off / off (flat faces, ring only) | ellipses only, no shading | as the host tier's shading, still |
| Brush radius (cells) | 1.6 (1.2 touch) | 1.6 (1.2) | 1.2, no charge | off | off |
| Static (random flips) | ≤ 1.5 %/s at ≥ 1500 px/s scroll; breath ≤ 0.5 %/s | same | half rates | off | off |
| Automaton | prints 1 row / 24 px, hover/tap perturbs | same | 2 rows per step, no perturbation | static SVG pattern | static SVG pattern |
| Flaps | cycling 2–4 glyphs on fine pointers; ≤ 240 concurrent | cycling on fine pointers only; ≤ 240 desktop / ≤ 48 phone | single flap, no cycling; ≤ 48 | single flap | final glyphs, no motion |
| Targets | ≤ 2 ms GPU, ≤ 1.5 ms JS/frame (M-series) | ≤ 3 ms GPU on A14 / Mali-G78, ≤ 0.5 ms JS | ≤ 2 ms | ≤ 8 ms during the capture only | 0 |

Tier detection (client, before any chunk request; cached in `sessionStorage`): `?tier=low|mid|high|2d|static` override → `prefers-reduced-motion` / calm / `saveData` → `static` → WebGL2 probe (`failIfMajorPerformanceCaveat: true`, `MAX_TEXTURE_SIZE ≥ 4096`) fails → `2d` → coarse-only pointer → `mid` → `deviceMemory ≤ 3` or `hardwareConcurrency ≤ 4` → `low` → fine pointer with `deviceMemory ≥ 8` and `cores ≥ 6` → `high`, else `mid`. **Probe:** 90 frames measured during the capture wave; p50 > 20 ms → one step down (DPR first, then shading); < 30 fps → `2d`; phone-mid with p50 ≤ 12 ms → phone-high (one-time promotion). **FrameGuard** (continuous): two consecutive 60-frame windows averaging > 24 ms demote one tier (DPR, then shading, then sim rate), never promote; persisted for the session; catches iOS Low Power Mode and thermal throttling.

### 4.7 Loading strategy

- The board module (`gl.ts` + `sim.ts` + `compositor.ts` + `shaders.ts` + `programme.ts` ≈ 14 KB gz) is a dynamic import requested after hydration at `requestIdleCallback` (timeout 800 ms desktop / 1500 ms phones), only after the WebGL2 probe passes, and on phones only once any scroll gesture has settled (`scrollend` or 250 ms quiet). `canvas2d.ts` (≈ 4 KB) loads instead for `2d`.
- Shader compile + first frame are split across two frames (context + program, then texture + first draw) so no task exceeds 50 ms.
- GSAP (core + ScrollTrigger + SplitText ≈ 47 KB gz) is a second dynamic import at idle; the hero entrance is pure CSS and never waits for it. Flap titles are SSR'd with final glyphs and only animate if the scheduler exists when they enter view.

### 4.8 Pausing rules (energy scheduler, `programme.ts`)

`energy = min(1, energy·0.9 + input)` per frame, input from pointer speed (`px / 200`), `|scrollVelocity| / 3000`, and choreography events (sweep, capture, interlude, print, wave = 1). The rAF loop runs at full rate while `energy > 0.02` or active cells > 0 or releases are pending; then a **breath** phase at 30 Hz for 10 s after the last interaction (≤ 0.5 %/s random flips inside visible rects, none inside exclusions); then the loop **stops** (no rAF, GPU idle, last frame stays). `visibilitychange` hidden → stop immediately (and pause GSAP's global timeline); visible → resume. Menu open → sim continues only for the label spelling. Zero visible rects → no draw.

### 4.9 Context loss and fallbacks

- `webglcontextlost` → `preventDefault`, swap to the 2D fallback on the same sim state without reload; `webglcontextrestored` → rebuild program + texture and resume. One retry; a second loss stays 2D.
- **2D fallback (`canvas2d.ts`):** same sim, `ctx.ellipse` per disc with two flat fills (face A / face B), 1 px ring on face A, no shading; redrawn only while discs move. Scope: entrance sweep + capture/echo + dissolve + menu labels + theme swap. Interludes, static, brush, tape and automaton printing are **off**; project windows show the static SVG automaton (§7.4).
- **Static field (SSR, no JS / before the chunk):** an inline SVG of ≤ 900 `<circle r="0.44">` on a 3 %-density deterministic grid (seeded `mulberry32(fnv1a('signal'))`) in `--ink` at 0.9 opacity behind the hero only, sized by `viewBox` to the hero; removed when the board's first frame renders (200 ms opacity crossfade).

### 4.10 Scroll ↔ board state mapping (exact)

| Scroll region | Base layer | Choreography | Static / brush | Exclusions | Readout |
|---|---|---|---|---|---|
| Hero, `0 → 0.6·heroH` | **Capture mode** (desktop, measured rows ≥ 14, motion full, tier high/mid): rasterised h1 under the DOM h1 (which is at opacity 0 after the crossfade). **Echo mode** (everything else): bitmap name in two lines in the echo band | Dissolve scrubbed by `p = scrollY / (0.6·heroH)` both ways: cell OFF when `release_d < p·780 ms`, `release_d = (1 − d/d_max)·600 + hash·180`, `d` = distance to the readout centre (dots drain toward the readout). In capture mode the DOM h1 returns to opacity 1 (300 ms) when `p ≥ 0.95` scrolling down and back to 0 when `p < 0.5` scrolling up | allowed | eyebrow, hook, CTA row (+ h1 in echo mode) | `00 HOME` → `KB` at `p ≥ 0.9` → `01 ABOUT` when About is active |
| Gap 1 (28vh desktop / 24svh phone) | blank | Interlude `3 YRS` flips in (column release 25 ms, ≤ 750 ms) when the gap centre crosses 65 % of the viewport entering, flips out when it passes 35 %; both directions | allowed | — | — |
| About sheet | hidden (opaque sheet) | — | — | — | `01 ABOUT` at 40 % visibility |
| Gap 2 | blank | `2 COMPANIES` | allowed | — | — |
| Experience sheet | hidden except the 56 px left strip (≥ 64rem) | Tape: dotted column (every other row on) filled to section progress (`scrub: true`), last on-cell blinks at 1.2 s | strip only | — | `02 EXPERIENCE` |
| Gap 3 | blank | `3 PRODUCTS` | allowed | — | — |
| Projects sheet | hidden except three sticky windows | Automaton row `g = floor(progressPx / 24)` prints with column release 3 ms; rows > g clear bottom-up when scrolling back; printing pauses while `|v| > 1200 px/s` and catches up at ≤ 3 rows/frame; hover/tap perturbs the current row and the automaton recomputes forward | windows only (brush = perturb) | — | `03 PROJECTS` |
| Gap 4 | blank | `17 TOOLS` | allowed | — | — |
| Stack sheet | hidden | — | — | — | `04 STACK` |
| Gap 5 | blank | `B.TECH` | allowed | — | — |
| Education sheet | hidden | — | — | — | `05 EDUCATION` |
| Gap 6 | blank | `LET'S BUILD` | allowed | — | — |
| Contact sheet | hidden | — | — | — | `06 CONTACT` |
| Footer sheet + 24vh (18vh phone) of bare board | blank | `Back to top`: diagonal wipe `release = (col + row)/(C + R)·900 ms`, native smooth scroll to top, re-capture on arrival | allowed | — | `00 HOME` |
| Menu open (any scroll) | `main` at `visibility: hidden` after a 200 ms opacity fade → the whole viewport is a visible rect minus the menu sheet | The focused/hovered item's label spelled on the transparent side: desktop rasterised Archivo at 14 rows; phones the two-digit index at scale 3 (21 rows) with the label at scale 1 beneath | off | — | unchanged |
| Theme flip (any scroll) | — | All message bits → 1 with `release = (col + row)/(C + R)·800 + hash·40 ms`; at completion `themeBit` toggles, `uFaceA/uFaceB` swap, CSS tokens transition 200 ms, `color-scheme` + `theme-color` update in the same tick | — | — | unchanged |

Desktop interludes use rasterised Archivo 800 at 14–20 rows (C ≥ 120); phones use the 5×7 font at scale 1 (7 rows) centred in the 24svh gap (min 128 px, max 220 px).

## 5. Entrance choreography (no preloader; the machine's self-test is the entrance; the page is readable at 0 ms)

Timings from first paint; `T` = board ready (typically 500–900 ms desktop, 900–1500 ms phones).

- **0 ms (SSR):** ivory page; readout `00 HOME` (static text in the flap cells); h1 `KSHITIJ / BHARDWAJ` in Archivo 800 — **the LCP element**; eyebrow, hook, CTA row and cue present but held inside clipped line wrappers only when the inline pre-paint script has set `html[data-js="pending"]` (no-JS users see everything); static SVG dot field behind the hero; controls top-right. The pre-paint script also applies `data-theme`, `color-scheme` and `data-motion="calm"` from `localStorage` / `prefers-reduced-motion` before paint.
- **~150 ms:** preloaded fonts apply (`display: swap`, size-adjust fallbacks → CLS 0). Desktop: the h1's `font-stretch` eases 112 % → 100 % over 700 ms expo.out (kinetic width; skipped on coarse pointers).
- **≤ 1600 ms, readout self-test log (real milestones only):** `FONTS 212MS` on `document.fonts.ready` (measured ms), `BOARD 205×129` when the grid is sized, `TIER HIGH` when the tier is final; each a single flap pass (30 ms stagger, ≤ 400 ms); if the queue would overrun 1600 ms intermediate entries are dropped; the readout settles on `00 HOME` by max(1600 ms, sweep end).
- **T + 0, self-test sweep (600 ms):** a one-cell-wide column of on-discs sweeps left→right (`release = col·600/C ms`, each disc flips back 120 ms later); the static SVG field fades out over 200 ms on the first board frame.
- **T + 700, capture or echo (780 ms):** capture mode — discs under the h1's ink flip on with `release = col·700/C + hash·40 ms`; at 60 % of the wave (T + 1140) the DOM h1 crossfades to opacity 0 over 300 ms (it stays in the DOM, readable, selectable). Echo mode — the 5×7 name types into the echo band left→right (column release 12 ms, line 2 starts 200 ms after line 1); the DOM h1 never fades.
- **min(T + 1650, 1800 ms), sub-copy reveal:** eyebrow, hook, CTA row, cue — clipped line reveals 500 ms expo.out, 60 ms stagger; the hero never waits for WebGL beyond 1.8 s.
- **Done ≈ T + 2.4 s.** Scrolling before the capture finishes skips it (the dissolve applies to whatever is on the board). No WebGL → the type simply stays and the static field remains.
- **Calm / reduced motion:** no sweep, no log, no capture; the board renders one still frame — the still echo name (desktop: under the h1, cols 1–7; phone: the echo band) over a 3 % field — fading in over 200 ms when the chunk lands; sub-copy visible immediately; no width easing.

## 6. Navigation (no top bar, no bottom tab bar; identical pattern on every device)

1. **Readout** — fixed top-left (`top: max(12px, env(safe-area-inset-top))`, `left: max(16px, env(safe-area-inset-left))`), a 44 px-tall split-flap display in a 1 px ink border on paper: `[index cells][label cells]` in Martian Mono 700 wdth 112.5 at 0.8rem, e.g. `02 EXPERIENCE` (13 cells ≈ 140 px). It is a `<button aria-haspopup="dialog" aria-expanded aria-controls="board-menu">` labelled "Menu — current section: Experience". It flips when the active section changes (IntersectionObserver, `rootMargin: -40% 0px -60%`, debounced 120 ms; index cells roll, label cells flip with 30 ms stagger). Beneath it a 6-cell dotted progress strip (one DOM disc per section, the current one filled) — the only progress indicator. Feedback messages (`COPIED`, `GOTO 03`, `NIGHT`, `CALM`) flap through it for 1.6 s via an `aria-live="polite"` region, then it returns to the section. In calm/reduced mode the readout swaps text instantly (no flips).
2. **Board Menu** — a native `<dialog id="board-menu">` opened with `showModal()` (free focus trap, Esc, inert backdrop, `overscroll-behavior: contain`), closed by Esc / backdrop / readout / item. Desktop: left 55 % is a paper sheet listing `00 Home`, `01 About` … `06 Contact` (mono index + Archivo 700 `--t-2` label, 64 px rows, inverse-video hover), then `Résumé (PDF) ↗`, `LinkedIn`, `GitHub`, the email, and a footer telemetry line with real values (`205×129 cells · tier high · 60 fps · webgl2`); the right 45 % is transparent and the board spells the hovered/focused item. Phone: top 38svh transparent (board spells the focused index at scale 3 + label), list sheet below with 56 px rows, scrolls internally (`100dvh`). While open, `main` fades to opacity 0 over 200 ms then `visibility: hidden` so the board is visible everywhere the sheet is not. `⌘K` / `Ctrl+K` opens it on desktop with a type-to-filter input at the top (fuzzy subsequence, ≤ 40 lines); the board spells the first match. **Choosing an item (page-turn style):** scroll instantly to the target behind the still-open overlay, wait one frame, restore `main`, then close (items flap down 220 ms / 30 ms stagger, overlay slides up 400 ms expo.in) over the destination and move focus to the section heading (`tabindex="-1"`); `history.replaceState` updates the hash so `/#projects` deep links work on the static export; sections have `scroll-margin-top: 72px`.
3. **Controls** — fixed top-right inside safe areas: **Calm** (44×44, `aria-pressed`, label "Calm mode: stop the board") freezes the board to a still frame, disables every flip/static/brush/wipe and all split-flap motion (same code path as reduced motion), persisted in `localStorage`; **Theme disc** (44×44, one 14 px DOM disc that flips `rotateX 180°` 320 ms back.out(1.6), label "Switch to night" / "Switch to day", `aria-pressed`) launches the diagonal wave (§4.10); keyboard `t` toggles it (announced). Default is day; persisted and applied pre-paint; the board mounts with `themeBit` and face uniforms read from `html[data-theme]`, so the first frame never flips the wrong way.
4. **Keyboard model:** skip link → readout → calm → theme → hero CTAs → sections. Digits `1`/`2`/`3` activate `View projects` / `Email` / `Résumé` while the hero is in view and no input is focused (announced in the readout). No `/` shortcut (Firefox quick-find).

How it differs from v1: there is no persistent horizontal strip and nothing at the bottom edge on phones; orientation comes from a single machine-typed readout plus a full-screen menu the board itself narrates.

## 7. Section-by-section

Common sheet pattern: full-bleed `--paper` panel with 1 px ink rules top/bottom and the dotted grid; inner 12-column container; header band 56 px: `[odometer index][flap h2][annotation (mono, right; hidden < 400 px)]`; intro line (Archivo 700 `--t-2`) from `sections[i].title.join(' ')`; sheet top rule draws `scaleX 0 → 1` (600 ms expo.out) at 85 % viewport, once. Gaps between sheets are `Gap` components (28vh / 24svh) that register their interlude word.

### 7.1 Hero — "The Board" (`profile`, `links`)
- **Content:** eyebrow `profile.eyebrow`; h1 `profile.firstName` / `profile.lastName` (two lines); hook `profile.hook`; CTAs `View projects` (→ `#projects`), `Email` (`mailto:${profile.email}`), `Résumé (PDF) ↗` (`profile.resumePdf`); cue disc; readout and controls (fixed).
- **Desktop (≥ 64rem):** 100svh, board full-bleed. Eyebrow (mono label) at 14svh; h1 spanning all 12 columns from 18svh at `--t-hero` (158 px at 1440 → 15.8 cap rows at pitch 7; 14.8 at 1024/1280; 16.8 at ≥ 1920); bottom row at 88svh: CTA row bottom-left (two 48 px ink-bordered rectangles + the résumé text link, 16 px gaps), hook right-aligned in cols 9–12 (max 36ch) with the cue disc below it. Echo band (fallback modes only) directly under the h1, cols 1–7, 18 rows tall.
- **Phone (320–430):** `min-height: 100svh`, 16 px gutters (20 px ≥ 400). Top to bottom: eyebrow at 14svh (below the 44 px readout); h1 at 18vw, `font-stretch: 88%`, two lines (`BHARDWAJ` ≈ 260 px at 320); 8 px; echo band 18 rows × pitch (80 px at 320, 98 px at 390); 12 px; hook (max 30ch, 15.5 px, ≤ 5 lines); 12 px; CTA grid 2 × 48 px (`View projects` | `Email`); 8 px; `Résumé (PDF) ↗` as a 44 px full-width link row; cue hidden below 600 px viewport height, otherwise 24 px above `env(safe-area-inset-bottom)`. Measured stack at 320×568 = 525 px ≤ 568 (verification item). Every hero text rect is an exclusion rect on phones.
- **Motion:** entrance (§5); dissolve scrubbed 0–60 % both ways; sub-copy fades (opacity 1 → 0, translateY −12 px) over the same range; pointer/finger paints (passive `pointermove` + `touchmove`, `touch-action: pan-y`, no `preventDefault`), tap (< 8 px, < 250 ms) pings a ring (0 → 14 cells over 600 ms, 1.2 cells thick); scroll velocity adds biased static ≤ 1.5 %/s.
- **Hover/micro:** CTAs inverse-video wipe; cue flips every 1.2 s (CSS `rotateX`, static in calm).

### 7.2 About — `01 ABOUT`
- **Content:** interlude `3 YRS` (`stats[0]`); header `sections[0]`; intro `Full stack by trade.`; NOW cell: mono label `profile.now.label`, 2 px signal rule, `profile.nowLine`, link `profile.now.company` → `profile.now.href`; `profile.summary[0]` at `--t-1`, `profile.summary[1]` body; facts 2×2 table (`facts[].label` mono over `facts[].value`, the `Now` value linking to Ethara AI); stats row (`stats[]` value + suffix as odometer, label, caption).
- **Desktop:** cols 1–5 intro + NOW cell; cols 7–12 paragraphs, facts table (1 px `--line` rules, `--paper-2` cells), stats as three ruled cells with 64 px odometer numerals.
- **Phone:** single column: header, intro, NOW cell, paragraphs, facts 1×4 (2×2 from 360 px), stats three across (numerals 2rem).
- **Motion:** flaps flip in (35 ms/cell); odometer rolls `00 → 01` (700 ms power4.out); paragraphs reveal by SplitText lines inside clipped wrappers (translateY 100 % → 0, 700 ms expo.out, 50 ms stagger, ≤ 8 lines, reverted after); stats count by digit rolls; facts rows fade/translate with 40 ms stagger. Hover: rows and the company link inverse-video.

### 7.3 Experience — `02 EXPERIENCE`
- **Content:** interlude `2 COMPANIES` (`stats[1]`); header `sections[1]` with annotation `2 roles · 2023 — present`; intro `Where I have shipped.`; two entries in résumé order (`experience[0]` Ethara AI, `experience[1]` Mind2web LLP): `index`, `company` (link `href`, external), `role`, `location`, `period`, `bullets` as a numbered list (`01 —` mono numerals), `tags` as cells (mono 0.8rem, 1 px `--line`, `--paper-2`, no flap).
- **Desktop:** the sheet is inset 56 px from the viewport's left edge (the exposed strip shows the board tape; DOM labels `2023` top and `2026` bottom in Martian Mono 11 px inside the strip); per entry cols 1–4 sticky (`top: 76px`) with index, company (`--t-2`), role, location, period; cols 5–12 bullets and tags; entries separated by a 1 px rule.
- **Phone:** stacked: period, company (`--t-2`), role · location, bullets, tags wrapping with 8 px gaps inside 44 px rows; the tape becomes an inline SVG dotted rule between entries; no sticky columns.
- **Motion:** company names "stamp" (an ink inverse-video block sweeps left→right over 420 ms power2.inOut and recedes); bullets translateY 12 px → 0 with 40 ms stagger; tag cells fade in (no rotateX flap — flips never touch links or chips); tape fill scrubbed (`scrub: true`).

### 7.4 Projects — `03 PROJECTS`
- **Content:** interlude `3 PRODUCTS` (`stats[2]`); header `sections[2]`, annotation `3 products · 2023 — 2025`; intro `Selected work.`; three printouts from `projects[]`: `index`, `name` (`--t-3`), `period` + `domain` (mono), `blurb` (`--t-1`), `bullets`, `tags` cells, CTA `Visit ${domain} ↗` (`href`, `rel="noopener"`), caption `ELEMENTARY CA · RULE ${rule} · SEED "${name.toUpperCase()}"`.
- **Generative visual (automaton, `ca.ts`):** 1D elementary cellular automaton at window width in cells. Seed row: `mulberry32(fnv1a(name))` sets each cell on with probability 0.08. Rule: `RULES = [110, 90, 30]`, `rule = RULES[fnv1a(tags.join('|')) % 3]`; if an earlier project already took that rule, the next rule in the list is used. Computed for this résumé (all three tag hashes land on index 1): Yot Ecommerce → 90, Remodely → 30, Service Points → 110. Printed one row per 24 px of scroll (column release 3 ms per row). Hover (desktop brush) or tap (phone, ±2 cells) perturbs the current row; later rows are recomputed from it; printed rows stay. **Static SVG version** (calm, reduced, 2d, no-JS): the first 70 generations as `<rect>` cells, server-rendered inside the window at build time (deterministic), ≤ 12 KB each.
- **Desktop:** each printout is a 1 px-ruled frame, min-height 140svh: cols 1–5 the text panel (filled `--paper`), cols 6–12 the window — an unfilled 1 px-bordered 4:3 rectangle, `position: sticky; top: 15vh`, through which the board is visible (registered as a hole; ~100 × 75 cells at pitch 7).
- **Phone:** window first (full width minus gutters, height 42svh, sticky below the readout at `top: 68px`), then the text panel scrolling up over it; CTA full-width 48 px; caption 0.72rem. Three printouts in sequence, vertical only.
- **Motion:** frame translateY 40 px → 0 + top rule draw (600 ms expo.out); name by clipped lines; window border is an SVG rect whose `stroke-dashoffset` draws over 500 ms; leaving a printout flips its window blank bottom-up; tap in a window = ping + perturb.

### 7.5 Stack — `04 STACK` (the departure board)
- **Content:** interlude `17 TOOLS` (`sections[3].annotation`); header `sections[3]`, annotation `17 tools · 5 layers`; intro `Tools I reach for.`; five rows from `skills[]` (`label`, `items`, JavaScript appearing under both Languages and Frontend exactly as on the résumé). **SEEN IN cross-references** computed at build in `derived.ts` by case-insensitive exact match of each item against `experience[].tags` and `projects[].tags`: PHP → Mind2web LLP; Python → Ethara AI; Node.js → Mind2web LLP, Service Points; FastAPI → Ethara AI; Flask → Ethara AI; PostgreSQL → Yot Ecommerce; every other item has none. Nothing is invented — the résumé indexes itself.
- **Desktop:** five rows 56 px tall with 1 px rules: mono index `01–05` far left, group label in flap cells (Martian Mono 700 wdth 112.5 at 1.05rem), items as flap words separated by one empty cell. Hovering/focusing an item with references flips the readout to `SEEN IN · ETHARA AI` (or both entries, alternating every 1.6 s) and the item becomes a link to that entry's anchor; items without references flip the readout to the group (`LANGUAGES · 04 STACK`) and are not links. Hovering a row tints it `--signal-soft` and re-clacks its cells once (20 ms stagger). No empty column anywhere.
- **Phone:** label on its own line; items as **word tiles** (one flap tile per word, not per character) wrapping in a flex row, each ≥ 32 px tall inside 44 px rows; tiles with references get a 1 px signal underline and are 44 px tap targets linking to the entry; `JAVASCRIPT` is one tile so it never breaks mid-word at 320 px.
- **Motion:** rows flip in top→bottom on enter (row stagger 120 ms, cell stagger 28 ms; fine pointers cycle 2–4 random glyphs at 90 ms per flap before landing; coarse pointers and low tier single-flap), rows flipped sequentially so ≤ 48 cells animate at once on phones, ≤ 240 on desktop; total ≤ 1.2 s.

### 7.6 Education — `05 EDUCATION`
- **Content:** interlude `B.TECH` (`facts[2].value` before the comma); header `sections[4]`; intro `Where it started.`; two rows from `education[]`: `school` (Archivo 500 `--t-1`), `degree` + `field`, `period` (mono), `score` + a 25-disc meter: filled = `floor(scoreValue / 4)`, partial disc `ry` scaled by the fractional part → 67.4 % = 16 full + one at 0.85; 64 % = 16 full, no partial. Inline SVG `<ellipse>`s, no board involvement.
- **Desktop:** 12-column table rows: school cols 1–6, degree · field cols 7–9, period + score + meter cols 10–12.
- **Phone:** rows stack; the 25 dots (8 px, 4 px gaps = 296 px) scale to 100 % width via `viewBox`.
- **Motion:** meters flip in on enter (each disc `ry` 4 → 0 → 4 with a fill swap at the midpoint, 240 ms, 40 ms stagger; the partial disc settles with an overshoot); rows fade/translate; calm shows the final state.

### 7.7 Contact — `06 CONTACT`
- **Content:** interlude `LET'S BUILD` (`sections[5].title[0]`); header `sections[5]`; intro `Let's build something.`; the email `profile.email` as a giant flap button (exact mixed case, 29 cells); list rows: Email (`mailto:`), Phone (`profile.phoneHref`, shown as `profile.phone`), LinkedIn (`links.linkedin`), GitHub (`links.github`), Location (`profile.location · profile.timezone` + live local time from `Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })`, updated per minute); primary button `Résumé (PDF) ↗` (`--signal` fill, paper text).
- **Desktop:** cols 1–7 the email flap button (1.1rem cells); cols 8–12 the ruled list (56 px rows with `ArrowUpRight`) and the primary button.
- **Phone:** email flap at 0.95rem cells wrapping into two flap rows below 352 px (never overflows, `overflow-wrap: anywhere` on the sr-only text); list rows 56 px full width; primary button 52 px; safe-area bottom padding.
- **Behaviour:** click copies to the clipboard → cells flip to `COPIED — TAP TO MAIL` for 1.6 s (row by row, ≤ 30 cells at once) then back; a second click within 1.6 s opens `mailto:`; the readout flaps `COPIED` and `aria-live` announces "Email copied". Hovering the email nudges a ring from the pointer on the board behind the sheet's gap above (desktop). Row hover = inverse-video wipe.

### 7.8 Footer
- **Content:** `profile.name · profile.role`; `profile.location · © ${SITE.year}`; links `links.linkedin`, `links.github`, `links.site`, `Back to top ↑`.
- **Desktop:** one 1 px ink rule, a 3-column line; the board visible for 24vh below — the page ends on the machine.
- **Phone:** two rows, 44 px tap targets, `padding-bottom: max(24px, env(safe-area-inset-bottom))`; 18vh of board below.
- **Motion:** `Back to top` → diagonal wipe + native smooth scroll + re-capture on arrival; calm/reduced → instant jump, no wipe.

## 8. Global effects

- **Cursor (fine pointers only, motion full):** a 1-pitch square outline (≈ 7–10 px, 1.5 px ink stroke) whose position is quantised to the board grid (rAF lerp 0.35 then snapped) so it ticks across the page; over `[data-cursor]` targets it becomes four 8 px corner brackets at the target's bounding box (`gsap.quickTo` 200 ms expo.out); ultramarine on `mousedown`; solid ink over `[data-board]` paint areas (it is the brush); hidden on touch, in calm/reduced, over text inputs and when the pointer leaves the window. The native cursor is hidden only by a class added after the cursor mounts and restored on `pointerleave`, so nobody is stranded.
- **Transitions:** single route. Section change = readout flap; menu = page-turn-style close over the destination; theme = disc wave + 200 ms token transition; back-to-top = wipe + re-capture. Nothing fades to black.
- **Scroll behaviour:** **native scroll, no Lenis.** The mechanical, stepped feel wants real scroll; it removes a wheel/touch handler from phones; ScrollTrigger reads native scroll with one listener. Enter triggers fire once at 85 % viewport and never replay; scrubbed items (hero dissolve, interludes, tape, automaton rows, sub-copy fade) run both ways with `scrub: true`; no pinned sections anywhere; sheets never translate more than 40 px; text is never animated behind text — the board narrates only in gaps and windows.
- **Text effects:** split-flap cells (titles, readout, departure board, email, menu feedback) — one reusable `Flap` with `contain: layout paint`, `will-change` only while its timeline runs, aria-hidden cells + visually hidden text; odometer digit columns; SplitText line reveals (reverted after); company stamp; inverse-video wipe (`::before` scaleX 0 → 1 from the left over 180 ms, text to paper at 90 ms, exits to the right). Titles not yet revealed hide their glyphs only under `html[data-js]`, with a 3 s CSS safety timer that reveals them if the scheduler never fires.
- **Board interaction everywhere the board is visible:** brush painting (charge decays over 1.2 s, painted discs flip back after 2.4 s), tap/click ping, scroll static (≤ 1.5 %/s, biased to the scroll direction, flips back after 400 ms), breath ≤ 0.5 %/s for 10 s after the last interaction, then silence.
- **Sound:** none. (No autoplaying audio; no opt-in clack shipped in this version.)
- **Easter eggs:** hero digit accelerators `1`/`2`/`3`; `t` flips the theme; `⌘K` palette with the board spelling the match; tapping a project window perturbs the automaton; the menu footer prints live telemetry; `?debug=bands` shows the scissor rects; `?tier=` forces a budget.

## 9. Accessibility, reduced motion, keyboard

- **Structure:** skip link first; `<header>` holds the readout and controls; `<main id="content">` with one h1 (the SSR name — in capture mode it goes to opacity 0, never `display: none` / `visibility: hidden`, so it stays in the accessibility tree and selectable); one h2 per section (flap cells `aria-hidden`, real label in a visually hidden span, `aria-labelledby` on sections); h3 per entry; real `<ol>/<ul>`; the facts and education tables are real `<table>`s with `scope`; `<nav>` wraps the menu; `<footer>`. The canvas wrapper, static field, meters and decorative SVGs are `aria-hidden` with one visually hidden sentence: "Decorative animation: a flip-dot display that spells the page's own numbers." External links carry `rel="noopener"` and a visually hidden "(opens in new tab)"; icon-only controls have labels.
- **Contrast:** every text pair ≥ 4.5:1 in both themes (§3.1); inverse-video states are paper on ink; body copy never sits over the board (opaque sheets); the hero sub-copy sits over exclusion-protected, at-rest discs whose only marks are a 6 % ring, so the worst-case backing stays within 2 % of paper (ink ≥ 15:1).
- **Focus and keyboard:** `:focus-visible` 2 px `--signal` outline, 3 px offset, on every control, visible over inverted states; the custom cursor never replaces focus; dialog focus trap via `showModal()`, Esc, focus return to the readout; arrow keys / `j` `k` move inside the menu, Enter activates; `t` and digits are additive only and ignored inside inputs; no keyboard traps. Targets ≥ 44 × 44 (readout 44 tall, controls 44, menu rows 56/64, CTAs 48, list rows 56, footer links 44, word tiles inside 44 px rows); `touch-action: manipulation` on controls; `-webkit-tap-highlight-color: transparent` with explicit `:active` (`--paper-2`).
- **Zoom / forced colours:** `user-scalable` allowed; fluid clamps and wrapping flaps survive 200 % text zoom with no horizontal scroll; `forced-colors: active` keeps 1 px `currentColor` borders and shows the h1 at full opacity.
- **Reduced motion / calm (`prefers-reduced-motion: reduce`, the calm toggle, `saveData`; also honoured on runtime change via `matchMedia` listener → the board unmounts to the still frame):** no sim, sweep, capture, static, brush, interludes, tape or automaton printing (windows show the static SVG patterns); the board renders one still frame (3 % field + the still echo name); the h1 stays typographic everywhere; section titles show final glyphs; odometers and meters show final values; sheets appear with a 200 ms opacity fade only; hover is an instant colour inversion; the readout swaps text instantly; theme toggle is an instant token swap; `scrollIntoView` uses `behavior: 'auto'`; cursor native; cue static. It remains beautiful: ivory sheets, hairlines, one ultramarine, the dotted grid and a quiet machine.

## 10. Performance plan

- **Budgets:** main route JS ≤ 120 KB gz (React + Next runtime ≈ 90, app + zustand + 5 lucide icons ≈ 25); GSAP chunk ≤ 50 KB gz at idle; board chunk ≤ 14 KB gz at idle (2D fallback ≤ 4 KB); CSS ≤ 25 KB gz; fonts ≤ 200 KB woff2 (two latin variable files, both preloaded, `display: swap`); 0 images, 0 video, 0 third-party scripts; GPU memory ≤ 0.3 MB (one RGBA8 texture); JS per frame ≤ 1.5 ms desktop / ≤ 0.5 ms phones; GPU per frame ≤ 2 ms desktop high / ≤ 3 ms phone mid (visible rects only; the whole viewport only in the hero and the footer tail).
- **Deferred:** GSAP + ScrollTrigger + SplitText (idle), board module (idle after probe and after scroll settles on phones), cursor (fine pointers, after mount), clock (per minute), menu filter logic (on first open).
- **Never per-frame React state:** ScrollTrigger `onUpdate` writes into a mutable `programme` store read by the loop; pointer handlers are rAF-throttled and passive; sheet rects come from a registry refreshed on events, not per frame; texture upload is one `texSubImage2D` per rendered frame.
- **Lighthouse targets:** mobile ≥ 85 (expected 90–93 real-throttled: LCP = SSR h1 < 1.8 s on simulated 4G, CLS 0, TBT < 150 ms because nothing GPU-related precedes LCP and the board chunk is 14 KB), desktop ≥ 95 (expected 100), accessibility 100, best practices 100, SEO 100. Verified with real throttling and with `?tier=low`, `?tier=mid`, `?tier=2d`, `?tier=static`.
- **Font loading:** `next/font/google` self-hosts both families at build; only the latin subsets; both preloaded (the h1 and the readout are above the fold); automatic size-adjusted fallbacks; the h1's line boxes are reserved so a swap never shifts layout.
- **Static export:** `output: 'export'` under `STATIC_EXPORT=1` (as v1); Cache Components off; `src/app/icon.svg`, `icon.png`, `apple-icon.png`, `opengraph-image.png` + `opengraph-image.alt.txt` are static files (never extensionless generated routes — GitHub Pages serves those as octet-stream); `public/.nojekyll`; `public/Kshitij-Bhardwaj-Resume.pdf`; `robots.ts` / `sitemap.ts` with `force-static`; JSON-LD `Person` as in v1.

## 11. File architecture (`portfolio-signal/`, Next.js 16.4 App Router)

```
next.config.ts                     — reactStrictMode, STATIC_EXPORT → output 'export' + images.unoptimized, Tailwind v4 turbopack rule (copied from v1)
package.json                       — next 16.4, react 19.3, typescript 5, tailwindcss 4 + @tailwindcss/turbopack, gsap 3.15 + @gsap/react 2.1, zustand 5, lucide-react 1.x, clsx 2; nothing else
tsconfig.json / eslint.config.mjs  — as v1
public/.nojekyll                   — keeps _next/ servable on GitHub Pages
public/Kshitij-Bhardwaj-Resume.pdf — the résumé (copied from v1)
scripts/make-icons.mjs             — writes src/app/icon.svg from the KB 5×7 disc bitmap and renders icon.png (32), apple-icon.png (180), opengraph-image.png (1200×630) via playwright-core + system Chrome
scripts/verify/overflow.mjs        — Playwright: 11 viewports × 5 scroll positions, scrollWidth === clientWidth, no element wider than the viewport, hero fit at 320×568, tap-target audit
scripts/verify/bands.mjs           — screenshots with ?debug=bands at 4 scroll positions per viewport
scripts/verify/contrast.mjs        — recomputes every token pair in §3.1 from globals.css and fails under 4.5
scripts/verify/lighthouse.mjs      — mobile (real throttling) + desktop runs for ?tier=low|mid|high|2d|static
src/app/layout.tsx                 — fonts (Archivo, Martian_Mono with axes ['wdth']), metadata, viewport (viewport-fit cover, theme-color), pre-paint inline script (theme, calm, data-js), skip link, Providers, Readout, Controls, BoardMenu, Board, Cursor, JSON-LD
src/app/page.tsx                   — <main id="content">: Hero, Gap, About, Gap, Experience, Gap, Projects, Gap, Stack, Gap, Education, Gap, Contact, Footer
src/app/globals.css                — @theme tokens (day + night via html[data-theme]), fluid type vars, easing tokens, sheet/grid/flap/wipe/odometer/meter utilities, data-js reveal holds + safety timers, reduced-motion + calm rules, forced-colors
src/app/icon.svg · icon.png · apple-icon.png · opengraph-image.png · opengraph-image.alt.txt — static identity files (generated by scripts/make-icons.mjs, committed)
src/app/robots.ts · sitemap.ts     — force-static, as v1
src/data/resume.ts                 — copied verbatim from v1 (the only content source; v1-only fields such as rampIndex/skin/tabs are simply unused)
src/data/derived.ts                — build-time derivations: interlude strings, seenIn map, automaton rules + seeds, dot-meter counts, menu rows, hero CTA list
src/lib/hash.ts                    — fnv1a32, mulberry32
src/lib/tier.ts                    — WebGL2 probe, tier detection, ?tier override, 90-frame probe, FrameGuard, sessionStorage cache
src/lib/theme.ts                   — pre-paint script string, applyTheme (tokens, color-scheme, theme-color meta), persistence
src/lib/gsap.ts                    — lazy loader that registers ScrollTrigger + SplitText once
src/lib/board/types.ts             — Tier, BoardConfig, Rect, Layer, ProgrammeState contracts (owned by phase 0; frozen before parallel work)
src/lib/board/sim.ts               — CPU spring sim (typed arrays, 120/60/30 Hz, release gating, charge decay, active count, RGBA8 packing)
src/lib/board/bitmap-font.ts       — hand-authored 5×7 glyph bitmaps, measure(), layout() with word-wrap and scale
src/lib/board/raster.ts            — DOM-matched text rasterisation at 4× cell resolution, OffscreenCanvas detection, coverage threshold
src/lib/board/compositor.ts        — message layers, priorities, exclusion mask, dirty tracking, (cell, bit, release) write stream to the sim
src/lib/board/ca.ts                — elementary automaton: seed row, rule, step, perturb, static SVG serialiser
src/lib/board/shaders.ts           — vertex + fragment GLSL as template literals (#version 300 es)
src/lib/board/gl.ts                — WebGL2 context, program, RGBA8 texture, uniforms, scissor draws, resize/rebuild, context loss/restore
src/lib/board/canvas2d.ts          — 2D fallback renderer on the shared sim (sweep, capture/echo, dissolve, menu labels, theme swap)
src/lib/board/visible-rects.ts     — sheet/hole registry → ≤ 8 visible rects, refresh triggers, debug overlay data
src/lib/board/programme.ts         — the choreography + energy scheduler: sweep, capture/echo, dissolve scrub, interludes, prints, tape, menu labels, theme wave, wipe, static, brush, ping, rAF loop
src/store/ui.ts                    — zustand: tier, theme, calm, activeSection, menuOpen, boardReady, telemetry, readout message queue (say(message, ttl))
src/components/providers/Providers.tsx — tier detection, calm/reduced listeners, GSAP lazy init, ScrollTrigger refresh wiring, visibilitychange pause
src/components/board/Board.tsx     — mounts the fixed canvas, idle-loads gl.ts or canvas2d.ts, wires programme + visible rects + exclusions, swaps on context loss
src/components/board/StaticField.tsx — SSR inline-SVG 3 % dot field behind the hero
src/components/board/BoardDebug.tsx — ?debug=bands overlay
src/components/nav/Readout.tsx     — split-flap readout button, progress strip, self-test log, aria-live
src/components/nav/BoardMenu.tsx   — native <dialog>, rows, ⌘K filter, telemetry footer, page-turn-style navigation
src/components/nav/Controls.tsx    — calm toggle + theme disc toggle
src/components/nav/SkipLink.tsx    — skip to #content
src/components/flap/Flap.tsx       — one reusable flap cell / word tile (halves, hinge, glyph swap)
src/components/flap/FlapText.tsx   — string → cells or word tiles with the visually hidden real text; pending-glyph hold
src/components/flap/scheduler.ts   — concurrency caps (240/48), row sequencing, 1.5-viewport gating, cycling policy, useGSAP contexts with fromTo + cancel guards
src/components/ui/Odometer.tsx     — digit columns
src/components/ui/Sheet.tsx        — ruled full-bleed sheet; registers its rect; optional left inset + holes
src/components/ui/SheetHeader.tsx  — odometer index + flap h2 + annotation
src/components/ui/Gap.tsx          — interlude gap; registers word + rect
src/components/ui/Window.tsx       — transparent sticky frame; registers a hole; SVG border draw; static automaton child
src/components/ui/Button.tsx       — ink rectangle / primary signal button with the inverse-video wipe and data-cursor
src/components/ui/LinkRow.tsx      — 56 px ruled link row with ArrowUpRight
src/components/ui/Reveal.tsx       — once-in-view wrapper: SplitText lines or translate/fade; reverts after
src/components/ui/Cursor.tsx       — grid-snapped bracket cursor
src/components/ui/DotMeter.tsx     — 25-ellipse SVG meter
src/components/hero/Hero.tsx       — SSR hero DOM, exclusion-rect measurement (ResizeObserver), capture/echo mode decision (measured cap rows), digit accelerators
src/components/hero/HeroCue.tsx    — flipping cue disc
src/components/sections/About.tsx · Experience.tsx · Projects.tsx · Stack.tsx · Education.tsx · Contact.tsx · Footer.tsx — section sheets
src/components/sections/about/FactsTable.tsx · StatsRow.tsx · NowCell.tsx
src/components/sections/experience/Entry.tsx · Tape.tsx (strip labels + phone SVG rule)
src/components/sections/projects/Printout.tsx (text panel + Window + caption)
src/components/sections/stack/DepartureBoard.tsx (rows, word tiles, SEEN IN readout wiring)
src/components/sections/contact/EmailFlap.tsx · ContactRows.tsx · LocalTime.tsx
src/hooks/useActiveSection.ts · useClipboard.ts · useMediaQuery.ts · useOnceInView.ts · useRectRegistry.ts · useMotionMode.ts · useKeyboardShortcuts.ts · useLocalTime.ts
```

## 12. Build order (agent team) and verification matrix

Phase 0 — scaffold (one agent, serial, ~30 min): `package.json`, `next.config.ts`, `tsconfig`, `globals.css` token skeleton, `layout.tsx` with fonts + pre-paint script, `resume.ts` copy, `derived.ts`, `types.ts` (every contract frozen), `store/ui.ts`, `public/` files. Nothing else starts until `types.ts` and `derived.ts` are committed.

Phase 1 — six parallel units, disjoint file ownership:
- **U1 Tokens & chrome:** `globals.css` (full), `theme.ts`, `Controls.tsx`, `SkipLink.tsx`, `Button.tsx`, `LinkRow.tsx`, `Sheet.tsx`, `SheetHeader.tsx`, `Gap.tsx`, `Window.tsx`, `Odometer.tsx`, `DotMeter.tsx`.
- **U2 Board core:** `sim.ts`, `bitmap-font.ts`, `raster.ts`, `compositor.ts`, `ca.ts`, `hash.ts` (+ unit tests for packing, word-wrap, automaton rules = 90/30/110).
- **U3 Board render:** `shaders.ts`, `gl.ts`, `canvas2d.ts`, `visible-rects.ts`, `StaticField.tsx`, `BoardDebug.tsx`, `tier.ts`.
- **U4 Flap system:** `Flap.tsx`, `FlapText.tsx`, `scheduler.ts`, `Reveal.tsx`, `gsap.ts`, `Cursor.tsx`.
- **U5 Sections (SSR DOM only, no motion):** all `sections/**` files, `Hero.tsx`, `HeroCue.tsx`, `page.tsx`.
- **U6 Navigation:** `Readout.tsx`, `BoardMenu.tsx`, `useActiveSection.ts`, `useKeyboardShortcuts.ts`, `useClipboard.ts`, `useLocalTime.ts`, `useMediaQuery.ts`, `useOnceInView.ts`, `useRectRegistry.ts`, `useMotionMode.ts`.

Phase 2 — integration (two agents): **I1** `programme.ts` + `Board.tsx` + `Providers.tsx` (sweep, capture/echo, dissolve, interludes, exclusions, energy loop, context loss); **I2** wires sections to U4 (title flaps, reveals, odometers, stamps, meters, email flap, departure board + SEEN IN readout) and registers sheet rects/holes. The two agents touch no common file (I1 never edits sections; I2 never edits `lib/board/**`).

Phase 3 — polish (parallel): **P1** automaton printing + perturbation + tape (`programme.ts` owner continues); **P2** menu spelling + page-turn navigation + ⌘K + telemetry (`BoardMenu.tsx`, `Readout.tsx`); **P3** theme wave + calm + reduced-motion still frames (`theme.ts`, `Controls.tsx`, `canvas2d.ts` still path); **P4** icons + OG (`scripts/make-icons.mjs`, `src/app/icon.*`).

Phase 4 — verification (one agent runs the matrix; findings go back to file owners). Cut order if the day tightens: Experience tape → automaton perturbation → departure-board glyph cycling → night wave (keep the instant token swap) → readout self-test log.

**Verification matrix:**

| Check | Where | Pass condition |
|---|---|---|
| Overflow | 320×568, 360×740, 375×667, 390×844, 412×915, 430×932, 768×1024, 1024×768, 1280×800, 1440×900, 1920×1080; 5 scroll positions; both themes | `document.scrollingElement.scrollWidth === clientWidth`; no element rect wider than the viewport |
| Hero fit | 320×568 | résumé link bottom ≤ 568 − safe-area; echo name fully inside the band; both h1 lines ≤ 288 px wide |
| Capture rows | 1024×768, 1280×800, 1440×900, 1920×1080 | logged measured cap rows ≥ 14 → capture mode; screenshot before/after the crossfade shows no jump > 1 cell |
| Echo legibility | 320, 360, 390, 430 and reduced-motion desktop | screenshot review: both name lines readable at 7 rows |
| Physical read | 1440×900 high, resting board | screenshot review: rings, shading and shadows visible on flipped discs; not a flat dot grid |
| Bands | `?debug=bands` at hero, mid-About, Projects window, menu open, footer tail | no board rendered under opaque sheets; no gap/window without a rect; rects refresh after fonts and resize |
| Tap targets | all phone viewports | every interactive rect ≥ 44×44 |
| Contrast | `scripts/verify/contrast.mjs` | every token pair in §3.1 ≥ 4.5 |
| Tiers | `?tier=low|mid|high|2d|static` on phone + desktop profiles | correct DPR, shading flags, chunk choice; 2d swaps in on `WEBGL_lose_context` |
| FrameGuard | DevTools 6× CPU throttle | demotion logged within 3 s; never promotes |
| Flap budget | Stack section enter, phone profile | ≤ 48 concurrent animating cells; ≤ 240 desktop; no cycling on coarse pointers |
| Console | every run | zero errors, zero warnings (including hydration and Strict Mode double-mount) |
| Keyboard | desktop | full tab order, dialog trap + Esc + focus return, `t`, digits, ⌘K |
| Screen reader | VoiceOver (macOS + iOS) | name read once; titles read as words, never scrambled; canvas silent |
| Reduced motion / calm | OS setting and toggle | no flips anywhere, still frame present, h1 crisp |
| Theme | both, reload with persisted night | no flash; the first board frame is already flipped; token transition 200 ms |
| Real devices | one iPhone (Safari 17/18), one mid-range Android (Chrome) | toolbar collapse never rebuilds the canvas; rotation keeps the board; painting never blocks scrolling; menu keyboard behaviour |
| Lighthouse | mobile (real throttling) ×5 tiers, desktop | mobile ≥ 85, desktop ≥ 95, a11y 100, BP 100, SEO 100; LCP element is the h1 |
| Static export | `npm run build:static` → `out/` served locally | icons/OG served with image MIME types; `/#projects` deep links; PDF reachable |

## 13. Risks and mitigations

1. **Dot-name legibility on phones** — the typographic h1 never fades on phones; the machine types a 7-row bitmap echo (48 columns for `BHARDWAJ`) beneath it; capture mode is a measured enhancement (≥ 14 cap rows, fine pointer, motion full).
2. **Hero copy over a live board** — exclusion rects (eyebrow, hook, CTAs; the h1 too in echo mode) suppress static, brush and interludes in both the compositor and the shader; verified by screenshot.
3. **Flip churn / motion comfort** — breath ≤ 0.5 %/s for 10 s then silence, scroll static ≤ 1.5 %/s, interludes ≤ 750 ms, automaton exactly one row per 24 px and paused above 1200 px/s, a real calm switch, and reduced motion disables every flip including the readout.
4. **iOS viewport churn** — canvas sized to 100lvh, rebuilt only on orientation or > 5 % change, state re-rasterised rather than stretched, `visualViewport` listener debounced 150 ms; `100svh` for the hero, `100dvh` only inside the dialog.
5. **Visible-rect correctness** — registry refreshed on `fonts.ready`, resize/orientation, `ScrollTrigger.refresh`, sheet mount; `?debug=bands` overlay in the Playwright pass; zero rects skip the draw.
6. **Theme hydration flash / wrong first frame** — pre-paint inline script sets `data-theme` + `color-scheme`; `suppressHydrationWarning` on `<html>`; the board reads `themeBit` and face uniforms from the attribute before its first frame.
7. **Split-flap DOM volume (INP)** — one `Flap` component, caps 240/48, row sequencing, 1.5-viewport gating, `contain: layout paint`, scoped `will-change`, no cycling on coarse pointers or low tier, word tiles on phones.
8. **React Strict Mode double effects (v1 trap)** — every timeline through `useGSAP` contexts with `fromTo` + cancel guards; the programme loop and schedulers are idempotent across remounts; the canvas module keeps a single instance.
9. **Archivo wdth payload** — latin subset only, measured at build; if > 150 KB, two static instances (`wdth 88/wght 800`, `wdth 100/wght 400–700`); kinetic-width easing is desktop-only.
10. **`fontStretch` in Canvas 2D (keyword-only, spotty on Safari)** — the rasteriser draws at wdth 100 and x-scales to the DOM-measured width; sub-cell error is invisible at 5–7 px pitch; OffscreenCanvas feature-detected.
11. **WebGL2 absent / context loss** — `failIfMajorPerformanceCaveat` probe before any chunk; the CPU sim has no extension dependency; `webglcontextlost` swaps to the 2D renderer on the same state; `?tier=2d` tests it.
12. **Seams between canvas and CSS** — transparent canvas: nothing paper-coloured is drawn except disc faces whose edges sit inside a 6 % ring; sheet edges are pure CSS.
13. **Lighthouse mobile** — LCP is the SSR h1; GSAP and the 14 KB board chunk load at idle after the probe and after scroll settles; only two latin font files preloaded; CLS 0 by reserved line boxes and a fixed canvas; measured with real throttling and every `?tier`.
14. **Static-export traps (v1 memory)** — Cache Components off, static icon/OG PNGs in `src/app`, `.nojekyll`, PDF path unchanged, hash deep links via `replaceState`; verified on the served `out/` directory.
15. **Automaton rule collision** — all three tag hashes land on the same rule index; the documented "next free rule" fallback yields 90 / 30 / 110 deterministically; seeds still differ per name.
16. **Accessibility of hidden h1 and aria-hidden cells** — VoiceOver pass confirms the name is announced once and section titles as words; cells are `aria-hidden` and out of the tab order; the dialog traps focus without trapping the virtual cursor.
17. **Verification environment** — SwiftShader starves rAF; Playwright drives the system Chrome with `--use-angle=metal`; real iPhone + Android passes are mandatory, with `?tier=` to force each budget.

---

### Appendix A — Jury must-fix ledger for Signal (every item, where it landed)

| Must-fix | Resolution |
|---|---|
| Idle static ≤ 1 %/s; CA one row per 24 px; interludes ≤ 750 ms; calm switch; reduced motion disables every flip incl. readout | §4.8 (breath ≤ 0.5 %/s, stop after 10 s), §4.10, §6 Controls, §9 |
| Verify dot-name at 320–390; ship the bitmap font first; rasterisation only as an enhancement | §4.4 bitmap font, §5 echo mode, §12 matrix (echo legibility, capture rows) |
| Suppress static/brush under hero copy; h1 the only text the machine touches | §4.4 exclusion rects, §7.1 |
| Visible-band refresh triggers + `?debug=bands` | §4.5, §12 |
| Theme pre-paint script + matching face uniforms/θ mapping | §6 Controls, §4.3 `target = bit XOR themeBit`, risk 6 |
| RGBA8-packed sim path or proven 2D fallback; `?tier=2d` | §4.3 (CPU sim removes the half-float dependency entirely), §4.9 2D scope, §12 tiers row |
| One Flap component, ≤ 240 concurrent, scoped will-change, single flap on low, word-wrap of items | §8 text effects, §7.5, §4.6 |
| Make the high-tier rendering story visible and verify by screenshot | §4.5 (orbiting light with scroll nudge, specular, offset shadow, 3-tap blur, rim sliver, ring/highlight), §12 "Physical read" |
| Raise phone columns to 72–80, tier by DPR/shading, measure cap rows, floor on 5×7 bitmap | §4.2 (C = 72 phones, 120 tablets, 192–365 desktop), §4.6 (tiers never change C), §7.1 |
| Phone flap cap 48, rows sequential ≤ 30, no cycling on coarse pointers, never flip off-screen rows | §4.6, §7.5, `scheduler.ts` |
| Opaque canvas vs transparent canvas (conflicting) | Transparent, justified in §4.1; the seam concern is met by construction |
| Idle breath must stop; passive touchmove painting | §4.8, §7.1 |
| Scope the 2D fallback; preload Archivo latin only; two static instances if > 150 KB | §4.9, §3.2, risk 9 |
| Phone name-capture maths (5–7 rows, not ≥ 10); 5×7 font, C ≥ 56; honest row count | §4.4 (47 columns for BHARDWAJ), §5 echo (7 rows stated), §4.2 |
| Compositor word-wrap; raster only at C ≥ 120; rasterise at 4× and threshold | §4.4 |
| CPU spring sim with one RGBA8 upload; delete GPGPU, packed variant and drei | §4.3, §2 dependencies |
| Transparent canvas with premultiplied alpha | §4.1 |
| Capture rasterisation without `fontStretch`; OffscreenCanvas detection | §4.4 raster, risk 10 |
| Phone hero exclusion rect (eyebrow/hook/CTA) | §4.4, §7.1 |
| Timelines within 1.5 viewports, `contain`, useGSAP + fromTo + cancel guards, idempotent scheduler | §8, risk 8 |
| iOS: visualViewport, 150 ms debounce, > 5 % rebuild, re-rasterise | §4.1, risk 4 |
| Static-export rules verbatim (icons, OG via Playwright, .nojekyll, Cache Components off, PDF path, pre-paint script) | §10, §11 scripts, risk 14 |
| Lighthouse: preload only two latin files; probe before chunk; 1.5 s probe during capture cached; verify with real throttling and `?tier` | §4.6, §4.7, §10, §12 |
| Never fade the DOM h1 under 14 rows; phones keep the crisp h1 with a board underlay | §5 echo mode (phones never fade), §7.1 |
| Email CTA in the hero | §7.1 (`View projects` · `Email` · `Résumé (PDF) ↗`) |
| Scroll static ≤ 1.5 %/s; pause CA above 1200 px/s; real calm control | §4.6, §4.10, §6 |
| Phone departure board: one tile per word; cycling policy; 240 cap enforced by the scheduler | §7.5 (cycling fully off on coarse pointers — the stricter of the two judges' rules) |
| Interlude room on phones | §4.10 (7-row words in 24svh gaps, min 128 px) |
| 100lvh canvas; rebuild only on orientation / > 5 %; rotation keeps state | §4.1, §12 real devices |
| No flip-hover links; no rotateX on tag chips | §7.3, §8 |
| Verify the 320×568 hero fit; eyebrow at ≤ 16svh | §7.1 (eyebrow 14svh, 525 px stack), §12 |

### Appendix B — Grafts adopted from the runners-up

Tag-derived `SEEN IN` cross-references on the departure board (Folio index / Hardcopy column); exclusion-rect legibility well (Murmuration / Hardcopy `uExclusion`); continuous FrameGuard beside the one-shot probe (Meniscus); reduced-motion still frame of the echo name (Folio); ⌘K menu with type-to-filter and a real telemetry row (Hardcopy); `KB` 5×7 bitmap as favicon/OG (Hardcopy); native `<dialog>.showModal()` (Murmuration); page-turn-style navigation behind the open menu (Folio); `theme-color` + `color-scheme` updated in the wave's completion tick and runtime reduced-motion handling (Murmuration); honest self-test milestones in the readout and digit accelerators on the hero CTAs (Hardcopy); the dot-name draining into the readout, which flips to `KB` (Meniscus dock narrative); energy-gated stepping (Meniscus). Declined: the flip-dot world map (coastline data would be an invented asset) and a hero Contents list (the readout's progress strip already shows the page's shape).