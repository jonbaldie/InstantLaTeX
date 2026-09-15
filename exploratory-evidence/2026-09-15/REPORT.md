# Exploratory / CGPT findings — 2026-09-15

AFK finding-bugs pass against commit `5a2d5a8` (master, clean). Method: static-analysis-guided
leads + property probes in Node, confirmed through real headless Chrome (puppeteer, fresh
profile per run, scratch server). Prior passes (REPORT.md, REPORT-2026-09-10.md,
cgpt-evidence, 2026-09-12) already covered hash round-trip fuzzing, auto-pair, undo,
iframes, and CSS layout — this pass targeted surfaces they left unexplored.

## Confirmed (3/3 stable each, filed as issues)

### #35 — Deep nesting overflows KaTeX's stack; RangeError escapes `throwOnError:false`

`katex.render` only catches `ParseError`; nesting depth ≥ 2000 (e.g. `{`×2000 + `}`×2000)
throws `RangeError: Maximum call stack size exceeded` (bisected in-page: 1999 OK, 2000 throws;
same in Node). Pasting it freezes the preview with no error feedback, never writes the URL
hash, and repeats on every keystroke; loading a crafted shared URL throws the same error at
initialisation with a blank preview. Recovery works on the next valid edit.

### #36 — Superlinear KaTeX render freezes the page on large formulas

In-page main-thread timings (Chrome): 24 KB → ~1.0 s, 49 KB → ~3.2 s, 98 KB → ~17.2 s.
Re-triggered after every 300 ms typing pause; no size guard, so editing a large formula
freezes the page repeatedly.

### #37 — Same-origin host hash navigation wipes the embedded editor

The `hashchange` listener targets the host window for same-origin embeds, so clicking a host
anchor link (`<a href="#comments">`) loaded the literal string `comments` into the embedded
editor and rendered it as math, destroying the in-progress formula (`host.html` +
`probe.js` probe D-style flow).

## Rejected candidates

- Multi-line selection auto-pair wrap in real Chrome: `(a\nb\nc)` selected, type `(` →
  `(a\nb\nc)` with selection restored at 1..6. Correct.
- `x+yx+yx+y`-style preview text — KaTeX's duplicate MathML copy, normal output.
- A `%0C` form-feed artefact in one hash probe — shell-escaping bug in the probe itself.

## Evidence files

- `probe.js` — all four probes (deep-nesting paste, crafted shared URL, render scaling,
  multi-line wrap) with a scratch static server.
- `host.html` — same-origin host page with an anchor link used for the #37 repro.
