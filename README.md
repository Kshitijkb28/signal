# Signal — Kshitij Bhardwaj, portfolio v2

A one-page portfolio that lives on a flip-dot display. An ivory, typographic page of ruled "sheets" sits over one
electromechanical board (9,000–75,000 discs depending on the screen). The machine captures the typeset name disc by
disc, dissolves it as you scroll, spells the résumé's own numbers between the sheets, prints cellular-automaton artwork
seeded by each project's name inside the project windows, and physically flips every disc when the theme changes.
Nothing is imported for the effects: discs are analytic SDFs in one fragment shader, their motion is a damped-spring
simulation on the CPU, titles are split-flap cells, the favicon is the machine's own 5×7 alphabet.

Every fact on the page comes from `src/data/resume.ts`, which mirrors `public/Kshitij-Bhardwaj-Resume.pdf`.

## Run

```bash
npm install
npm run dev          # http://localhost:3100
npm run build        # production build (Vercel / next start)
npm start            # serves the production build on :3100
npm run build:static # static export to out/ (GitHub Pages); honours NEXT_PUBLIC_BASE_PATH and NEXT_PUBLIC_SITE_URL
```

Quality gate: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build`.

## How it is built

| Layer | Where | Notes |
| --- | --- | --- |
| Page, sections, navigation | `src/app`, `src/components/{hero,sections,nav,ui}` | Next.js 16 App Router, React 19, server-rendered; readable at 0 ms without JavaScript |
| Board core | `src/lib/board/{sim,compositor,bitmap-font,raster,visible-rects,ca}.ts` | Pure TypeScript, unit-tested (`vitest`) |
| Renderers | `src/lib/board/{gl,shaders,canvas2d}.ts` | WebGL2 full-screen-triangle SDF discs, scissored to the visible rects between sheets; Canvas 2D fallback |
| The programme | `src/lib/board/programme.ts` + `programme/*` | Entrance (self-test sweep, capture/echo), dissolve, interludes, prints, tape, menu narration, theme wave, wipe, brush, frame guard, calm |
| Split-flap text | `src/components/flap` | One scheduler with a global flip budget; `aria-hidden` cells plus visually hidden text |
| Tokens and primitives | `src/app/globals.css` | Tailwind v4 CSS-first tokens, day/night themes, reduced-motion rules |

Design spec and decisions: `docs/DESIGN.md`. Build plan and contracts: `docs/PLAN.md`, `docs/PHASE2.md`, `docs/PHASE3.md`.

### Tiers and switches

The board picks a tier from the device (`high`, `mid`, `low`, `2d`) and demotes itself if frames run long. Calm mode
(`prefers-reduced-motion`, the calm toggle, Data Saver) shows a still frame instead of motion. URL switches for testing:
`?tier=high|mid|low|2d|static`, `?debug=bands` (overlay of the rects the board draws into), any `?debug` exposes
`window.__board.stats()`.

## Verification

```bash
npm run verify:overflow    # 11 viewports × 5 stops × 2 themes: no horizontal overflow, hero fit, 44 px tap targets, clean console
npm run verify:bands       # the board draws only between the sheets (uses ?debug=bands)
npm run verify:contrast    # every text/background pair in both themes ≥ 4.5:1
npm run verify:lighthouse  # mobile (devtools throttling) + desktop per tier; run against a production server
```

The scripts drive the system Chrome through `playwright-core` (`/Applications/Google Chrome.app/...` on macOS) because
headless Chromium's software GPU starves `requestAnimationFrame`. Pass a URL to target another server, e.g.
`node scripts/verify/overflow.mjs http://localhost:3101`.

## Deploy

- **Vercel:** import the folder as a project; defaults work (`npm run build`).
- **GitHub Pages:** push to a repository and enable Pages → "GitHub Actions". `.github/workflows/deploy.yml` builds the
  static export with the base path reported by `actions/configure-pages`, so the same workflow serves a user site
  (`<owner>.github.io`) or a project site (`<owner>.github.io/<repo>`).

## Browser support

Evergreen Chrome, Edge, Firefox and Safari 16.4+ (needs `<dialog>`, `100svh`, variable fonts, WebGL2 for the full
board; everything degrades to Canvas 2D, then to a still frame, then to plain HTML).
