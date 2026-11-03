# Contributing

## Toolchain

- Node 22.11 or newer
- pnpm 10 (the exact version is pinned in `package.json` `packageManager`; `corepack enable` or `npm i -g pnpm@10` both work)

```bash
pnpm install
```

## Scripts (run from the repo root)

| Command | What it does |
| --- | --- |
| `pnpm type-check` | `tsc --noEmit` over `packages/react` |
| `pnpm test` | Unit tests (vitest, jsdom, mocked API client) |
| `pnpm test:live` | Read-only tests against a real Moonbase tenant (see below) |
| `pnpm test:all` | Both of the above |
| `pnpm build` | ESM + CJS + type declarations into `packages/react/dist` |
| `pnpm check:exports` | `publint` and `@arethetypeswrong/cli` on the built package |

The test configs pin `NODE_ENV=test`, so a shell that exports `NODE_ENV=production` does not break them.

## Live tests

`pnpm test:live` talks to `https://corino-demo.moonbase.sh`, Moonbase's public demo tenant. The tests only read: catalog fetch, hydration round-trip, and a voucher lookup that is expected to 404. They never sign in, sign up, or create orders. If the tenant is unreachable the file skips itself.

Point them at another tenant with `MOONBASE_LIVE_ENDPOINT=https://your-tenant.moonbase.sh pnpm test:live`.

## Changes and releases

Every user-visible change needs a changeset:

```bash
pnpm changeset
```

Pick `@moonbase.sh/react`, choose patch/minor/major, write one or two sentences for the changelog. Commit the generated `.changeset/*.md` with your change.

Releasing (maintainers): on `main`, first bump `SDK_VERSION` in `packages/react/src/context.ts` to the new version; the live header test fails if it disagrees with `package.json`. Then run `pnpm version-packages`, review the bumped `packages/react/package.json` and `CHANGELOG.md`, commit as `chore(release): vX.Y.Z`, then tag and push:

```bash
git tag vX.Y.Z && git push origin main vX.Y.Z
```

The `Release` workflow builds the package and attaches `moonbase.sh-react-X.Y.Z.tgz` to a GitHub Release. The package is not published to npm from this repository.

## Commit messages

`type(scope): subject`, where `type` is one of `feat`, `fix`, `test`, `docs`, `chore`, `ci`, `refactor`, and `scope` is `react`, `ci`, or `repo`. Keep the subject under 72 characters.
