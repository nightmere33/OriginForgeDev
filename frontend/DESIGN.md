# OriginForge Design System — "Forge Instrument"

## 0. Research Log

- **Branch:** concrete live reference (getartcraft.com), handled per `clone-from-url.md`. Lazyweb, StyleGallery and imagen drafts are not required for this branch and were not run.
- **Runtime extraction (2026-10-22):** `getComputedStyle` sweep at 1280px and 375px over the nav, hero, buttons, HUD labels, sticky eyebrow, feature cells, rails, ticks and marquee, plus hover/active rules and `@keyframes`. Values below marked *(ref)* come from that sweep. Their colors, logo, footage and copy are **not** used: OriginForge has its own palette, mark, media and words. Their code is under a restrictive license and was not copied.
- **Reference defect noted, not cloned:** their nav renders 485px wide at a 375px viewport (horizontal overflow).
- **Layer A:** `gpt-taste`, read in full. Applied: 2–3 line H1 in wide containers, contrast-safe buttons, gapless dense grids, chapter spacing, an overflow-x guard, and GSAP pin/scrub paradigms. Overridden by the reference contract: index eyebrows stay ("01 / Selected work"), because they are ruler wayfinding with a real label, not cheap "SECTION 01" tags.
- **Layer B:** none. The live reference is the contract. Palette and type pairing were sanity-checked against the promo film's own art direction (molten-orange OF glow on warm black).
- **gpt-taste design plan (seeded RNG):** hero = *Cinematic Center* · fonts = Geist (body/mono), with Archivo Expanded + Instrument Serif kept from the reference · components = Infinite Marquee, Inline Typography Image, Pinned Split · GSAP = Scroll Pinning (Process), Scrubbing Text Reveal (About), plus Image Scale & Fade on work loops.

## 1. Atmosphere & Identity

A precision instrument in a dark forge. Hairline rails, crosshair ticks and mono read-outs make the page feel measured and engineered. Inside that cold frame, molten orange light leaks out of the work itself. Everything arrives choreographed: rules draw, labels settle, words resolve.

**The signature** is the Forge Galaxy: real project films spiral out of a brushed-steel OF mark, blurred and small at the core and sharp at the edge, like sparks thrown off an anvil. Clicking a spark opens that project.

## 2. Color

Dark is the brand default; light is a visitor choice (nav toggle, moon/sun, as on getartcraft.com). Every value is a token in `src/app/globals.css`.

