# Changelog

## 2.0.0

### Breaking changes

- Require `@mysten/sui` v2 (`^2.16.3`). This is the minimum release verified against the subpath APIs used by this SDK.
- Replace the inherited legacy JSON-RPC client with a composed `SuiGrpcClient` and `fullClient` proxy.
- `sendTransaction` now throws `MagmaRpcError` on signing or execution failure instead of logging and returning `undefined`.
- APIs using `paginationArgs: 'all'` are bounded by default and can report `truncated: true` when a safety limit is reached.
- Default mainnet and testnet configurations no longer enable a JSON-RPC event fallback implicitly.
- Decimal amount conversion helpers now return strings so integer values cannot lose precision through JavaScript `number`.

### Added

- Support for injecting an application-owned `SuiGrpcClient`.
- gRPC-backed object, owned-object, dynamic-field, coin, balance, simulation, transaction, and position reads.
- Optional explicit `jsonRpcClient`/`jsonRpcUrl` fallback for legacy event queries that gRPC cannot provide.
- Configurable endpoint and pagination safety policies, cancellation support, typed RPC errors, and runtime validation for addresses, object IDs, coin types, transaction digests, limits, and dynamic-field values.
- On-chain MovePackageService descriptor-based BCS decoding for CLMM and Magma extension simulation events, including nested generic Move datatypes.
- Compatibility tests for Sui v2 flat Move JSON and legacy nested Move JSON, plus opt-in live position/BCS simulation tests.
- ALMM strategy mint/add-liquidity, reward-aware burn/shrink, multi-coin inputs, Zap option types, and structured utility errors from the May 2026 CLMM SDK release.

### Fixed

- Distinguish object-not-found responses from transport failures.
- Stop fabricating `hasPublicTransfer`, `coinObjectCount`, and `lockedBalance` values unavailable from Sui v2 responses.
- Implement `getAllCoins` using `listBalances` and `listCoins` rather than scanning every owned object.
- Avoid mutating caller-provided SDK options or injected client internals during object ID normalization.
- Remove repository-embedded integration-test mnemonics and require explicit environment-variable injection for signing tests.
- Use the final May 2026 Magma CLMM and integration deployments, `pool_creator_v3`, and the `script_helpers` transfer ABI.
- Route protected SUI gas-adjusted liquidity transactions through the protection-aware builder.

### Known limitations

- Sui gRPC does not provide the legacy `queryEvents` method. Event-history features require an explicitly configured secondary transport or indexer.
- The repository's historical integration tests depend on public Magma services, funded test accounts, and live on-chain fixtures; offline adapter/parser tests do not require those services.
- The built-in mainnet and testnet configurations do not enable Gauge/Lock. A valid `ve33` package/config and a matching integration deployment must be supplied before using those modules.
- Top-level generic event wrappers are not yet decoded; the currently verified CLMM, ALMM, Reward, and Swap event types are non-generic at the top level.
