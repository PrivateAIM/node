# Project Structure

## Monorepo Overview

npm-workspaces monorepo with two workspace roots: `apps/*` and `packages/*`. Nx
orchestrates build/test/lint with dependency-aware caching. Mirrors the FLAME Hub repo.

## Applications

Runnable services, located in `apps/`.

| Application              | Purpose                                                      |
|-------------------------|-------------------------------------------------------------|
| `node-message-broker` | Node-side message broker (container API, E2E crypto, local delivery, Hub link) |

## Packages

Shared libraries, located in `packages/`. Empty for now — add node-specific shared kits
here as services grow. Cross-cutting concerns (logging, DI base, HTTP helpers, domain
types, the Hub message client) come from the **published** `@privateaim/*` packages, not
from local copies.

## Per-Application Directory Layout (hexagonal)

```
apps/node-message-broker/src/
├── core/                       # Domain logic — ports only, zero infra imports
│   ├── hub/                    # IHubClient — send / pull / ack / onWakeup
│   ├── crypto/                 # ICryptoService — seal / open (node-to-node E2E)
│   ├── delivery/               # IDeliveryService — webhook registry + fan-out
│   ├── analysis/               # IParticipantResolver, IAnalysisClientLookup + assertClientOwnsAnalysis (scope policy)
│   ├── authz/                  # IPermissionCheckGateway — capability check
│   ├── messaging/              # outbound send / broadcast orchestration
│   └── inbound/                # inbound delivery loop (pull → decrypt → deliver → ack)
├── adapters/                   # External system implementations
│   ├── http/controllers/       # Container-facing REST controllers (thin) + validup/zod validators
│   ├── http/middleware/        # request permission-checker (Authup over HTTP)
│   ├── hub/                    # IHubClient impl (messenger-http-kit + SSE wakeup)
│   ├── crypto/                 # ICryptoService impl (@privateaim/kit crypto/message)
│   ├── core/                   # IParticipantResolver impl (server-core)
│   ├── authz/                  # Authup permission gateway + IPermissionProvider
│   └── delivery/               # IDeliveryService impl (webhook fan-out)
├── app/                        # Orchestration & DI wiring
│   ├── builder.ts              # ServerMessageBrokerApplicationBuilder
│   ├── factory.ts              # createApplication()
│   └── modules/
│       ├── config/             # ConfigModule (env, validation, defaults)
│       ├── components/         # ComponentsModule (delivery + crypto + Hub link)
│       ├── core-client/        # CoreClientModule (server-core resolver + lookup)
│       ├── inbound/            # InboundModule (starts the delivery loop)
│       └── http/               # HTTPModule (routup server + controllers)
├── cli/                        # CLI entry point (citty)
└── constants.ts
```

## Dependency Rule

- **core/ → nothing** (only external domain packages: `@privateaim/kit`,
  `@privateaim/messenger-kit`, `@privateaim/server-kit`, `@ebec/http`, …)
- **adapters/ → core/ and app/**
- **app/ → core/ and adapters/**
