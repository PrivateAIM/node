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
send:    Container ──REST──▶ Node Broker ──[encrypt, per-message HKDF]──▶ Hub /messages (durable)
notify:  Hub ──SSE "messagePending" (payload-free)──▶ Node Broker
pull:    Node Broker ──GET /messages (cursor, long-poll)──▶ Hub
deliver: Node Broker ──[decrypt]──▶ webhook POST to the analysis container (or container pull)
```

### Ports (core/)

| Port                  | Responsibility                                                            |
|-----------------------|--------------------------------------------------------------------------|
| `IHubClient`          | REST `send`/`pull`/`ack` against the Hub mailbox + SSE wakeup (`onWakeup`)|
| `IDeliveryService`    | Webhook-subscription registry + fan-out of decrypted messages            |
| `IAnalysisPolicy`     | Assert the caller holds `ANALYSIS_SELF_MESSAGE_BROKER_USE`               |
| `IParticipantResolver`| Resolve analysis node-client participants via server-core               |

### Authorization

- **Inbound (container → node):** node-local Authup JWT (`KEYCLOAK_TOKEN`), verified by
  the standard `@privateaim/server-http-kit` authorization middleware.
- **Analysis policy:** enforced node-side from the analysis client's token claims (or
  server-core introspection). The Hub does not know about analyses.
- **Outbound (node → Hub):** the node authenticates as its **node client**
  (`client_credentials`); the Hub authorizes only "authenticated identity may send/pull".

### Crypto

Node-to-node ECDH (P-256) + AES-256-GCM via `@privateaim/kit`'s `crypto/message`
(`sealMessage`/`openMessage`), wrapped with a **per-message HKDF** to avoid static-key
nonce reuse. Each node holds **one** ECDH keypair; the operator keeps the private key
(`NODE_PRIVATE_KEY`), the Hub never sees it. The Hub stores ciphertext only.

## Configuration

Environment-based via `envix`, validated with `validup` + Zod, managed by `ConfigModule`.
See the service README for the variable table.
