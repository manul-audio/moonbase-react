# moonbase-react

Headless React hooks for [Moonbase](https://moonbase.sh) storefronts: catalog,
pricing, cart, embedded checkout, authentication, customer inventory, licence
activation, and vouchers, with first-class server-side rendering for Next.js
and other Node servers.

| Package | Docs |
| --- | --- |
| [`@moonbase.sh/react`](packages/react) | [packages/react/README.md](packages/react/README.md) |

A reference storefront built on this SDK lives in
[manul-audio/corino-react-storefront](https://github.com/manul-audio/corino-react-storefront).

## Status

Independent implementation, proposed to Moonbase for adoption as their
official React SDK. Not yet on npm. Install a tagged build from the
[Releases](https://github.com/manul-audio/moonbase-react/releases) page:

```bash
pnpm add https://github.com/manul-audio/moonbase-react/releases/download/v0.1.2/moonbase.sh-react-0.1.2.tgz
```

npm 12 and newer refuse remote tarballs unless you opt in:

```bash
npm install --allow-remote=all https://github.com/manul-audio/moonbase-react/releases/download/v0.1.2/moonbase.sh-react-0.1.2.tgz
```

## Develop

```bash
pnpm install
pnpm test        # unit tests
pnpm test:live   # read-only tests against the public demo tenant
pnpm build
pnpm check:exports
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## Licence

[MIT](LICENSE)
