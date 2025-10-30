import { getFullnodeUrl } from '@mysten/sui/client'
import MagmaClmmSDK, { SdkOptions } from '../main'


const SDKConfig = {
  clmmConfig: {
    pools_id: '0xfa145b9de10fe858be81edd1c6cdffcf27be9d016de02a1345eb1009a68ba8b2',
    global_config_id: '0x4c4e1402401f72c7d8533d0ed8d5f8949da363c7a3319ccef261ffe153d32f8a',
    global_vault_id: '0xa7e1102f222b6eb81ccc8a126e7feb2353342be9df6f6646a77c4519da29c071',
    admin_cap_id: '',
  },
  magmaConfig: {
  },
  almmConfig: {
    factory: '0x29999aadee09eb031cc98a73b605805306d6ae0fe9d5099fb9e6628d99527234',
    rewarder_global_vault: '0x8dad571fa854177a599b41571057bed93579739190ad4c2ab4b66df847a919d9',
  }
}

// mainnet
export const clmmMainnet: SdkOptions = {
  fullRpcUrl: getFullnodeUrl('mainnet'),
  simulationAccount: {
    address: '0x326ce9894f08dcaa337fa232641cc34db957aec9ff6614c1186bc9a7508df0bb',
  },
  magma_config: {
    package_id: '0x95b8d278b876cae22206131fb9724f701c9444515813042f54f0a426c9a3bc2f',
    published_at: '0x95b8d278b876cae22206131fb9724f701c9444515813042f54f0a426c9a3bc2f',
    //@ts-ignore
    config: SDKConfig.magmaConfig,
  },
  almm_pool: {
    package_id: '0xc7f4524aad685d7a334b559aea1a1464287a2a62d571243be1877ef53e2a916b',
    published_at: '0xa8b3dbe60b27160e2267c237759dd26f1dfe04e3f2d7cb0fc235a1497bdbfc09',
    config: SDKConfig.almmConfig,
  },
  clmm_pool: {
    package_id: '0x4a35d3dfef55ed3631b7158544c6322a23bc434fe4fca1234cb680ce0505f82d',
    published_at: '0x183af2adf115f331105825ae63e1d7d3c848d67beb4d60bc36208a90a5e92f4b',
    config: SDKConfig.clmmConfig,
  },
  integrate: {
    package_id: '0x3e5412c072c805249ad38d62e5b773d4f77e85698eaff35952c988496b92481b',
    published_at: '0x7c369062640451c79e4e8ef7540df7540d88a002d04c91ee37c771997739963f',
  },
  deepbook: {
    package_id: '0x000000000000000000000000000000000000000000000000000000000000dee9',
    published_at: '0x000000000000000000000000000000000000000000000000000000000000dee9',
  },
  deepbook_endpoint_v2: {
    package_id: '0xac95e8a5e873cfa2544916c16fe1461b6a45542d9e65504c1794ae390b3345a7',
    published_at: '0xac95e8a5e873cfa2544916c16fe1461b6a45542d9e65504c1794ae390b3345a7',
  },
  aggregatorUrl: 'https://app.magmafinance.io/api/router/find_routes',
}

/**
 * Initialize the mainnet SDK
 * @param fullNodeUrl. If provided, it will be used as the full node URL.
 * @param simulationAccount. If provided, it will be used as the simulation account address.
 * @returns
 */
export function initMainnetSDK(fullNodeUrl?: string, simulationAccount?: string): MagmaClmmSDK {
  if (fullNodeUrl) {
    clmmMainnet.fullRpcUrl = fullNodeUrl
  }
  if (simulationAccount) {
    clmmMainnet.simulationAccount.address = simulationAccount
  }
  return new MagmaClmmSDK(clmmMainnet)
}
