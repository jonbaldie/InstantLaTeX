# Exploratory testing report — InstantLaTeX (pass 6)

Date: 2026-09-30 · Commit under test: `059fe09` (master)
Build: static site served from `public_html/` via `tests/support/browser-test-harness.js` on an ephemeral `127.0.0.1` port. KaTeX 0.16.9 served from local node_modules via harness intercept.
Driver: headless Google Chrome via puppeteer-core (`repro-auto-render.js` in this directory). Fresh unique Chrome profile under `/tmp` per run, removed after Chrome closed.
Host: macOS.
Evidence: screenshots, JSON observations, and driving scripts in this directory (`exploratory-evidence/2026-09-30/`).

Scope note: following release v1.1.1 and the deepening of the math rendering pipeline into `MathRenderer` (PR #54), this pass evaluated delimiter stripping, offline and network degradation resilience, bracket pairing interactions, and page lifecycle bootstrap.

## Journeys exercised

### Journey 1 — MathRenderer Pipeline & Delimiter Stripping (Metamorphic & Differential)
- Ordinary path: Verified delimiter stripping across all supported forms (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`, surrounding/interior whitespace, escaped currency dollars like `$\$$`, `$100\$$`, `$$\text{Cost: }\$100$$`). 5,000 metamorphic round-trip fuzz cycles passed with 0 failures.
- Ordinary path: Empty strings, bare backslashes, percent comments, and multi-line aligned equations strip or preserve delimiters cleanly. **Pass.**

### Journey 2 — BracketPairController & Stateful Keystroke Sequences
- Ordinary path: Hand-typed matching closers skip over without duplication. Empty auto-paired brackets delete as a unit on Backspace. Text selections wrap with brackets and preserve selection range. Modifiers (`Ctrl`, `Alt`, `Cmd`) are ignored.
- Edge cases: Surrogate pairs (`𝛑`) at the end of input or in the middle delete cleanly with Backspace. 6,000 property-based fuzz cycles passed with 0 failures. **Pass.**

### Journey 3 — Network Degradation, Offline Fallback & Script Dependencies
- Goal: Verify application behavior when CDN assets fail to load or are blocked by privacy extensions, corporate firewalls, or offline environments.
- Finding: `MathRenderer` handles missing KaTeX gracefully (`if (!engine) node.textContent = "$$" + tex + "$$"`), but `public_html/index.html` unconditionally calls `renderMathInElement(document.body, ...)` in its inline `DOMContentLoaded` listener. When `auto-render.min.js` fails to load, `renderMathInElement` is undefined, throwing an unhandled `ReferenceError: renderMathInElement is not defined` on page initialization. Furthermore, `auto-render.min.js` is completely unused: there is no static math in `index.html` (math is rendered dynamically via `MathRenderer.render`). **See BUG-6.**

---

## Confirmed bug

### BUG-6: index.html throws uncaught ReferenceError on DOMContentLoaded when KaTeX auto-render script fails to load

**Status: CONFIRMED (3/3 blocked runs, 3/3 offline runs).**

- **User impact**:
  1. Uncaught exception on page load: When the network is offline, CDN is unavailable, or scripts from `cdn.jsdelivr.net` are blocked (e.g. by content/privacy blockers, tracking protection, or corporate networks), visiting `index.html` immediately throws `Uncaught ReferenceError: renderMathInElement is not defined`.
  2. Subverts offline / engine-fallback design: `MathRenderer` (`public_html/math-renderer.js`) explicitly implemented and tested fallback handling when KaTeX is unavailable (`renderer-unavailable`), displaying `$$<formula>$$` in `#math-output`. However, the page still encounters an unhandled runtime error on initialization because of the unguarded `renderMathInElement` call.
  3. Redundant network request & performance overhead: `contrib/auto-render.min.js` is fetched over CDN despite being completely unused: the page contains no static math in `document.body` (all rendering is performed dynamically on `#maths-editor` via `MathRenderer.render`).

- **Starting conditions**: App served from `public_html/index.html`, commit `059fe09`. Clean headless Chrome session.

- **Replay steps**:
  1. Open `index.html` in an environment where `https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js` fails to load (e.g. offline or request aborted).
  2. Wait for `DOMContentLoaded`.
  3. Observe console/page errors.

- **Expected vs Actual**:
  - Expected: The application initializes without uncaught exceptions, and falls back to plain text display if KaTeX is unavailable.
  - Actual: An uncaught `ReferenceError: renderMathInElement is not defined` is thrown on `DOMContentLoaded`.

- **Repeat observations**:
  Reproduced 3/3 across fresh headless Chrome sessions (puppeteer-core, isolated Chrome profile under `/tmp` per run):
  - Blocked auto-render: 3/3 runs threw `renderMathInElement is not defined`.
  - Offline CDN: 3/3 runs threw `renderMathInElement is not defined` while `MathRenderer` successfully rendered fallback `$$\frac{-b\pm\sqrt{b^2-4ac}}{2a}$$`.
  - Control online: 0 errors.

- **Root cause area**:
  In `public_html/index.html:12-24`:
  ```html
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
  <script>
      document.addEventListener("DOMContentLoaded", function() {
          renderMathInElement(document.body, {
              delimiters: [
                  {left: "$$", right: "$$", display: true},
                  {left: "$", right: "$", display: false},
                  {left: "\\(", right: "\\)", display: false},
                  {left: "\\[", right: "\\]", display: true}
              ]
          });
      });
  </script>
  ```
  The inline script lacks a check (`typeof renderMathInElement === 'function'`), and the entire script tag and listener are vestigial legacy code.

- **Evidence**:
  - Replay script: `exploratory-evidence/2026-09-30/repro-auto-render.js`
  - Results data: `exploratory-evidence/2026-09-30/results.json`
  - Screenshots: `exploratory-evidence/2026-09-30/blocked-auto-render-run{1,2,3}.png`, `exploratory-evidence/2026-09-30/offline-cdn-run{1,2,3}.png`, `exploratory-evidence/2026-09-30/control-online.png`.
