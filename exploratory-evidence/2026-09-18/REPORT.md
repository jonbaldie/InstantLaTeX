# Exploratory / CGPT findings — 2026-09-18

AFK finding-bugs pass against commit `a0adef0` (master, clean). Method: coverage-guided property tests in Node, static-analysis inspection of delimiter-stripping and keyboard handling, confirmed via headless Google Chrome (`puppeteer-core`, unique Chrome profile per run under `/tmp`, ephemeral local server).

## Confirmed (3/3 stable across fresh headless-Chrome sessions)

### Formulas ending with an escaped dollar (`\$`) wrapped in `$ ... $` fail to strip delimiters and crash the renderer

In `public_html/main.js:73-86`, `stripDelimiters` checks `!trimmed.endsWith('$$')` to reject mismatched delimiters such as `$x$$`. However, this naive string suffix check does not check whether the first `$` of the trailing `$$` is escaped by a backslash (`\$`).

When a formula ends with an escaped dollar symbol (e.g. `$\$$`, `$100\$$`, `$x\$$`, `$\text{Price: }\$$`), `trimmed.endsWith('$$')` evaluates to `true`, causing `!trimmed.endsWith('$$')` to evaluate to `false`. As a result:
- The inline dollar stripper is bypassed completely.
- `stripDelimiters` falls through and returns the input string unstripped.
- `UpdateMath` passes `$\$$` or `$100\$$` directly to `katex.render(arg, node, { throwOnError: false, displayMode: true })`.
- In KaTeX math mode, the unstripped leading `$` is treated as an invalid math-shift command, throwing `ParseError: KaTeX parse error: Can't use function '$' in math mode at position 1`.
- The preview renders in red as a parse error.

#### Contrast with control:
- `$100\$ $` (with a space before the closing `$`) passes `!trimmed.endsWith('$$')`, strips the delimiters to `100\$`, and renders `100$` cleanly without error.
- Display dollar mode `$$100\$$$` also passes because it ends in three dollars (`\$$$`), so index `length - 2` is preceded by `$`, not `\`.
- Only inline dollar mode `$ ... $` with no whitespace before the closing delimiter is rejected.

#### Reproducibility:
- Hand-typed `$\$$` in fresh headless Chrome: 3/3 reproduced parse error.
- Pasted `$100\$$` in fresh headless Chrome: 3/3 reproduced parse error.
- Fresh load from URL hash (`#%24%5C%24%24`): 3/3 reproduced parse error.

## Rejected candidates

- Multi-line wrap and undo interaction after delimiter insertion: undo properly restores previous state when initiated via keyboard chords or `execCommand`.
- URL fragment with macro parameter `#` (`\#` / `#1`): `replaceState` properly percent-encodes `#` as `%23` and round-trips back on fresh reload.
- Display-mode brackets containing nested brackets or spacing arguments (`\\[1em]`): properly stripped and rendered.
- Font metrics lookup errors (`\text{\textbf{\textit{\textsf{\texttt{abc}}}}}`): safely caught by `UpdateMath`'s `try / catch` block without breaking editor state.

## Evidence files

- `probe.js` — automated driver script running headless Chrome with isolated profiles and ephemeral static server.
- `results.json` — structured probe observations across 3 runs for each scenario.
- `probe-handtyped-run{1,2,3}.png` — screenshots of hand-typed `$\$$` showing red KaTeX parse error.
- `probe-paste-run{1,2,3}.png` — screenshots of pasted `$100\$$` showing red KaTeX parse error.
- `probe-hashload-run{1,2,3}.png` — screenshots of hash-loaded `$\$$` showing red KaTeX parse error.
- `control-with-space.png` — screenshot of `$100\$ $` with space rendering successfully.