### Light theme (`:root[data-theme="light"]`)
- The steel ramp turns over: surfaces become warm paper (bg #F1EFEA, cell #E9E7E2, raised #FBFAF7, sunken #E6E4DE) and ink becomes graphite (ink #1C1D20, ink-strong #0D0D0F, muted #4A4D53, faint #66696F). The steel gradient therefore turns graphite on its own, so the wordmark and OF mark need no special case.
- Lines go dark (rgba(18,18,20, .12 / .30)). Ember-400, the accent ink, deepens to #C2410C for AA on paper; ember-500 fills stay. Status inks deepen (ok #1D7F50, warn #9A6100, err #C4352B).
- Text on ember fills uses `--on-ember` (#0C0C0D), the same in both themes, never the theme-flipping steel-950.
- Gradients mix into `--bg` (for example the hero's forge glow and copy scrim) instead of hard-coding black, so they work on paper.
- The choice is stored in `localStorage["of:theme"]`; a pre-paint script (`lib/theme-flag.ts`) applies it before first paint. Switching cross-fades through View Transitions (420ms). The galaxy's hairline guides darken on paper (`GalaxyWorld.setLight`).

### Steel ramp (neutrals; slightly cool, to match the logo)
| Token | Hex | Usage |
|---|---|---|
| --steel-50 | #F4F4F6 | ink-strong: headings, wordmark highlight |
| --steel-100 | #E6E7EA | ink: body copy on dark |
| --steel-200 | #C9CBD0 | wordmark mid-stop, secondary icons |
| --steel-300 | #A9ACB3 | muted text (8.6:1 on bg) |
| --steel-400 | #8B8F97 | wordmark low-stop |
| --steel-450 | #7A7E86 | faint text: HUD labels, meta (4.80:1 on bg, 4.59:1 on cell). Never on steel-900 or lighter (4.36:1 fails) |
| --steel-600 | #53565D | disabled text, inactive ticks |
| --steel-800 | #26272B | raised hover surface |
| --steel-900 | #17181A | bg-raised |
| --steel-925 | #121214 | cell surface |
| --steel-950 | #0C0C0D | bg (page) |
| --steel-990 | #060607 | bg-sunken (media wells) |

### Ember ramp (accent; the only hue)
| Token | Hex | Usage |
|---|---|---|
| --ember-200 | #FFD2A8 | spark cores, galaxy hot-spots |
| --ember-300 | #FFB070 | arm gradient tail |
| --ember-400 | #FF8A3D | ember-ink: accent text and links on dark (8.3:1), focus ring |
| --ember-500 | #FF6A1A | brand: primary CTA fill, live dots, glow source |
| --ember-600 | #E8510A | CTA hover fill |
| --ember-700 | #B83C06 | arm gradient head, pressed |
| --ember-900 | #3D1402 | deep glow, forge-mouth radial |

### Gold (review stars only)
| Token | Dark | Light | Usage |
|---|---|---|---|
| --gold-300 | #FFD27A | #E2A531 | highlight |
| --gold-400 | #F5B83D | #C98A0B | star fill, rating bars |
| --gold-600 | #B9800F | #8A5C04 | deep |

Gold appears only in ratings (stars, distribution bars). It is never text, never a CTA.

### Lines (alpha on purpose: hairlines must read over video and frost)
| Token | Value | Usage |
|---|---|---|
| --line | rgba(237,237,239,0.12) | rails, cell dividers *(ref 0.15)* |
| --line-strong | rgba(237,237,239,0.34) | secondary-button border, ticks *(ref 0.40)* |

### Paper (CV print surface only)
The only light surface in the system: the CV sheet, on screen and on A4. Ratios computed on #FAFAF7.
| Token | Hex | Usage |
|---|---|---|
| --paper | #FAFAF7 | sheet background |
| --paper-ink | #121214 | text on paper (17.9:1) |
| --paper-muted | #55585E | secondary text on paper (6.8:1) |
| --paper-line | rgba(18,18,20,0.14) | hairlines on paper |
| --ember-700 | #B83C06 | section markers and links on paper (5.5:1) |

### Status
| Token | Hex | Usage |
|---|---|---|
| --ok | #3FBF7F | paid, delivered, verified |
| --warn | #F2B33D | awaiting deposit, needs clarification |
| --err | #FF5A4E | errors, declined, destructive |

### Rules
- Ember is light, not paint: CTAs, live/status dots, focus, galaxy arms, glows. Body text is never ember. Large ember surfaces appear only as glow.
- No color outside these tables. Lines are the only alpha tokens.

## 3. Typography

Families (self-hosted via `next/font`):
- **Display:** Archivo, variable, `font-stretch: 125%` *(ref uses 118%)*. Wordmark, H1–H3.
- **Accent:** Instrument Serif *italic*. Exactly one contrast phrase per headline.
- **Body + Mono:** Geist and Geist Mono (one superfamily). Body copy, and HUD labels / buttons.
Justification for 3 families: Geist is one superfamily, and the serif is restricted to one phrase per headline.

| Level | Size | Weight | Line height | Tracking | Usage |
|---|---|---|---|---|---|
| Wordmark | clamp(2rem, 8.6vw, 9.5rem) (fits 11 expanded letters inside a 375px screen) | 760 | 0.9 | -0.02em | ORIGINFORGE |
| Mega | clamp(3rem, 1.6rem + 6vw, 6.5rem) | 620 | 0.98 | -0.04em | Final CTA |
| H1 | clamp(1.875rem, 1.5rem + 1vw, 2.25rem) | 620 | 1.05 | -0.03em | hero line *(ref 36/30px)* |
| H2 | clamp(2.25rem, 1.1rem + 3.6vw, 3.75rem) | 620 | 1.02 | -0.035em | section titles *(ref 60/36px)* |
| H3 | 1.5rem | 620 | 1.333 | -0.02em | cell titles *(ref)* |
| Body/lg | 1.125rem | 400 | 1.625 | 0 | leads *(ref)* |
| Body | 1rem | 400 | 1.625 | 0 | default |
| Body/sm | 0.875rem | 400 | 1.5 | 0 | meta, form help |
| HUD | 0.6875rem | 500 | 1.5 | 0.15em, uppercase | labels, nav *(ref)* |
| Button | 0.6875rem | 700 | 1.5 | 0.12em, uppercase | buttons *(ref)* |

Rules: H1 and H2 never exceed 3 lines (wide `max-w` containers). Body text is never below 14px. HUD is the only sub-14px text, and it is always ≥ 4.5:1.

## 4. Spacing & Layout

Base unit 4px. Tailwind's default spacing scale is the token set (`--spacing: 0.25rem`).

| Intent | Value | Source |
|---|---|---|
| Nav height | 48px (`h-12`) | ref |
| Rail max width | 1280px, `border-x` hairline | ref |
| Frame gutter | 24px mobile / 40px md+ (`px-6 md:px-10`) | ref |
| Cell gutter | 24px / 32px (`px-6 md:px-8`) | ref |
| Cell header | 10px vertical (`py-2.5`) | ref |
| Section heading block | 56px / 80px (`py-14 md:py-20`) | ref |
| Chapter gap | `--chapter: clamp(4rem, 3rem + 5vw, 8rem)` above each chapter heading | gpt-taste |
| Sticky eyebrow offset | top 48px (under nav) | ref |

Breakpoints: Tailwind defaults (sm 640, md 768, lg 1024, xl 1280). Grids use `grid-flow-dense` and `minmax(min(…,100%),1fr)` tracks. The page root is `overflow-x: clip`. Nothing may scroll sideways at 375px.

## 5. Components

All components are square-cornered (radius 0, *ref*), hairline-separated and token-driven. Code lives in `src/components/`.

### Button (`ui/button.tsx`)
- **Structure:** `<a>` or `<button>`, `inline-flex h-12 px-6 gap-2`, Button type, optional trailing arrow.
- **Variants:**
  - `primary`: steel-50 fill with steel-950 text *(ref: invert block)*.
  - `ember`: ember-500 fill with steel-950 text (6.8:1; ember-600 hover 5.2:1). Used once per view, for "Start a project".
  - `secondary`: transparent with a line-strong border; hover inverts *(ref)*.
  - `ghost`: HUD text only.
  - Sizes `md` (h-12) and `sm` (h-9, px-4).
- **States:**
  - hover: primary/ember lighten one stop and the arrow nudges 2px right; secondary inverts.
  - active: translateY(1px).
  - focus-visible: 2px ember-400 outline, 2px offset.
  - disabled: 40% opacity, `cursor-not-allowed`.
  - loading: the label blur-swaps to a 3-dot pulse at full color (busy, not unavailable), the width is locked, clicks are swallowed, and `aria-busy`.
- **Motion:** colors 120ms ease-out, transform 240ms `--ease-out`.

### HudLabel (`ui/hud.tsx`)
Mono 11px uppercase with 0.15em tracking. Tones: `muted` (steel-300), `faint` (steel-450), `ink`, `ember`. An optional leading 6px square dot (ember, pulsing only for live status).

### Tick (`ui/tick.tsx`)
An 11×11 crosshair from two 1px pseudo-lines in line-strong *(ref)*. A `half` variant drops the upper stem (it sits on a top rule). Decorative, `aria-hidden`.

### SectionShell + SectionEyebrow (`landing/section-shell.tsx`)
- A full-bleed top rule (`data-draw-rule`), a 1280 rail with `border-x`, and two half-ticks on the rail/rule intersections.
- The eyebrow is a sticky (top 48px) frosted band. Its recipe is `bg-steel-950/60` + `backdrop-blur(12px)` + a hairline top and bottom (*ref*). It holds `index / label` on the left and an annotation on the right (hidden below sm).
- Wayfinding: each shell registers `{id, label}` with the ScrollRuler.

### Cell (`ui/cell.tsx`)
A grid item on a `gap-px bg-line` grid, so the dividers are the gaps.
- **Anatomy:** a header row (HUD label left, index right, bottom hairline, `py-2.5`), a media well (bg-sunken, fixed aspect), and a body (`p-6 md:p-8`, H3 + body muted).
- **Hover** (only when the cell is a link): the media scales 1.03 over 700ms, the arrow tile inverts, and the header label goes to ink.
- **Focus-visible:** an inset 2px ember-400 ring.

### Video delivery (`lib/video.ts`, `scripts/media/build_media.py`)
- Every clip ships twice: H.264 (`-web.mp4`, plays everywhere) and AV1 (`-av1.mp4`), and the AV1 is kept only when it saves at least 10 %. CRFs were tuned so the two files match on SSIM (galaxy 0.968, covers 0.991); the AV1 is then 35 to 55 % smaller.
- Loops are silent, 24 fps, like getartcraft.com's 640×360 galaxy clips. Films keep AAC sound.
- `pickVideo()` chooses per device before anything downloads (MediaCapabilities): phones get AV1 only when it is power-efficient (hardware decoding); desktops also take smooth software AV1; any doubt means H.264. `localStorage["of:codec"]` forces one for testing.
- Media must be served with byte ranges (206) and long cache headers: nginx in production, `common/media_dev.py` under runserver.

### LoopVideo (`media/loop-video.tsx`)
- Muted, `playsInline`, `loop`, `preload="none"`, poster only in the server HTML. As it comes within 40% of a screen of the viewport, it picks its file (see Video delivery), loads and plays; it pauses otherwise.
- Reduced motion: no autoplay, the poster only.
- Always sized by its container's aspect ratio (no CLS).

### ReelPlate (`media/reel-plate.tsx`)
Presents a film on a lit stage: the 9:16 product ads, or the media's own `ratio` (16:9 screen captures). It replaced the phone bezel: the films already contain their own phones and laptops, and a 9:19.5 screen cropped their sides.
- **Plate:** exactly the media's aspect, so nothing is cropped. Hard corners, 1px line-strong border, a faint glass inset edge, crosshair registration ticks on all four corners, and a halo shadow tinted with the project accent.
- **Size:** container units on the stage: `min(84cqw, 86cqh × ratio)` (88cqw for landscape), as large as the cell allows (76cqh when a HUD caption sits below).
- **Stage:** sunken well, an accent radial rising from the floor (blur-3xl), and an ember-900 haze. `shared` puts several plates on one stage, so their glows blend without seams.
- **Motion:** optional `depth` parallax (±48px × depth, scrubbed). On cell hover the plate lifts 6px and its halo widens, over 700ms.
- **Cells:** the work grid is 4:5 on phones and 16:10 from `sm` (the wide motion cell is 5:4, then 21:9), so a film is large enough to read on a phone.

### ForgeVideo (`media/forge-video.tsx`)
Our own video controls, so the browser's never show: no Download item, no picture-in-picture, no casting, no context menu (`controlsList`, `disablePictureInPicture`, `disableRemotePlayback`). Bar: an ember progress line over a buffered line (scaleX per frame, no React re-render), play, mute, `m:ss / m:ss` in HUD, full screen on the frame (so these controls stay; iPhone falls back to the system player, which has no download either). The bar and cursor step aside after 2.2 s of stillness while playing. Keys: Space/K, arrows ±5 s, M, F. Used by FilmPlayer, the showreel and project progress previews. It stops casual saving, not a determined one: media is also hotlink-protected in nginx.

### FilmPlayer (`media/film-player.tsx`)
"Watch the film" (with duration): the full cut with sound in a native `<dialog>` lightbox, which provides Esc, the focus trap and the inert page behind. The backdrop is black at 85% with a blur, and Lenis is paused while it is open. The film is as large as the screen allows at its own aspect: `min(100vw − 2rem, (100svh − 7rem) × ratio, 80rem)`. The file is chosen on mount but not loaded, so the tap calls `play()` synchronously, which iOS needs to allow sound. Two variants: a hairline button (hero links) and a compact ember chip (on a plate or a section bar).

### Case study media
"Main features" (photos) come first, then "In motion" (clips). Each lays out by shape: portrait cards four across (two on phones), landscape screens two across, with an odd last screen spanning the row. Captions are numbered in ember.

### Glitch vocabulary (`motion/glitch.tsx`)
Used where something is chosen or changes meaning, never as idle decoration. `useDecode`/`DecodeText`: text resolves left to right out of random glyphs (360ms) with a red/blue channel split. `tearIn`: a panel or cell tears in (horizontal slices and a skew jitter, 320ms, `steps(10)`, Web Animations API). `useDismiss`: Escape or an outside press closes a popover. Reduced motion turns both effects off.
- **LanguageSwitcher** (`chrome/language-switcher.tsx`): the nav shows EN/FR with a chevron and opens a menu instead of switching on tap. The panel tears in, labels decode in and again on hover. Picking keeps the page and sets the `of_lang` cookie.
- **CurrencySwitcher / CurrencyToggle** (`lib/currency.tsx`): same menu treatment; the nav code decodes when it changes, and every `Price`/`Equivalent` decodes into the new currency (one keyed list in every case, so a switch updates the same text instead of remounting it).
- **Work filter** (`work/work-filter.tsx`): the picked chip decodes and the cells that stay tear back in, 45ms apart.
- **Select** (see Field set) and **CopyHandle** (`ui/copy-handle.tsx`, the Discord username: tapping copies it and the label decodes to "Copied").

- **Price decode** (`DecodeText digits`): amounts flicker through digits only (480ms), so tabular figures never change width; the estimate, its floating notice and every `Range` use it.

### Docked estimate (`start/estimator.tsx`)
Desktop (≥1024px, hover): when the estimate readout scrolls out of view, its figure lifts out into a corner notice (bottom right of the form column, ember hairline, raised surface); scrolling back flies the notice onto the live position of the figure (560ms, quartic out, destination re-read every frame so it lands while the page still moves), scaled by the ratio of font sizes and centred on the same line, then hands over. Exactly one figure is visible at a time. Reduced motion: it appears and disappears in place.

### Reviews (`landing/reviews-section.tsx`, `reviews/stars.tsx`)
- Section: the score (display face, counts up from 0 over 1.4s once seen), gold stars, "From N verified reviews", a 5→1 distribution whose bars grow in sequence, and a note on how reviews are verified; beside it, review cards (stars, quote, Younes's reply under a hairline, initials tile, name · role · project, a green Verified badge) rising one by one. Hidden while there is no approved review. Hairlines are card borders, so nothing shows through a card that waits to reveal.
- `Stars`: one SVG, five polygons; the gold is a bar clipped to the star shapes, so 4.6 fills partially; when first seen it fills left to right and a glint runs across the stars only. `StarInput`: a radio group of five stars (arrows, Home/End), gold follows the pointer, the word for the rating beside it.
- Progressive: the server renders the final state; the client arms (`data-armed`) and plays on sight (`data-seen`).

### Notifications (`chrome/notification-bell.tsx`, `lib/live.tsx`)
A bell in the nav for signed-in visitors: an ember count that decodes when it changes, a panel that tears in (newest first, unread marked by an ember square, relative times), and a toast the moment something arrives over the live socket.

### SecurePayments (`ui/secure-payments.tsx`)
A lock (ok green), "Secured payments." and one sentence, beside the acceptance marks on white plates (Chargily, CIB, Edahabia, Algérie Poste; PayPal and USDT set as type). Full in the footer, compact on the start review step and in the client's payments panel.

### CookieNotice (`chrome/cookie-notice.tsx`)
Only essential cookies exist, so it is a notice, not a consent prompt: bottom left (full width on phones, above the safe area), shown once after the intro, tears in, one "Got it" and a link to the policy.

### Marquee (`landing/marquee.tsx`)
Two identical tracks; the second is `aria-hidden`. Animation is `translateX(-100%)` over 36s linear infinite *(ref)*. Hover pauses it. Reduced motion: static, wraps.

### Field set (`ui/field.tsx`)
- **Select** is a select-only combobox (WAI-ARIA APG), not a native select, so its list can glitch in: the list tears in and options decode (again where the keyboard or pointer lands). Same props as a select (`value`/`defaultValue`/`onChange`, `<option>` children); `name` posts through a hidden input. Keys: arrows, Home/End, Enter/Space, Escape, Tab, type-ahead. The list is `data-lenis-prevent`.
- **Input, Textarea, Select:**
  - 48px height (textarea auto), bg-steel-925, 1px line border, square corners.
  - Label: HUD muted, above the field. Help text: body/sm in faint. Error text: body/sm in err, preceded by a 6px err square.
  - States: hover → line-strong; focus → ember-400 border with an inner 1px ember glow; invalid → err border and `aria-invalid`; disabled → 50% opacity.
- **ChoiceChip:** a checkbox/radio styled as a hairline tile with a HUD label. Checked state: ember-400 border, an ember tick, and steel-50 text.
- **FileDrop:** a dashed line-strong well that shows a row per file (name, size, progress bar, remove).

### StatusPill (`ui/status.tsx`)
HUD text with a 6px square, one tone per lifecycle stage: submitted = steel-300, in review / clarification = warn, proposal = ember-400, accepted / paid = ok, declined = err, withdrawn / archived = steel-600.

### Accordion (`ui/accordion.tsx`)
A `<details>`/`<summary>`-based hairline list (works without JS). The summary is body/lg in ink, with a + icon that rotates 45° on open. The panel enters with height measured by the grid-rows 0fr→1fr trick and a 240ms opacity fade.

### Stepper (`start/stepper.tsx`)
A horizontal HUD index bar (`01 SERVICE — 02 GOALS — …`): the current step is ink with an ember underline, completed steps are muted with ✓ (an icon, not a glyph), and upcoming steps are faint. Step panels cross-fade (opacity + 8px y) over 240ms.

### ScrollRuler (`motion/scroll-ruler.tsx`)
- A right-gutter instrument at md+ with a fine pointer, after getartcraft.com. At rest the ruler is 1:1 with the page: a tick per 1% of the document (medium every 5%, labelled every 10%) sliding past as you scroll, with a needle and a 3-digit % odometer in ember-400 at the scroll progress.
- **Hover zooms out** to the whole page: after 120ms of intent, the scale eases exponentially (τ 100ms; measured on getartcraft.com: 58px to 8.5px tick spacing over ~550ms) until the page fits the rail, and a window (ink 7% fill, 50% hairline top and bottom) shows what is on screen. Leaving zooms back in. One mapping serves both scales: page point `d` sits at `needle + (d - d0) * k`, with `k` easing from 1 to rail/page and `d0` the page point under the needle, so the read-out, section ticks, window and a click always agree. The mapping is shared through `motion/ruler-map.ts`.
- While zoomed out, every section title flies (staggered per letter) to its own section's place on the map at 13px, the current one brighter, and back on leave; the stack frosts fade out meanwhile.
- Section titles (`motion/section-titles.tsx`), letter by letter, after getartcraft.com: titles still ahead queue small (11px display) at the bottom right; the current one is larger (13 to 24px from the gutter width) under the stack; passed ones stack small at the top. Each letter's place is a pure function of the scroll position: smoothstep for position, an early-settling ease for size (letters shrink, then travel), a 4.5% stagger per letter and an 18px arc. On the home page the ORIGINFORGE wordmark hands off: after the intro, its letters are measured and swapped for identical overlay letters, which fly into the stack (the gradient parent is hidden, since `background-clip: text` keeps painting hidden children). A frosted, masked patch backs each stack. Transforms and opacity only; reduced motion changes state without the flight.
- Pressing the rail zooms out at once and glides to that point of the page; dragging scrubs it, the page easing behind the pointer (Lenis lerp 0.12), as on getartcraft.com. The rail is a handle: no text selection, pointer capture during the drag. Shown only for fine pointers at ≥1400px, where a gutter exists beside the 1280 rail; reduced motion snaps between the scales.

### ForgeGalaxy (`landing/forge-galaxy.tsx`)
See Section 6. It has a static poster-mosaic fallback.

### Asset pack (`/studio/kit`, `studio/kit.tsx`)
Every reusable piece below, live, with the file it lives in. New screens are built from these instead of one-offs.
- **DatePicker** (`ui/date-picker.tsx`): the site's date field (never the browser's). A field button with the date written out, a popover that tears in, a Monday-first month grid (selected = ember fill, today = ember dot, before `min` = struck through). Keys follow the WAI-ARIA date picker dialog. The title opens two WheelPickers for month and year; months slide in from the side they come from (`cal-next` / `cal-prev`, 280ms). Posts `YYYY-MM-DD`.
- **WheelPicker** (`ui/wheel-picker.tsx`): a scroll-snap column with a drum effect (rows rotateX and fade with their distance from the middle) and an ember band for the pick. Native scrolling spins it; arrows and Page Up/Down step it.
- **ScrollArea** (`ui/scroll-area.tsx`): any panel that scrolls. The viewport stays a native scroll container; its bar is hidden (`.scroll-bare`) and redrawn as a hairline rail with a 2px steel thumb that widens under the pointer and turns ember while dragged; a click on the rail glides there. Shows while scrolling or hovered. Everything else that scrolls gets a thin steel bar from `globals.css`.
- **Toggle** (`ui/toggle.tsx`): a checkbox with `role="switch"`, drawn as a square track whose knob slides 16px and lights ember.
- **Skeleton / SkeletonRows** (`ui/skeleton.tsx`): placeholders in the shape of what is loading (list rows, a project hub, the dashboard panel), with one sheen sweeping across (static for reduced motion). Text such as "Loading" is never shown alone.
- **StudioTabs** (`studio/studio-tabs.tsx`): section tabs whose ember bar glides from the tab you leave to the one you open.

### Studio dashboard (`/studio/*`, `studio/*.tsx`, API `backend/studio/`)
Overview (KPI cells that decode in, hairline bars that draw out, recent activity), Requests (the inbox), Clients (search, contact links), Payments (receipts to check, due, received), Reviews, Settings (availability, contact, payment details, starting prices; each block saves on its own) and the asset pack. Developer only; settings changes are logged by field name, never by value.

## 6. Motion & Interaction

| Token | Value | Usage |
|---|---|---|
| --dur-micro | 120ms | color/opacity on hover |
| --dur-standard | 240ms | panels, steppers, accordion |
| --dur-emphasis | 900ms | reveals *(ref 0.9s)* |
| --dur-draw | 700ms | section rule draw *(ref)* |
| --ease-out | cubic-bezier(0.16, 1, 0.3, 1) | default UI easing |
| GSAP reveal | `power3.out`, y 28→0, blur 8→0, autoAlpha 0→1, `clearProps` | `[data-reveal]` *(ref)* |
| Tick pop | scale 0→1, 350ms, stagger 60ms | section ticks *(ref)* |
| Marquee | 36s linear infinite | ticker *(ref)* |
| Lenis | lerp 0.12, anchors on | smooth scroll *(ref)* |

**Choreography (master intro, first visit ≈ 2.6s, return visit ×2.2 speed):**
1. At 0s the OF mark ignites (ember bloom → steel).
2. At 0.35s the wordmark letters rise (stagger 40ms).
3. At 0.9s the nav cells drop in and the ruler cascades.
4. At 1.2s the copy stack reveals.
- The wordmark's sheen is a second layer of the letters' own steel fill (clipped to the glyphs): it glides across once on a sine ease (1.8s) while its strength fades in (0.6s) and out (0.7s), so it never pops on or off.
5. At 1.5s galaxy cards roll out from the core.

Any wheel, key, pointer or touch input fast-forwards the intro.

**Scroll paradigms:**
- Section rules draw once on entry.
- `[data-reveal]` cells reveal per-cell. Reveals that start in the same frame (a section scrolling in, a jump to `#services`) cascade in reading order, 0.13s apart (capped at 8 slots), as measured on getartcraft.com (each piece ~0.8s, the next ~0.13s later). Anything already scrolled past settles at once and takes no slot.
- Reveal vars come from `revealFrom()`/`revealTo()` factories, never a shared object: GSAP writes `parent` into the vars a timeline's `.to()` receives, and one shared object once chained every later reveal onto a single timeline, so content appeared 20s late.
- Process: pinned split — the title is pinned while steps advance, and a progress hairline scrubs.
- About: word-by-word scrub, opacity 0.15 → 1.
- Work loops: scale 0.92 → 1 on entry, and dim (a black layer to 65% opacity, never a CSS filter, which would repaint the video every frame) as they leave the top.

**Forge Galaxy mechanics** (after a study of getartcraft.com's hero, its tunings and mechanisms, re-implemented in our own code):
- One R3F canvas, where 1 world unit = 1 CSS px at z=0 (FOV 30).
- **Spiral:** 6 Archimedean arms (r = b·θ), 1.05 turns from the birth radius (8% of the drawn edge) to the drawn edge (70% of the half-diagonal). Cards ride them past the screen edge (120% of the half-diagonal), so there is no exit fade. Phones: 3 arms, 0.7 turns, 80% reach. The system spins at -50°/min; cards stay upright and float with a 6px drift wobble (0.25 Hz).
- **Conveyor:** 0.57 birth-to-edge trips a minute, plus 0.2 trips per 1000px scrolled (reversible). The intro arrives 3x faster and eases to the drift over 2.5s, behind a reveal front sweeping out from the mark.
- **Cards:** 64 at 1.65 CSS megapixels, fewer on smaller screens (about 56 at 1600x900; 14 on phones). Clips and Alquilar/MediGate feature photos (640px copies, never decoded) are dealt one project at a time, so a project's items never sit side by side. Repeats are fine but spaced: a card reborn at the core takes the item shown longest ago, and two visible copies closer than 300px swap the younger one. **Collision-free sizing:** a card's height is the smallest of its journey cap (25% of the viewport height, ramping from 45% to 100% over the journey), 82% of the gap to its nearest neighbour (taken on whichever axis clears, widths counted as 16:9), and what a held neighbour leaves; growth eases, shrinking is instant, so cards never overlap. Newborns are rounded squares that open into their own aspect by 30% of the journey. Blur at birth clears by 18% of the journey. Every card bows 32px toward the camera; corners 10px with a hairline frame; dispersion 0.019 toward the edges; ember heat near the core.
- **Lines:** each arm is a 2px ribbon at 15% with three comets running outward (sharp head, longer tail, +3.5px thicker, 72% at the peak); alternate arms are ember and steel (graphite on paper). 16 ticks on each arm's outer half; a dashed construction circle at 56% of the edge. The comets keep running during a hold.
- **Cursor field (320px):** cards near the pointer drift up to 8px toward it, and their surface bulges up to 200px toward the camera at the point nearest the hand (a Gaussian over 0.6 of the card's size). A dispersion flare picked up near the cursor fades at 3/s behind a sweep.
- **Hold:** the card under the cursor (outermost wins; it keeps the lock within its rect plus a 16px margin) brakes with τ 0.15s while the rest of the spiral, and the spin, follow with τ 1s, so the stop spreads out from the hand; the brake is stored per card, so release resumes in place. The field eases off (τ 0.12s), the held card clears to clean and flat (τ 0.12s: no blur, warp or fringe) and settles on top (τ 0.25s); the rest's wobble swells 1.2x. Clicking (or tapping) a card that isn't under a link or button opens `/work/[slug]`.
- **Decode budget:** at most 8 `<video>` elements playing (3 on phones), the held card first, then the outermost past 14% of the journey; inner cards hold their poster. The canvas pauses when off-screen or the tab is hidden; pointer geometry is measured on resize, never in the frame loop.
- **Fallback:** a static 3-column poster mosaic behind the wordmark. It is used for coarse pointers below lg, `prefers-reduced-motion`, WebGL failure and no-JS.

**Rules:**
- Animate only transform, opacity and filter.
- Every interactive element has hover, active and focus-visible states.
- Reduced motion turns off Lenis, reveals (content is visible), the galaxy, the marquee, the scrubs and the intro.
- Nothing is hidden in SSR HTML: reveals hide content only after JS runs for motion-OK visitors.

### Page changes (`motion/page-transition.tsx`, `chrome/nav-progress.tsx`)
- Every navigation is one view transition (React `<ViewTransition>`, keyed by the path): the page you leave lifts 10px, dims and blurs over 200ms; the next rises 18px from an 8px blur over 520ms, 90ms later. The rest of the document (nav, ruler) switches without a crossfade, so the nav never flickers. In-page updates and Suspense reveals do not animate. Reduced motion: instant.
- A 2px ember line under the top edge shows only when a page takes longer than 120ms: it leaps to 30% on click, crawls toward 92% while the server answers, then fills and fades.

## 7. Depth & Surface

**Strategy: borders-first (hairlines) + tonal shift, with light reserved for meaning.**
- Structure is hairlines. Surfaces separate tonally: bg-sunken (media) < bg (page) < steel-925 (cells, fields) < steel-900 (raised) < steel-800 (hover).
- **No drop shadows on cards.**
- **Light recipes** (the only "shadows"):
  - *Forge mouth* (hero): a radial-gradient ellipse of ember-900 → transparent at the bottom center, plus a steel vignette at the edges.
  - *CTA underglow*: `0 18px 48px -24px` ember-500 at 55% (the ember button and focused key fields only).
  - *Grain*: a fixed SVG fractal-noise overlay at 4% opacity with `mix-blend-mode: overlay` over the whole page, so black never reads as flat.
  - *Brushed steel* (wordmark, OF mark): a 5-stop linear gradient steel-50 → steel-200 → steel-400 → steel-100 → steel-300, plus a 1-time specular sweep during the intro.
  - *Frost* (nav, eyebrows): a 95%/60% steel-950 tint, blur 8–12px, and hairline edges.

## 8. Accessibility Constraints & Accepted Debt

### Constraints
- WCAG 2.2 AA (ratios computed 2026-10-22):
  - Body ≥ 4.5:1 (ink 15.8:1, muted 8.6:1). HUD 11px uses faint (4.80:1 on bg, 4.59:1 on cell) or above; faint never sits on raised surfaces.
  - Visible ember-400 focus on every interactive element. Full keyboard reach, with a skip link to `#main`.
  - `prefers-reduced-motion` honoured per Section 6.
- Landmarks: header/nav/main/footer. One h1 per page. Every form control is labelled and errors are linked with `aria-describedby`.
- Video: decorative loops are `aria-hidden` with a text equivalent nearby. The showreel has controls and its own captions track when available.
- Touch targets ≥ 44px (buttons are 48px).

### Accepted Debt
| Item | Location | Why accepted | Owner / Exit |
|---|---|---|---|
| Galaxy cards are pointer-only shortcuts | Home hero | The same destinations are keyboard-reachable in the 01 / Selected work grid directly below; the canvas is `aria-hidden` | Younes / revisit if analytics show galaxy is a primary path |
| Arabic (RTL) not enabled | Whole site | RTL needs its own motion and layout QA pass; fields and dictionaries already exist | Phase 4 |
| Showreel has no caption track yet | Home showreel | The promo has burned-in captions; a WebVTT track is still to write | Before launch |
| ScrollRuler hidden below 1400px / coarse pointers | Global | It needs a gutter beside the 1280 rail and does not fit touch; native scrollbar remains | Accepted permanently |
| Docked estimate is desktop only | Start, step 3 | On phones the readout sits under the options, a thumb away; a floating card would cover the chips | Revisit with a bottom bar if phones convert worse |
| Videos can still be saved by a determined visitor | Players | Browsers must receive the file to play it; ForgeVideo and hotlink protection stop casual copying only | Accepted; DRM is out of scope |
