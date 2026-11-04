---
"@moonbase.sh/react": patch
---

Expose `./package.json` through the `exports` map so tooling and consumers can read the package manifest (for example `require('@moonbase.sh/react/package.json').version`).
