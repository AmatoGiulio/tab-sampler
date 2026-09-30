# Contributing

Keep changes aligned with the V1 product invariant:

```text
click -> listen -> click -> trim -> loop -> export
```

## Before a pull request

```bash
npm install
npm run typecheck
npm test
npm run build
```

For UI changes, verify the popup at 100%, 125%, 150%, and 200% display scaling and test both pointer trimming and keyboard focus states.

For capture changes, test at least one YouTube tab, one generic HTML5 audio page, navigation during recording, tab close during recording, and a service-worker restart/reload scenario.

Avoid adding dependencies for isolated primitives that are simpler and safer to own locally.
