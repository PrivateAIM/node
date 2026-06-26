<p align="center">
  <a href="https://privateaim.net" target="_blank" rel="noopener noreferrer">
    <img src="./.github/assets/icon.svg" alt="FLAME Node" height="130">
  </a>
</p>

<h1 align="center">FLAME Node</h1>

<p align="center">
  <b>Node-side (data-station) services for the FLAME platform.</b><br>
  Privacy-preserving, federated analytics across distributed institutions —<br>
  the components that run at a node, alongside the central <a href="https://github.com/PrivateAIM/hub">Hub</a>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%E2%89%A524-3c873a?logo=node.js&logoColor=fff" alt="node >=24">
  <a href="https://conventionalcommits.org"><img src="https://img.shields.io/badge/Conventional%20Commits-1.0.0-FE5196?logo=conventionalcommits&logoColor=fff" alt="Conventional Commits"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="license"></a>
</p>

<p align="center">
  <a href="https://docs.privateaim.net"><b>Documentation</b></a> &nbsp;·&nbsp;
  <a href="#quick-start">Quick Start</a> &nbsp;·&nbsp;
  <a href="#services">Services</a> &nbsp;·&nbsp;
  <a href="#packages">Packages</a> &nbsp;·&nbsp;
  <a href="https://github.com/PrivateAIM/hub">Hub</a>
</p>

---

FLAME Node is the home of the **node-side** services for **[FLAME](https://privateaim.net)**
([PrivateAIM](https://privateaim.net)) — a privacy-preserving analytics infrastructure that
runs distributed computations across institutional boundaries without moving the underlying
data. The services in this repo run at a **data station (node)** and are the counterpart to
the central [Hub](https://github.com/PrivateAIM/hub).

It is structured like the Hub repo: an npm-workspaces monorepo orchestrated by Nx, with
TypeScript services under `apps/*`, shared libraries under `packages/*`, the same hexagonal
(ports &amp; adapters) architecture, and the same conventions. Services consume the
**published** `@privateaim/*` and `@authup/*` packages rather than re-vendoring Hub code.

> [!IMPORTANT]
> **This monorepo holds only a _subset_ of the FLAME node-side services.** The data station
> runs several components; this repo currently contains the new TypeScript **message
> broker**. Other node-side components live in their own repositories and **may stay there** —
> not everything is consolidated into this monorepo.

## Services

Runnable applications. Each service follows the same hexagonal (ports &amp; adapters)
architecture as the Hub backend services.

| Service | Description |
|---------|-------------|
| **[node-message-broker](apps/node-message-broker)** 💬 | Node-side message broker — `flamesdk`-compatible container REST API, node-to-node end-to-end crypto, and local webhook delivery; relays to and pulls from the Hub durable mailbox. Replaces the legacy Java `node-message-broker`. |

_Further node-side services may be added here over time; others may remain in their own repositories._

## Packages

Shared, node-specific libraries live under [`packages/*`](packages). **None are published
yet** — cross-cutting concerns (logging, DI base, HTTP helpers, domain types, the Hub
message client) come from the **published** `@privateaim/*` packages maintained in the
[Hub repo](https://github.com/PrivateAIM/hub#packages), not from local copies. Node-specific
shared kits will be added here as the service set grows.

## Quick Start

### Prerequisites

- **Node.js** 24+
- **npm** (workspaces)

External services (for running the broker locally):
[Authup](https://authup.org) (node-local OAuth2), the Hub message broker (durable mailbox),
and server-core (participant + analysis-credential resolution).

### Install &amp; Build

```bash
# Install dependencies
npm install

# Build all packages (Nx, dependency-aware)
npm run build

# Run the test matrix (Nx + Vitest)
npm run test

# Lint
npm run lint
npm run lint:fix   # with auto-fix
```

### Development

```bash
# Run a service (CLI entry point)
npm run cli --workspace=apps/node-message-broker -- start
```

Each service documents its own configuration and scripts in its `README.md`.

## Built With

FLAME Node is built on the same stack as the Hub — open-source libraries maintained by the
same author:
**[Authup](https://authup.org)** (identity &amp; access),
**[Routup](https://github.com/routup/routup)** (HTTP routing),
**[Hapic](https://github.com/tada5hi/hapic)** (HTTP clients), and
**[validup](https://github.com/tada5hi/validup)** (validation) —
orchestrated with [Nx](https://nx.dev), built with [tsdown](https://github.com/rolldown/tsdown),
and tested with [Vitest](https://vitest.dev). It consumes the published
`@privateaim/*` domain &amp; server kits from the Hub.

## Documentation

- **[AGENTS.md](AGENTS.md)** — repo guide, with the detailed [`.agents/*`](.agents)
  references ([structure](.agents/structure.md), [architecture](.agents/architecture.md),
  [testing](.agents/testing.md), [conventions](.agents/conventions.md)).
- Each service has its own `README.md`.

The design authority for the message broker (Hub + Node tracks) lives in the Hub repo's
working plans (Plan 013) and roadmap issue #1710.

## Contributing

Contributions follow the same conventions as the Hub: **[Conventional Commits](https://www.conventionalcommits.org/)**,
ESLint, and the hexagonal architecture described in [`.agents/conventions.md`](.agents/conventions.md).
Versioning and changelogs are owned by release-please — do not hand-edit them.

## Credits

Created and maintained by [Peter Placzek](https://tada5hi.net) ([@tada5hi](https://github.com/tada5hi)),
with contributions from the [PrivateAIM team](https://github.com/PrivateAIM/node/graphs/contributors).
If you have any questions, feel free to reach out.

## License

Made with 💚

Published under [Apache 2.0](./LICENSE).
