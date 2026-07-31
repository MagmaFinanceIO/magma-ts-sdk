<a name="readme-top"></a>

![npm](https://img.shields.io/npm/v/%40magmaprotocol%2Fmagma-ts-sdk?logo=npm&logoColor=rgb)
![GitHub Repo stars](https://img.shields.io/github/stars/MagmaFinanceIO/magma-ts-sdk?logo=github)

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a >
    <img src="https://app.magmafinance.io/magma.svg" alt="Logo" width="100" height="100">
  </a>

  <h3 align="center">Magma-ts-SDK</h3>

  <p align="center">
    Integrating Magma-ts-SDK: A Comprehensive Guide, Please see details in document.
    <br />
    <a href="https://github.com/MagmaFinanceIO/magma_sdk_doc"><strong>Explore the document »</strong></a>
<br />
    <br />
  </p>
</div>

## Introduction

Magma-ts-SDK is the official software development kit (SDK) specifically designed for seamless integration with Magma-CLMM. It provides developers with the necessary tools and resources to easily connect and interact with Magma-CLMM, enabling the development of robust and efficient applications.

## Getting Started

To integrate our SDK into your local project, please follow the example steps provided below.
Please see details in document.

### Prerequisites

```sh
npm i @magmaprotocol/magma-ts-sdk @mysten/sui@^2
```

### Setting Up Configuration

Our SDK now includes a default initialization method that allows for quick generation of the Magma SDK configuration. You can utilize the src/config/initMagmaSDK method to swiftly initialize the configuration. You have the option to select either 'mainnet' or 'testnet' for the network.

```typescript
import { initMagmaSDK } from '@magmaprotocol/magma-ts-sdk'

const magmaClmmSDK = initMagmaSDK({ network: 'mainnet' })
```

If you wish to set your own full node URL and simulate address, you can do so as follows:

```typescript
import { initMagmaSDK } from '@magmaprotocol/magma-ts-sdk'

const network = 'mainnet'
const fullNodeUrl = 'https://...'
const simulationAccount = '0x...'
const magmaClmmSDK = initMagmaSDK({ network, fullNodeUrl, simulationAccount })
```

Now, you can start using Magma SDK.

### Sui SDK v2 and gRPC

The SDK accepts an existing Sui SDK v2 `SuiGrpcClient`. When a client is injected,
`fullRpcUrl` is optional. Position and object reads use gRPC directly.

```typescript
import { SuiGrpcClient } from '@mysten/sui/grpc'
import { MagmaClmmSDK, clmmMainnet } from '@magmaprotocol/magma-ts-sdk'

const suiGrpcClient = new SuiGrpcClient({
  baseUrl: 'https://fullnode.mainnet.sui.io:443',
  network: 'mainnet',
})

const magmaClmmSDK = new MagmaClmmSDK({
  ...clmmMainnet,
  network: 'mainnet',
  suiGrpcClient,
  fullRpcUrl: undefined,
  // Leave these unset for a gRPC-only position/object read client.
  jsonRpcClient: undefined,
  jsonRpcUrl: undefined,
})

const positions = await magmaClmmSDK.Position.getPositionList('0x...')
```

Sui gRPC does not expose the legacy `queryEvents` API. Features that query historical
events require an explicit `jsonRpcClient` or `jsonRpcUrl`; position reads do not.
The built-in mainnet and testnet configurations do not enable this fallback automatically.

APIs called with `paginationArgs: 'all'` are bounded by default to 100 pages and
10,000 items. Backends can configure stricter limits or request cancellable bounded
pagination explicitly:

```typescript
const magmaClmmSDK = new MagmaClmmSDK({
  ...clmmMainnet,
  suiGrpcClient,
  paginationPolicy: { pageSize: 100, maxPages: 20, maxItems: 2_000 },
  endpointPolicy: { allowedHosts: ['fullnode.mainnet.sui.io'] },
})

const page = await magmaClmmSDK.fullClient.getOwnedObjectsByPage(
  owner,
  { filter: { StructType: positionType }, options: { showContent: true } },
  { all: true, maxPages: 10, maxItems: 500, signal: abortController.signal }
)

if (page.truncated) {
  // Resume from page.nextCursor or narrow the query.
}
```

URL-created clients require HTTPS. Private and loopback endpoints are rejected unless
`endpointPolicy.allowInsecureLocalhost` is explicitly enabled for local development.
Legacy v1-shaped helpers remain available for compatibility, but new code should prefer
`magmaClmmSDK.fullClient.suiGrpcClient` and native Sui v2 response types.

Simulation events are decoded from `event.bcs` using datatype descriptors loaded from the
same gRPC endpoint's MovePackageService. Internal protocol modules consume `parsedBcs`;
the historical `parsedJson` event property is retained only as a deprecated alias to the
same BCS-decoded value. Simulation correctness therefore does not depend on gRPC/GraphQL/
JSON-RPC JSON field layouts.

The built-in configurations currently leave Gauge/Lock disabled because there is no
verified matching `ve33` and integration deployment. Applications must provide both a
valid `ve33` package/config and an integration package containing the Gauge/Lock modules
before using those APIs.

Live position and simulation verification is opt-in because it depends on current mainnet
state:

```bash
npm run verify:sui-v2
npm run test:sui-v2:live
```

The live command only calls gRPC reads and transaction simulation; it does not sign or
broadcast transactions.

Historical integration tests can sign and broadcast transactions. No signing credential
is included in the repository. These tests fail closed unless the required credential is
injected:

- `MAGMA_TEST_ACCOUNT_MNEMONIC` supplies the primary integration-test signer.
- `MAGMA_TEST_ACCOUNT_NEW_MNEMONIC` supplies the secondary integration-test signer.

Use dedicated, disposable test accounts and inject these variables through a shell or CI
secret store. Never reuse a production mnemonic, commit a populated `.env` file, or fund
these accounts with assets that must remain protected.

### TypeScript Doc

You can view this typescript sdk in
<a href="https://github.com/MagmaFinanceIO/magma_sdk_doc"><strong> Magma Development Documents. </strong></a>
<br />

## LICENSE

Magma-ts-SDK released under the Apache license. See the [LICENSE](./LICENSE) file for details.

## More About Magma

Use the following links to learn more about Magma:

- [ ] Learn more about working with Magma in the [Magma Documentation]().

- [ ] Join the Magma community on [Magma Discord]().
