# Exploratory testing report — InstantLaTeX (pass 7)

Date: 2026-10-03 · Commit under test: `2f5081e` (master)
Build: static site served from `public_html/` via `tests/support/browser-test-harness.js` on ephemeral `127.0.0.1` port. KaTeX 0.16.9 served from local node_modules via harness intercept.
Driver: headless Google Chrome via puppeteer-core (`run-pass.js` in this directory). Fresh unique Chrome profile under `/tmp` per run, removed after Chrome closed.
Host: macOS.
Evidence: screenshots, JSON observations, and driving scripts in this directory (`exploratory-evidence/2026-10-03/`).

Scope note: following commit `2f5081e` (pinning editor adapter contract and relocating `SimulatedEditorAdapter` to tests) and release v1.1.2, this pass evaluated end-to-end interactive editing ergonomics, delimiter stripping and syntax error containment, URL fragment synchronization and history restoration, and iframe embed behavior.

## Journeys exercised

### Journey 1 — Authoring Math with Bracket Auto-Pairing, Selection Wrapping, Skip-Over, Backspace & Undo
- Goal: Write LaTeX formulas naturally using common editor ergonomics (auto-pairing brackets `()`, `[]`, `{}`), wrapping existing formula tokens in brackets, skipping over closers, backspacing paired brackets, and relying on native browser undo/redo history.
- Ordinary path:
  - Typing `(` inserted `()` with the caret placed between them at index `[1, 1]`.
  - Hand-typing matching closer `)` moved the caret past the closing parenthesis to `[2, 2]` without duplicating `)`.
  - Pressing `Backspace` inside an empty pair `()` deleted both brackets as a single edit, restoring `""`.
  - Nested bracket sequences (`[{}]`) auto-paired cleanly and nested backspaces deleted each enclosing pair in reverse order (`[{}]` -> `[]` -> `""`).
  - Selection wrapping: Highlighting tokens (`x + y`) and typing `{` wrapped the text to `{x + y}` while preserving the selection across the inner token `[1, 6]`. Subsequent wrapping with `(` produced `{(x + y)}` with selection `[2, 7]`.
  - Native undo / redo: Triggering `document.execCommand('undo')` stepped backward cleanly (`{(x + y)}` -> `{x + y}` -> `x + y`), and `redo` restored `{x + y}`.
  - Complex typing: typing `\frac{1}{2} + \sqrt{x^2 + 1}` auto-paired braces and rendered correctly into `.katex-display`.
