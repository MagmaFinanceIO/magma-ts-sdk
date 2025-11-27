<a name="readme-top"></a>

![npm](https://img.shields.io/npm/v/%40magmaprotocol%2Fmagma-ts-sdk?logo=npm&logoColor=rgb)
![GitHub Repo stars](https://img.shields.io/github/stars/MagmaFinanceIO/magma_clmm_sdk?logo=github)

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
npm i @magmaprotocol/magma-ts-sdk
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

const network = 'mainnnet'
const fullNodeUrl = 'https://...'
const simulationAccount = '0x...'
const magmaClmmSDK = initMagmaSDK({ network, fullNodeUrl, simulationAccount })
```

Now, you can start using Magma SDK.

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
