---
"@moonbase.sh/react": patch
---

`useActivationRequest().fulfillLicense()` now handles failures the same way `fulfillTrial()` does: the error message lands in `error`, `fulfilling` resets to `false`, and the promise resolves instead of rejecting. Previously a failed licence activation left `fulfilling` stuck at `true` with no `error`, so a storefront could show "Activating…" forever.