- Variations & edge cases:
  - Unicode surrogate pairs (e.g. `α + β + 𝛑`): pressing `Backspace` at the end of input cleanly deleted the 2-code-unit surrogate character `𝛑` as a single unit without corrupting UTF-16 representation (confirming fix for #49 remains intact).
  - Modifier chords: `Ctrl`, `Alt`, and `Cmd` chords on bracket keys passed through untouched.
- Status: **Pass.**

### Journey 2 — TeX Delimiter Handling, Environments, Syntax Error Feedback & Offline Fallbacks
- Goal: Immediate, correct mathematical preview across supported delimiter conventions (`$`, `$$`, `\(`, `\[`), complex environments, and robust visual error feedback for incomplete or invalid LaTeX syntax without uncaught exceptions or application crashes.
- Ordinary path:
  - Default quadratic formula `\frac{-b\pm\sqrt{b^2-4ac}}{2a}` rendered immediately into `#math-output .katex-display`.
  - Delimiter stripping confirmed across all supported conventions:
    - Inline dollar: `$E = mc^2$` stripped to `E = mc^2` and rendered.
    - Display dollar: `$$\sum_{i=1}^n i = \frac{n(n+1)}{2}$$` stripped and rendered.
    - LaTeX inline: `\(a^2 + b^2 = c^2\)` stripped and rendered.
    - LaTeX display: `\[\int_0^1 x dx\]` stripped and rendered.
    - Escaped currency dollars inside math: `$\$$` rendered `$`, `$\text{Cost: }\$100$` rendered `Cost: $100`.
    - Delimiters with surrounding and interior whitespace (`  $$  x + y  $$  `) stripped cleanly.
  - Multiline environments: `\begin{matrix} 1 & 2 \\ 3 & 4 \end{matrix}` and `\begin{cases} ... \end{cases}` rendered as structured mathematical blocks.
- Error handling & edge cases:
  - Incomplete syntax: `\frac{1}{2` rendered a visible `.katex-error` element in `#math-output` rather than throwing an unhandled exception or leaving stale output.
  - Bare backslash `\` rendered empty string without parse error, keeping the preview clean while typing command prefixes.
  - Space after backslash `\ ` rendered space macro cleanly.
  - Comments (`% comment`) were handled cleanly.
  - Extreme nesting (`\sqrt{` repeated 60 times, or `{` repeated 2,000 times): safely caught by `MathRenderer`'s RangeError containment, rendering visible failure feedback without halting the application.
  - Ad fallback: with AdSense blocked or offline, `main.js` correctly detected empty `<ins>` tags on `load` and inserted the fallback DigitalOcean referral anchor link into `.ad-container`.
- Status: **Pass.**

### Journey 3 — URL Hash Synchronization, State Recovery, Sharing & Embed Lifecycle
- Goal: Share and bookmark formulas via the URL hash fragment, restore state on direct load and navigation, and support embedding without state corruption.
- Ordinary path:
  - Typing in `#maths-editor` debounced by 300 ms and synchronized the encoded formula to `window.location.hash` (`#%5Cint_0%5E1...`) using `history.replaceState` without polluting session history.
  - Direct URL loading: Opening a new tab with `#\int_0^1 x^2 dx = \frac{1}{3}` restored the formula into both `#maths-editor` and `#math-output`.
  - Special character round-trips: Formulas with `#`, `%`, `&`, `+`, `/`, `?`, `=`, spaces, and newlines round-tripped through `encodeURIComponent` / `decodeURIComponent` with exact value parity.
  - History traversal: Pushing history state and navigating with `page.goBack()` updated the editor and preview via the `hashchange` listener.
- Variations & edge cases:
  - Malformed URL fragment: loading `#%E0%A4%A` caught the URIError silently, preserving the initial formula and keeping event listeners bound.
  - Empty URL hash `#`: preserved the default quadratic formula rather than wiping the editor (confirming fix for #3).
  - Cross-origin iframe embed: typing in the editor updated the iframe's internal fragment and did not navigate or mutate the host page (confirming fix for #20).
  - Same-origin iframe embed: typing in the editor updated the host page URL fragment for shareability.
- Status: **Pass.**

---

## Confirmed bugs

No new bugs were confirmed in this pass. All explored journeys met grounded design expectations.

---

## Reproduced, already open

### 1. #36 — Large formulas freeze the page: KaTeX render is superlinear and re-runs on the main thread after every typing pause
- **Status: REPRODUCED (open, marked `ready-for-human`).**
- **Observations**: Re-tested synchronous main-thread rendering overhead. Inputs with 10,000 `a+` pairs (~20 KB) blocked the browser main thread for 1,023 ms synchronously on every typing pause. As documented in #36, moving rendering to a Web Worker or enforcing a size threshold remains required to maintain editor interactivity for large pasted expressions.

### 2. #37 — Same-origin host hash navigation (anchor links) wipes the embedded editor mid-typing
- **Status: REPRODUCED (open, marked `ready-for-human`).**
- **Observations**: In a same-origin host page embedding `index.html`, clicking any host anchor link (e.g. `<a href="#section2">`) triggers a `hashchange` event on `parent`. `main.js:updateFromHash` unconditionally treats the host hash as an InstantLaTeX formula, wiping the embedded editor's text mid-typing. As noted in #37 and #41, disambiguating app-owned hash changes from host page anchor navigation requires an intentional architectural decision.

---

## Evidence files

- Driving script: `exploratory-evidence/2026-10-03/run-pass.js`
- Test observations: `exploratory-evidence/2026-10-03/run-results.json`
- Screenshots:
  - `exploratory-evidence/2026-10-03/j1-01-initial-state.png`
  - `exploratory-evidence/2026-10-03/j1-02-typed-formula.png`
  - `exploratory-evidence/2026-10-03/j2-01-delimiter-and-ad.png`
  - `exploratory-evidence/2026-10-03/j3-01-reloaded-from-hash.png`
