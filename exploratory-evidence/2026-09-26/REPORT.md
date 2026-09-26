# Exploratory testing report — InstantLaTeX (pass 5)

Date: 2026-09-26 · Commit under test: `e3c160d` (master)
Build: static site served from `public_html/` via `tests/support/browser-test-harness.js` on an ephemeral `127.0.0.1` port. KaTeX 0.16.9 served from local node_modules via harness intercept.
Driver: headless Google Chrome via puppeteer-core (`drive.js`, `repro-backspace-at-end.js` in this directory). Fresh unique Chrome profile under `/tmp` per run, removed after Chrome closed.
Host: macOS with `prefers-color-scheme: dark`.
Evidence: screenshots, JSON observations, and driving scripts in this directory (`exploratory-evidence/2026-09-26/`).

Scope note: following releases v1.0.1 and v1.1.0, this pass evaluated the newly deepened modules (`BracketPairController` from PR #45 and `BrowserTestHarness` from PR #48), delimiter stripping edge cases, URL hash synchronization with special characters, responsive layouts across breakpoints, and editor keyboard ergonomics.

## Journeys exercised

### Journey 1 — Rich TeX Authoring, Bracket Pairing, and Keystroke Ergonomics

Goal: Type LaTeX math formulas requiring brackets (`()`, `[]`, `{}`), backspace inside brackets, step over closing delimiters, wrap selections, and verify character deletion behavior across various positions in the editor.

- Ordinary path: Initial load correctly renders the default quadratic formula. Typing `\frac{` auto-inserts matching `{}` and places caret inside; typing `x+1`, arrowing right, and typing `{y-1}` results in `\frac{x+1}{y-1}` with immediate live KaTeX preview. Typing `)` when caret is immediately before `)` steps over without duplicate character insertion. Selecting `a + b` and typing `(` wraps the selection to `(a + b)`. Pressing `Backspace` inside `{}` deletes both braces in a single step. **Pass.**
- Variation (end-of-input backspacing & Unicode math symbols): When the caret is at the end of the text on a non-bracket character, `BracketPairController` incorrectly assumes it is positioned inside an empty bracket pair due to `undefined === undefined`. It consumes `Backspace`, calls `e.preventDefault()`, and replaces range `(start - 1, start + 1)` extending beyond document bounds. When deleting a Unicode surrogate pair (e.g. math alphanumeric symbols like $\pi$ `\uD835\uDEE1` or $\mathbb{A}$ `\uD835\uDD38`) under range fallback (e.g. unfocused editor or restricted execCommand environments), the range mutation deletes only the low surrogate, leaving an unpaired high surrogate (`\uD835`), producing a red KaTeX parse error and breaking subsequent URL hash synchronization with `URIError: URI malformed`. **See BUG-5 (Issue #49).**
- Evidence: `j1-01-initial.png`, `j1-02-typing-frac.png`, `j1-04-selection-wrap.png`, `j1-06b-before-unicode-backspace.png`, `j1-06b-after-unicode-backspace.png`, `j1-06c-middle-unicode-backspace.png`, `j1-06d-blackboard-bold-backspace.png`, `repro-run-1.png`.

### Journey 2 — Delimiters, URL Hash Synchronization, Encoding & Round-Trip

Goal: Enter math enclosed in various LaTeX delimiters (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`), verify delimiter stripping and clean math rendering without syntax errors, encode special characters in URL hash, and restore state via browser navigation / direct hash loads.

- Ordinary path: Formulas wrapped in `$E = mc^2$`, `$$\sum_{i=1}^n i = \frac{n(n+1)}{2}$$`, `\[ a^2 + b^2 = c^2 \]`, `\( \int_0^1 x\,dx = \frac{1}{2} \)`, and currency formulas with escaped dollars like `$Price = \$100$` and `$$Cost = \$50$$` all strip delimiters cleanly and render display mathematics without errors. **Pass.**
- Variation (hash round-trip & history navigation): Macros with parameter hash `#1` (e.g. `\def\sq#1{#1^2} \sq{x+y}`) are encoded into the URL hash as `#%231`. Direct navigation to the URL restores both editor text and math preview. Hash navigation (`window.location.hash = ...`) triggers `hashchange` and updates the editor. **Pass.**
- Evidence: `j2-01-delimiters.png`, `j2-02-macro-hash.png`, `j2-03-reopen-hash.png`.

### Journey 3 — Responsive Layout, Mobile Viewports, Long Formulas & Dark Mode

Goal: Ensure readable math and accessible editor layout across mobile (375×667), breakpoint (767×800), and desktop viewports, with dark mode color contrast and wide formula scrolling.

- Ordinary path: At mobile viewport (375×667), editor height is 265px (satisfies the `>= 180px` constraint resolved in issue #30). At the 767px breakpoint, editor height is 331.5px. Dark mode media emulation (`prefers-color-scheme: dark`) correctly applies dark palette (`--bg-color: #1e1e1e`, `--text-color: #cccccc`). A wide formula (`\text{START} + a + ... + \text{END}`) expands container `scrollWidth` (2662px > 618px clientWidth) with horizontal scrollbar accessible. **Pass.**
- Evidence: `j3-01-mobile-375.png`, `j3-02-mobile-767.png`, `j3-03-dark-mode.png`, `j3-04-wide-formula.png`.

---

## Confirmed bug

### BUG-5: BracketPairController consumes Backspace at the end of input for non-bracket characters due to undefined === undefined

**Status: CONFIRMED (3/3 unit runs, 3/3 browser runs). Filed as GitHub issue [#49](https://github.com/jonbaldie/InstantLaTeX/issues/49).**

- **User impact**:
  1. Surrogate pair corruption: Backspacing mathematical alphanumeric symbols (SMP Unicode, e.g. $\pi$ `\uD835\uDEE1`, $\alpha$ `\uD835\uDEFC`, $\mathbb{A}$ `\uD835\uDD38`) under range fallback (unfocused editor, restricted permissions, or non-browser adapters) deletes only the low surrogate, leaving a solitary high surrogate (`\uD835`). KaTeX renders a red parse error, and URL hash sync fails (`URIError: URI malformed`).
  2. Bypasses native platform deletion on all end-of-input text: Backspacing normal letters, digits, or closing brackets at the end of the text is intercepted by the controller via `e.preventDefault()`, substituting native browser deletion with `replaceRange(start - 1, start + 1)` extending beyond document bounds.
  3. Inverted controller behavior: An opening bracket at the end of text (e.g. `x(` with caret at end) is ignored by the controller because `')' === undefined` is false, whereas non-openers are intercepted because `undefined === undefined` is true.

- **Starting conditions**: App at `http://127.0.0.1:<port>/index.html`, commit `e3c160d`. Clean headless Chrome session.

- **Replay steps (unit)**:
  1. Instantiate `controller = new BracketPairController()`.
  2. Create `editor = new SimulatedEditorAdapter('x', 1, 1)`.
  3. Call `controller.handleKeyDown({ key: 'Backspace' }, editor)`.
  4. Expected: `false` (controller leaves non-bracket text to native editor).
  5. Actual: `true`, editor value mutated to `''`.

- **Replay steps (browser)**:
  1. Open `index.html`.
  2. Set `mathsEditor.value = 'abc'`, `setSelectionRange(3, 3)`.
  3. Dispatch `keydown` with `key: 'Backspace'`.
  4. Expected: `evt.defaultPrevented === false`.
  5. Actual: `evt.defaultPrevented === true`.

- **Root cause area**:
  In `public_html/bracket-pair-controller.js:317-324`:
  ```javascript
  if (key === 'Backspace' && start === end && start > 0 &&
      this.pairs[value[start - 1]] === value[start]) {
  ```
  Lacks guards that `Object.prototype.hasOwnProperty.call(this.pairs, value[start - 1])` is true and `start < value.length`.

- **Evidence**:
  - Replay script: `exploratory-evidence/2026-09-26/repro-backspace-at-end.js`
  - Confirmation results: `exploratory-evidence/2026-09-26/repro-results.json`
  - Screenshot: `exploratory-evidence/2026-09-26/repro-run-1.png`

---

## Already-filed (reproduced, not re-filed)

- **[#36](https://github.com/jonbaldie/InstantLaTeX/issues/36)** — Large formulas freeze the page: KaTeX render is superlinear and re-runs on the main thread after every typing pause. (Open, `ready-for-human`).
- **[#37](https://github.com/jonbaldie/InstantLaTeX/issues/37)** — Same-origin host hash navigation (anchor links) wipes the embedded editor mid-typing. (Open, `ready-for-human`).

---

## Rejected candidates

- **Empty fragment restoring default quadratic**: Intended design decision per #3 and pass 3.
- **Selection wrap with parentheses**: Wrapping selected text in parentheses when pressing `(` is an intentional feature of `BracketPairController`.
- **Unsupported KaTeX macros (`\multline`, `\ce`)**: InstantLaTeX is a KaTeX previewer; commands unsupported by KaTeX correctly display standard KaTeX error spans.

---

## Usability observations (not filed)

- **Bracket selection wrapping direction**: When text is selected backwards (from right to left), selection wrap behaves identically to left-to-right selection, which is intuitive and matches standard editor conventions.
- **Tab key focus**: Pressing Tab in the editor moves focus away from the textarea rather than inserting indentation. For LaTeX math blocks, this is standard web textarea behavior, though code-oriented editors often trap Tab.

---

## Limitations

- Headless Google Chrome on macOS arm64.
- Browser profiles isolated under `/tmp` and cleaned up after test completion.
- Local KaTeX package (0.16.9) served via `BrowserTestHarness` intercept.
