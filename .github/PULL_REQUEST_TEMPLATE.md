<!--
Thanks for contributing to Rush Markets. Keep this PR focused on one change.
If you have not read it yet, please skim CONTRIBUTING.md before submitting.
-->

## What changed

<!-- One or two sentences. What does this PR do in user-visible terms? -->

## Why

<!--
Link the issue if there is one, or describe the motivation.
For contract changes, include the threat model / risk if relevant.
-->

Closes #

## How it was tested

<!--
Check all that apply, then fill in the commands or screenshots below.
-->

- [ ] `forge test` passes (contracts)
- [ ] `pnpm check` passes (types)
- [ ] `pnpm lint` passes
- [ ] Manually verified in browser at ______
- [ ] Indexer + API smoke test on local Anvil
- [ ] Not applicable (docs / chore)

```
<!-- paste relevant command output or screenshots here -->
```

## Checklist

- [ ] Only one concern in this PR
- [ ] No new external dependencies (or, added and justified above)
- [ ] Docs updated in the same PR if user-visible behavior changed
- [ ] No secrets committed
- [ ] If a contract interface changed, ABIs in `packages/shared` are regenerated here too
- [ ] If an API response shape changed, the Agent API docs are updated here too
