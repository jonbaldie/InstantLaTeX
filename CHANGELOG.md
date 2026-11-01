# Changelog

## Unreleased

- Embedded editors now read and update their own iframe URL fragment, so host
  anchors and hash routing do not overwrite formulas or pending edits. Same-origin
  embeds that relied on the host fragment should move the encoded formula to the
  iframe `src`. Standalone and cross-origin URL behavior remains unchanged.
