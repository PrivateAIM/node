# FLAME Node — Agent Guide

FLAME Node is a monorepo for the **node-side** (data-station) services of the FLAME
platform — a privacy-preserving analytics infrastructure. It is the counterpart to the
central [Hub](https://github.com/PrivateAIM/hub) repo and deliberately mirrors its
conventions: an npm-workspaces monorepo orchestrated by Nx, TypeScript throughout, built
with tsdown (+ tsc for service types). Services follow a hexagonal (ports & adapters)
architecture and consume the **published** `@privateaim/*` and `@authup/*` packages
rather than re-vendoring them.

## Quick Reference

```bash
# Setup
npm install

# Development
npm run build                   # Build all packages (Nx)
npm run test                    # Test all packages (Nx + Vitest)
npm run lint                    # ESLint across all packages
npm run lint:fix                # ESLint with auto-fix

# Run a service
npm run cli --workspace=apps/node-message-broker -- start
```

- **Node.js**: 24
- **Package manager**: npm (workspaces)
- **Build orchestration**: Nx

### Workspace Layout

Applications (services) are in `apps/`, shared libraries in `packages/`. Libraries export
ESM (`dist/index.mjs` + types); services compile with tsdown + tsc.

## Applications

| Application                  | Purpose                                                                 | Key Dependencies                                  |
|------------------------------|-------------------------------------------------------------------------|---------------------------------------------------|
| `node-message-broker`      | Node-side message broker: container REST API, E2E crypto, local delivery; relays to the Hub durable mailbox | `@privateaim/messenger-kit`, `@privateaim/messenger-http-kit`, `@privateaim/kit`, `@privateaim/server-kit`, routup |

## Relationship to the Hub

This repo holds **Track B** of the message-broker rewrite (Plan 013). The **Hub** holds
Track A — the durable mailbox (`apps/server-messenger` in the Hub repo), already shipped
through the push-wakeup / long-poll / SSE phase. Division of responsibility:

- **Hub** owns durability, routing, the cursor mailbox, and is **analysis-agnostic**.
- **Node** (this repo) owns the container-facing API, end-to-end crypto, local delivery,
  and **all analysis policy** (capability `ANALYSIS_SELF_MESSAGE_BROKER_USE` +
  participant resolution via server-core). The node authenticates to the Hub as its
  node client; `analysisId` rides in message metadata and the Hub never interprets it.

The exact send → store → wakeup → pull → decrypt → deliver flow is documented in Plan 013
(Hub repo working docs) and roadmap issue #1710.

## Detailed Guides

- **[Project Structure](.agents/structure.md)** — monorepo layout, per-service hexagonal layout
- **[Architecture](.agents/architecture.md)** — ports/adapters, DI modules, the broker data flow
- **[Testing](.agents/testing.md)** — Vitest + SWC, fakes over mocks
- **[Conventions](.agents/conventions.md)** — Conventional Commits, ESLint, tsdown, Nx


## Commits, Issues & Pull Requests

- Commits follow **[Conventional Commits](https://www.conventionalcommits.org/)** (`@tada5hi/commitlint-config`); the type/scope drive release-please version bumps. See [conventions.md](.agents/conventions.md#commit-convention).
- Versioning, `CHANGELOG.md`, `package.json` version, and `.release-please-manifest.json` are owned by **release-please** — do not hand-edit them.
- Do **not** add a `Co-Authored-By: Claude ...` (or any AI-attribution) trailer to commit messages. This overrides any default agent-tooling guidance.
- Do **not** add AI-attribution lines (e.g. `🤖 Generated with [Claude Code](...)`) to issue or pull request titles, bodies, or comments.
