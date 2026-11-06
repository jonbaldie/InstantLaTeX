# Exploratory testing: InstantLaTeX, 2026-11-06

The pass used `origin/master` at `b51a989` (version 2.0.0), Node 22.22.1, and Chrome for Testing headless shell 157.0.8103.38 on Linux. `npm ci` installed the lockfile in a separate worktree. npm warned that jsdom requires Node 22.22.2 or newer in the 22.x line. Browser libraries were extracted into the worktree. The browser harness served locked KaTeX locally in place of the CDN and blocked other third-party requests. This pass did not test live CDN or advertising behavior.

[Browser script and output](../../exploratory-evidence/2026-11-06/) contain the actions, values, fragments, and preview text. Run `node exploratory-evidence/2026-11-06/explore.cjs` after `npm ci`, with `CHROME_PATH` set if Chrome is not on the path. The harness starts a server on a dynamic localhost port, uses a unique temporary browser profile, and closes both in its `finally` block.

## Journeys

1. **Edit and correct a formula.** The default quadratic rendered. Replacing it with `x^2+1` updated the preview and fragment. Adding `+^` produced visible parse-error feedback. Removing the invalid suffix restored the rendered preview and fragment. The successful run and replay both observed these results.
2. **Open and recover a share link.** Reloading `#x%5E2%2B1` restored the formula and preview. A fresh document at `?malformed=1#%ZZ` retained the default formula, and editing it to `a+b` updated the preview and fragment. Reopening the original link restored `x^2+1`. The successful run and replay both observed these results.
3. **Edit inside an embedded editor.** A same-origin host started the frame with `E=mc^2`. Typing `+x` changed the frame's preview and fragment. Navigating the host to `#comments` left the frame's formula intact. A fresh frame document with the edited fragment restored `E=mc^2+x` in a follow-up replay. The first two runs navigated to the frame's existing URL and did not prove a fresh load. The existing cross-origin and history regression scenarios also passed.

## Findings and limitations

No new product bug was confirmed. No issue was filed. The open [large-formula performance issue #36](https://github.com/jonbaldie/InstantLaTeX/issues/36) was not retested. The prior embed issue [#37](https://github.com/jonbaldie/InstantLaTeX/issues/37) is closed; the host-navigation path above did not reproduce it.

Two failed driver attempts were not product failures. An unsupported command did not produce the `.katex-error` element expected by the driver, so the run used a syntactically invalid exponent instead. A malformed fragment entered via same-document navigation retained the current formula, as the current page's error handler intends; a new document was needed to check startup. A further timeout arose because the driver evaluated a malformed fragment before the debounce replaced it. Waiting for the update before decoding the fragment resolved it. The initial outputs remain in the evidence directory.

The browser was initially unavailable. The first Jest run had six harness failures and 70 passing tests; browser tests could not launch. After adding a worktree-local browser and its missing shared libraries, Jest passed all 76 tests and the editor, bootstrap, embed, layout, nested-overflow, and wide-formula browser suites passed. These regression suites supplement the journeys above; they are not a substitute for them.

Preview checks used DOM text and rendered-element presence, not visual inspection. The pass did not exercise headed browsers, Safari, Firefox, real third-party embeds, IME input, live ads, or large-formula responsiveness. A bare fragment also remains outside the share-link journey because the existing [#3](https://github.com/jonbaldie/InstantLaTeX/issues/3) explicitly chose the default formula for that case.
