# FLAME Node

Monorepo for the **node-side** services of the FLAME platform — the components that run
at a data station (node), alongside the central [Hub](https://github.com/PrivateAIM/hub).

It is structured like the Hub repo: an npm-workspaces monorepo orchestrated by Nx, with
TypeScript services under `apps/*` and shared libraries under `packages/*`. Services follow
the same hexagonal (ports & adapters) architecture and consume the **published**
`@privateaim/*` and `@authup/*` packages.

## Services

| Application                       | Purpose                                                              |
|-----------------------------------|---------------------------------------------------------------------|
| `apps/node-message-broker`      | Node-side message broker — container API, E2E crypto, local delivery; relays to the Hub durable mailbox. Replaces the Java `node-message-broker`. |

More services will be added here over time.

## Quick reference

```bash
npm install          # install workspace dependencies

npm run build        # build all packages (Nx)
npm run test         # test all packages (Nx + Vitest)
npm run lint         # ESLint across the repo
npm run lint:fix     # ESLint with auto-fix
```

- **Node.js**: 22
- **Package manager**: npm (workspaces)
- **Build orchestration**: Nx

## Documentation

- **[AGENTS.md](AGENTS.md)** — agent guide + detailed `.agents/*` references.
- Each service has its own `README.md`.

The design authority for the message broker (Hub + Node tracks) lives in the Hub repo's
working plans (Plan 013) and roadmap issue #1710.
