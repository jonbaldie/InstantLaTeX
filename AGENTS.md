# Agent Instructions

## Shared Fleet host

Fleet runs this repository with other autonomous jobs on one macOS host.

- Run Jest with `npm test -- --maxWorkers=2`.
- Run browser tests with `npm run test:e2e`.
- Give each browser test run a unique Chrome profile under `/tmp`.
- Remove the exact profile directory in the test cleanup after Chrome closes.
- Preserve all other files and directories under `/tmp`.

## Agent skills

### Issue tracker

Track all work in GitHub Issues for `jonbaldie/InstantLaTeX`. Before creating, reading, or updating tickets, read `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. Before triaging or applying labels, read `docs/agents/triage-labels.md`.

### Domain docs

Use a single-context layout: root `CONTEXT.md` and `docs/adr/`. Before exploring the codebase, read `docs/agents/domain.md`.

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**
```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**
- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

## Session Completion

1. File GitHub issues for remaining work and update the status of work handled this session.
2. Run the relevant tests, linters, and builds when code changes.
3. Commit the session's changes, then sync and push:

   ```bash
   git pull --rebase
   git push
   git status  # Must show up to date with origin
   ```

4. Clean up session-created stashes and prune stale remote-tracking branches. Preserve unrelated work.
5. Verify all session changes are committed and pushed, then provide a handoff with validation results and any remaining work.

Work is complete only after `git push` succeeds. Resolve push failures and retry before ending the session.
