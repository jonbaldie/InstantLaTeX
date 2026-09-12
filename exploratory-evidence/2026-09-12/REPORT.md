# Exploratory testing report — InstantLaTeX (pass 3)

Date: 2026-09-12 · Commit under test: `eab08cb` (master, clean)
Build: static site served from `public_html/` via Node `http.createServer` on an ephemeral `127.0.0.1` port. KaTeX 0.16.9 loaded from jsDelivr CDN (network available). Ads/analytics not blocked (ordinary user configuration).
Driver: headless Google Chrome via puppeteer-core (`drive.js`, `follow.js`, `repro-wide.js`, `confirm.js` in this directory). Fresh unique Chrome profile under `/tmp` per run, removed after Chrome closed.
Host: macOS with `prefers-color-scheme: dark` (ordinary on this machine).
Evidence: screenshots and JSON observations in this directory.

Scope note: prior passes covered hash round-trip, auto-pair (#14/#15/#16), cross-origin embed (#20), phone editor crush (#30), and dollar-delimited TeX (#29). This pass targeted STEM formula preview (matrix/align/cases), dark mode, paste-and-share, and overflow after the #26 wide-formula fix.

## Journeys exercised

### Journey 1 — Preview a real STEM formula and share it

Goal: type or insert a matrix / aligned system / cases / integral, see it rendered, copy the URL, reopen and get the same formula.

- Ordinary path: `\begin{pmatrix} a & b \\ c & d \end{pmatrix}` renders, hash updates via `replaceState` (history length stays 2), reopening the written hash restores editor + render. `\begin{align}`, `\begin{cases}`, `\int`, `\begin{equation}`, `\begin{align*}`, `\begin{gather}`, `\begin{CD}` all render. **Pass.**
- Variation (correct a typo): `\end{pmatrx}` shows a red KaTeX mismatch error; fixing to `pmatrix` restores the matrix. **Pass.**
- Nested auto-pair via real keystrokes: typed `((x+y))` and `\frac{1}{2}` produce exactly those strings and render. **Pass.**
- Tall 16-row `align` still fitted this 800px window; a 40-row `align` did not — **see BUG-3.**
- Evidence: `j1-2-matrix.png`, `j1-3-reopen-matrix.png`, `j1-4-align.png`, `j1-5-cases.png`, `j1-8-integral.png`, `j1-9-typo.png`, `follow-H-frac.png`.

### Journey 2 — Use the editor in dark mode

Goal: math is readable against the dark theme the CSS advertises via `prefers-color-scheme`.

- Ordinary path: default quadratic is `rgb(204,204,204)` on `rgb(30,30,30)` (contrast ~10.4:1). Editor ~11.2:1. Switching emulate `light` then back to `dark` restyles correctly. **Pass.**
- Variation: `\textcolor{red}{x} + \color{blue}{y} + z` renders with those colours on the dark ground. A parse error (`\end{pmatrx}`) is red and readable. **Pass.**
- Dead `mjx-container` rule (MathJax leftover after the KaTeX swap) is unused; KaTeX inherits `#math-output` colour. Not user-visible.
- Evidence: `j2-1-dark-default.png`, `j2-3-dark-color.png`, `j2-4-light.png`.

### Journey 3 — Paste a formula, correct it, share it

Goal: paste delimiter-free TeX over the default, see preview, reopen from the written hash.

- Ordinary path: pasted `\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}` renders; hash round-trip restores it. `%` comments, newlines, unicode `∑_{i=1}^{n} i`, `file://` load + hash write all work. HTML `<img onerror>` is escaped as math text (no DOM injection). `\href{javascript:alert(1)}{x}` is not trusted. Query string `?ref=test` survives hash updates. **Pass.**
- Variation: empty editor writes `index.html#` and shows a blank preview (intended empty-fragment behaviour, #3). Paste of `$x^2$` is still #29 (already filed). Viewport 767×800 crushes the editor to 78px — same failure as #30, also at the 767px breakpoint (commented on #30).
- Evidence: `j3-1-paste.png`, `j3-2-percent.png`, `j3-7-file-protocol.png`, `j3-8-767.png`.

## Confirmed bug

### BUG-3: Wide or tall formulas overflow the page; scrolling to read them moves the editor off-screen

**Status: CONFIRMED (3× wide, 3× tall, plus polynomial). Filed as GitHub issue #31.**

User impact: a long polynomial or a multi-line `align` makes the **window** scroll. Using that scrollbar hides the editor and header. The preview pane's own `scrollMax` is 0 for tall formulas, so window scroll is the only way to see the bottom — and it takes the editor with it.

Starting conditions: app at `http://127.0.0.1:<port>/index.html`, viewport 1280×800, commit `eab08cb`.

Replay steps (wide):

1. Replace the editor with `\text{START}` + ` + a` × 80 + ` + \text{END}` (the #26 formula).
2. At rest: formula START is visible in the preview (`leftGap = 0`, the #26 fix holds). `document.documentElement.scrollWidth - innerWidth = 1100`.
3. `window.scrollTo(document.documentElement.scrollWidth, 0)` — the control a user uses with the browser scrollbar.

Expected: the preview pane scrolls; editor and header stay put.
Actual: `editorLeft = -1100`, `editorOnScreen = false`, header off-screen. Screenshots `confirm-wide-0-pagescroll.png`, `confirm-poly-pagescroll.png`.

Replay steps (tall):

1. Replace the editor with a 40-row `align`.
2. `#math-output` / `.output-pane` / `.split-pane` all have `scrollHeight === clientHeight`. Last rows sit at `mathBottom ≈ 1577` vs `innerHeight 800`.
3. Scrolling those panes does nothing. Window `scrollY` to the end shows `x_{39}` and moves `editorTop` to `-1114`.

`#math-output.scrollLeft = scrollWidth` still reaches END (end gap ≈ padding). That inner scrollbar is easy to miss next to the window scrollbar.

Distinct from #26: #26 was “start clipped inside the preview and unscrollable there.” After #26 the start is visible and `#math-output` can scroll; the **document** still grows, and scrolling the document destroys the IDE layout.

## Already-filed (reproduced, not re-filed)

- **#29** — typed `$x^2$` → `Can't use function '$' in math mode`. `follow-F-dollar.png`.
- **#30** — editor height 78px at 375×667 and also at 767×800 (`j3-8-767.png`). Commented on #30.

## Rejected candidates

- Empty fragment restoring the default quadratic — intended (#3).
- Select-all then type `(` wrapping the default in parens — auto-pair wrap-selection, consistent with the existing bracket feature.
- `\notacommand` rendering as `\not` + `acommand` — `\not` is a real KaTeX command, not an InstantLaTeX defect.
- `\begin{multline}` / `\ce{H2O}` — KaTeX does not implement those; the product is a KaTeX previewer.
- Dead `.pre-made` / `.math-tab` handlers — no matching DOM, no user impact.
- favicon.ico 404 — console noise only.
- XSS via hash HTML / `\href{javascript:…}` — escaped / untrusted.

## Unresolved candidates

- First-paint flash of the default quadratic on a shared hash URL — observed only with `main.js` artificially delayed 1.5 s (`fouc-before-js.png`). Ordinary same-origin `main.js` is tiny; not confirmed at normal speed.
- Ad-fallback `ins.children.length === 0` race — not reproduced under ordinary load.
- Native Cmd+Z in headed Chrome / real mobile Safari visual viewport.

## Usability observations (not filed)

- Tab moves focus from the editor to the footer link (native textarea). No indent in the TeX source.
- No print stylesheet; ads stay `display: block` under `emulateMediaType('print')`.
- Dark-mode CSS still targets `mjx-container` (MathJax); harmless because KaTeX inherits.

## Limitations

- Headless Chrome; profiles unique under `/tmp` and deleted after close.
- macOS host already in dark mode, so Journey 1 also ran dark without emulation.
- Ads/analytics hit the live network; AdSense 400s in this environment (same as pass 2).
- Text insertion used `execCommand('insertText')` except where auto-pair was the subject (`keyboard.type` for nested parens, `\frac{1}{2}`, `$x^2$`).
- Inner `#math-output` scroll for wide formulas works; the filed bug is the extra *document* scrollbar and what it does to the editor.
