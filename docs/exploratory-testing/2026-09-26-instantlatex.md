# Exploratory testing — InstantLaTeX — 2026-09-26

Pass against commit `e3c160d`. Full evidence, screenshots, and driving scripts:

[exploratory-evidence/2026-09-26/REPORT.md](../../exploratory-evidence/2026-09-26/REPORT.md)

## Confirmed

- [#49](https://github.com/jonbaldie/InstantLaTeX/issues/49) — `BracketPairController` consumes `Backspace` at the end of input for non-bracket characters due to `undefined === undefined`, corrupting Unicode surrogate pairs and bypassing native deletion.

## Reproduced, already open

- [#36](https://github.com/jonbaldie/InstantLaTeX/issues/36) — Large formulas freeze the page: KaTeX render is superlinear and re-runs on the main thread after every typing pause.
- [#37](https://github.com/jonbaldie/InstantLaTeX/issues/37) — Same-origin host hash navigation (anchor links) wipes the embedded editor mid-typing.
