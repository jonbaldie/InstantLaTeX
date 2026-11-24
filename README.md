# InstantLaTeX

**Live Demo: [https://jonbaldie.github.io/InstantLaTeX/](https://jonbaldie.github.io/InstantLaTeX/)**

A fun site I whipped up - it allows you to type in LaTeX and TeX and see it instantly rendered.

Anyone who has used LaTeX/TeX knows that it can be a right pain to recompile your documents every time just to preview a small change in your source.

This tool lets you preview your mathematics instantly and easily.

Other great LaTeX tools:
- texpaste.com (free)
- sharelatex.com (freemium)

(c) 2016 Jonathan Baldie.

Thanks to KaTeX for their excellent, fast TeX rendering.

## Exploratory testing

The [2026-11-06 exploratory report](docs/exploratory-testing/2026-11-06-instantlatex.md) covers formula editing, share links, and embedded navigation.

## Embedding and share links

A standalone editor stores its formula in its own URL fragment. An embedded editor
uses the iframe URL fragment, independently of the host page's anchors or routing.
For example, `<iframe src="/index.html#E%3Dmc%5E2"></iframe>` starts with
`E=mc^2`. Editing updates the iframe URL with `replaceState`; navigating the
iframe's fragment (including browser back and forward) restores its formula.

Same-origin embeds previously read and wrote the host page's fragment. Embedders
that relied on that behavior should put the encoded formula in the iframe `src`
instead. Host-fragment synchronization is not provided; cross-origin embeds also
use their own iframe URL.
