# Exploratory testing report — InstantLaTeX

Date: 2026-09-09 · Commit under test: `b0d0b86` (master, clean)
Build: static site served from `public_html/` via `python3 -m http.server 8642`; KaTeX 0.16.9 loaded from jsDelivr CDN (network available).
Driver: headless Google Chrome via puppeteer-core (`harness.js` in this directory, scenario files `j1…j4`). Fresh browser profile per run.
Evidence: screenshots, captured render HTML, and console logs in this directory (`<scenario>-*`).

## Journeys exercised

### Journey 1 — Type TeX → instant render + shareable URL hash (ordinary path + variation)
- Ordinary path: default quadratic renders on load; inserting `\sum_{i=1}^{n} i^2 = \frac{n(n+1)(2n+1)}{6}` updates the preview within the 300 ms debounce and rewrites the URL hash via `replaceState`. Reopening the written URL reproduces the identical render and editor value.
- Variation (correct input): incomplete TeX (`\frac{1}{`) renders a partial/graceful output and the completion renders correctly. **Pass.**
- Evidence: `j1-type-and-hash-3-after-typing.png` (correct render), `j1…-6-reopen-from-hash.png`, `j1…-after-typing-output.html`.

### Journey 2 — Open shared URLs (hash edge cases + navigation)
- Encoded hash, raw (unencoded) TeX hash: both restore editor + render. **Pass.**
- Malformed percent-encoding (`#%zz`): no crash; editor keeps its current value (per code comment). **Pass.**
- Empty fragment / removed fragment: restores the default formula — this is deliberate (issue #3, commit `eb3e133`), so "user clears editor → URL has no hash → recipient sees default" is intended behavior. **Rejected as bug (intended).**
- TeX containing `%` and `\\`: renders, round-trips through the hash (strict-mode warning only). **Pass.**
- Unpaired surrogate in editor: hash write skipped, preview still updates, no crash. **Pass.**
- External `hashchange` (manual URL edit): editor + preview sync. History: app edits use `replaceState` (no history pollution); Back returns to the previous distinct URL and re-syncs via `hashchange`. **Pass.**
- Evidence: `j2-hash-edge-console.log` (numbered observations).

### Journey 3 — Edge inputs and UI surface
- Invalid TeX (`\notacommand`): renders red error text, no crash. **Pass.**
- Multi-line TeX with newline: renders and round-trips through the hash. **Pass.**
- Bracket wrap of a selection: selecting `abc` and typing `(` produces `(abc)` with the selection preserved inside the pair. **Pass.**
- `.pre-made` buttons and `.math-tab`/`.tab-pane` tabs: **0 elements exist in `index.html`**; the handlers in `main.js:160–193` are dead code. Not user-visible — noted as dead code, not a bug.
- Ad `<ins>` fallback: ad slot fills in headless Chrome; DigitalOcean affiliate fallback (`main.js:197–211`) only appends when the ad is empty. Observed, intentional-looking; not a defect.

## Confirmed bug

### BUG-1: Hand-typed closing brackets duplicate; hand-typed formulas fail to render
**Status: CONFIRMED (reproduced 3× across 3 fresh browser sessions). Filed as GitHub issue.**

User impact: any user who types a bracketed expression on the keyboard (e.g. `(x)`, `\sqrt{x}`, `\frac{1}{2}`) gets every `)`, `]`, `}` duplicated, because the auto-pair feature inserts a closing bracket after each opener (`main.js:120–145`) and typing the closer manually inserts a second one — there is no skip-over. The mangled TeX is a KaTeX parse error, so the preview shows the raw source in red instead of the formula (screenshot `j4-repro-dup-closer-2-repro-doubled-paren.png`, `j3b-isolate-8-full-hand-typed.png`). The broken TeX is also written into the shareable URL hash, so the corruption propagates to shared links.

Starting conditions: app at `http://localhost:8642/index.html`, editor emptied (select-all → replace with empty), caret at position 0.

Replay steps:
1. Type `(` → editor shows `()` with caret between the brackets.
2. Type `x` → `(x`.
3. Type `)` → editor shows `(x))` (expected `(x)`).

Observed three times: `(x))`, `(x+y))`, and `\frac{-b\pm\sqrt{b^2-4ac}}{2a}}}}` (hand-typed quadratic) — the last renders as a red error, not math. Related same-root-cause behavior: after auto-pair inserts `{}`, pressing Backspace removes only `{`, leaving an orphan `}`.

## Rejected candidates
- Empty-fragment restore showing the default formula — intended per commit `eb3e133` / issue #3.
- `.pre-made` / `.math-tab` dead code — no user impact (no such elements in the DOM).
- KaTeX `textContent` duplication in captured output — artifact of KaTeX's MathML accessibility markup, not visible to users.

## Unresolved candidates
None.

## Limitations
- Text insertion for most scenarios used `document.execCommand('insertText')` (paste-equivalent; fires `input` without keydown) to bypass the auto-pair feature where it wasn't the subject under test. The confirmed bug was reproduced with real `keyboard.type` keystrokes only.
- Cmd+A / triple-click selection was unreliable in this headless Chrome; cleared editors were prepared via `execCommand` instead. Not an app defect.
- Ads/Google Analytics requests go to the live network; the ad `<ins>` filled in the test environment, so the DigitalOcean affiliate fallback path was only verified by code reading, not observed.
- iframe-embedding (`window.parent` URL targeting) was not exercised — tests ran as a top-level document.