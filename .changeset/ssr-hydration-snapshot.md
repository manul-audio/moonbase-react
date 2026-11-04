---
"@moonbase.sh/react": patch
---

Fix server rendering with hydrated state. `hydrate()` now also pins the store's initial snapshot, which `useSyncExternalStore` reads during server rendering and React's hydration pass. Before this, every hook rendered an empty catalog on the server even when `initialState` was supplied, so SSR output never contained products or the signed-in user.
