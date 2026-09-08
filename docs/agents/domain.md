# Domain Docs

This repo uses a single-context layout: `CONTEXT.md` at the repo root and decisions under `docs/adr/`.

## Before exploring

Read the root `CONTEXT.md` and any ADRs under `docs/adr/` relevant to the area you will work in.

If these files do not exist, proceed silently. The `/domain-modeling` skill creates them lazily when terminology or decisions are resolved.

## Use the glossary's vocabulary

When naming domain concepts in issues, proposals, hypotheses, or tests, use the terms defined in `CONTEXT.md`. If a term is missing, check whether the project already uses another name; record real glossary gaps for `/domain-modeling`.

## Flag ADR conflicts

If a proposal contradicts an existing ADR, name the ADR and explain why its decision should be reconsidered before changing the implementation.
