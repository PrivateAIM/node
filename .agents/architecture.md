# Architecture

## Hexagonal (ports & adapters)

Every service is organised into three layers, identical to the Hub services:

```
src/
├── core/      # Domain logic — ports, services, validators (no typeorm/routup/infra)
├── adapters/  # External system implementations — http, hub client, delivery
└── app/       # Orchestration — DI modules, wiring, factory
```

Each service has `app/builder.ts` (`ServiceXApplicationBuilder extends BaseApplicationBuilder`)
with fluent `withConfig()/…/withHTTP()`, and `app/factory.ts` exposing `createApplication()`.
DI modules implement `IModule` from `orkos`; injection keys are `TypedToken<T>` from `eldin`.

## node-message-broker data flow

The node broker is a thin encrypt/decrypt + local-delivery adapter in front of the Hub's
durable mailbox. It is **analysis-aware** (unlike the Hub).

```
send:    Container ──REST──▶ Node Broker ──[encrypt per recipient, analysisId-bound HKDF]──▶ Hub /messages (durable)
notify:  Hub ──SSE "messagePending" (payload-free)──▶ Node Broker   (long-poll pull is the fallback)
pull:    Node Broker ──GET /messages (cursor, long-poll)──▶ Hub
deliver: Node Broker ──[decrypt]──▶ webhook POST to the analysis container
```

### Ports (core/)

| Port                     | Responsibility                                                            |
|--------------------------|--------------------------------------------------------------------------|
| `IHubClient`             | REST `send`/`pull`/`ack` against the Hub mailbox + SSE wakeup (`onWakeup`)|
| `ICryptoService`         | `seal`/`open` — node-to-node E2E (ECDH + per-message HKDF + AES-256-GCM)  |
| `IDeliveryService`       | Webhook-subscription registry + fan-out of decrypted messages            |
| `IParticipantResolver`   | Resolve analysis node-client participants (+ their public keys) via server-core |
| `IAnalysisClientLookup`  | Resolve the Authup client that owns an analysis (server-core)            |
| `IPermissionCheckGateway`| Check the `ANALYSIS_SELF_MESSAGE_BROKER_USE` capability against Authup over HTTP |

Outbound send/broadcast orchestration lives in `core/messaging`; the inbound pull → decrypt →
deliver → ack loop in `core/inbound`. The analysis-scope rule is the pure function
`assertClientOwnsAnalysis` (`core/analysis`), not a port.

### Authorization

- **Inbound (container → node):** node-local Authup JWT (`KEYCLOAK_TOKEN`), verified by
  the standard `@privateaim/server-http-kit` authorization middleware.
- **Capability:** every analysis-scoped route asserts `ANALYSIS_SELF_MESSAGE_BROKER_USE`
  via the request permission checker, evaluated against Authup over HTTP
  (`IPermissionCheckGateway` → Authup permission-check endpoint, short-TTL cached) — **not**
  from token introspection permissions.
- **Analysis scope:** `assertClientOwnsAnalysis` requires the caller's client to own the
  analysis (server-core `analysis → client` lookup). One dedicated Authup client per
  analysis, so a client match is exact analysis-level isolation. The Hub knows nothing of
  analyses.
- **Outbound (node → Hub):** the node authenticates as its **node client**
  (`client_credentials`); the Hub authorizes only "authenticated identity may send/pull".

### Crypto

Node-to-node ECDH (P-256) + AES-256-GCM via `@privateaim/kit`'s `crypto/message`
(`sealMessage`/`openMessage`), wrapped with a **per-message HKDF** to avoid static-key
nonce reuse. Each node holds **one** ECDH keypair; the operator keeps the private key
(`NODE_PRIVATE_KEY`), the Hub never sees it. The Hub stores ciphertext only.

`analysisId` is bound into the HKDF `info` on **both** `seal` and `open`, so a
`metadata.analysisId` relabelled in transit by the untrusted Hub fails to decrypt instead of
being mis-routed to another analysis's webhooks. The two call sites are coupled — keep them
in sync.

## Configuration

Environment-based via `envix`, validated with `validup` + Zod, managed by `ConfigModule`.
See the service README for the variable table.
