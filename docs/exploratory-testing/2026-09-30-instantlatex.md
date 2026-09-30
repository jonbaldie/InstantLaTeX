# Exploratory testing — InstantLaTeX — 2026-09-30

Pass against commit `059fe09`. Full evidence, screenshots, and driving scripts:

[exploratory-evidence/2026-09-30/REPORT.md](../../exploratory-evidence/2026-09-30/REPORT.md)

## Confirmed

- [#55](https://github.com/jonbaldie/InstantLaTeX/issues/55) — `index.html` throws uncaught `ReferenceError: renderMathInElement is not defined` on `DOMContentLoaded` when KaTeX auto-render script fails to load.

## Reproduced, already open

- [#36](https://github.com/jonbaldie/InstantLaTeX/issues/36) — Large formulas freeze the page: KaTeX render is superlinear and re-runs on the main thread after every typing pause.
- [#37](https://github.com/jonbaldie/InstantLaTeX/issues/37) — Same-origin host hash navigation (anchor links) wipes the embedded editor mid-typing.
