import { getFullnodeUrl } from '@mysten/sui/client'
import MagmaClmmSDK, { SdkOptions } from '../main'

const SDKConfig = {
  clmmConfig: {
    pools_id: '0xfa145b9de10fe858be81edd1c6cdffcf27be9d016de02a1345eb1009a68ba8b2',
    // clmm and almm both use this global_config
    global_config_id: '0x4c4e1402401f72c7d8533d0ed8d5f8949da363c7a3319ccef261ffe153d32f8a',
    global_vault_id: '0xa7e1102f222b6eb81ccc8a126e7feb2353342be9df6f6646a77c4519da29c071',
    admin_cap_id: '0x89c1a321291d15ddae5a086c9abc533dff697fde3d89e0ca836c41af73e36a75',
  },
  magmaConfig: {
    coin_list_id: '0x8cbc11d9e10140db3d230f50b4d30e9b721201c0083615441707ffec1ef77b23',
    launchpad_pools_id: '0x1098fac992eab3a0ab7acf15bb654fc1cf29b5a6142c4ef1058e6c408dd15115',
    clmm_pools_id: '0x15b6a27dd9ae03eb455aba03b39e29aad74abd3757b8e18c0755651b2ae5b71e',
    admin_cap_id: '0x39d78781750e193ce35c45ff32c6c0c3f2941fa3ddaf8595c90c555589ddb113',
    coin_list_handle: '0x49136005e90e28c4695419ed4194cc240603f1ea8eb84e62275eaff088a71063',
    launchpad_pools_handle: '0x5e194a8efcf653830daf85a85b52e3ae8f65dc39481d54b2382acda25068375c',
    clmm_pools_handle: '0x37f60eb2d9d227949b95da8fea810db3c32d1e1fa8ed87434fc51664f87d83cb',
  },
  ve33Config: {
    voter_id: '0xaab0f3a90da96d29d743e09c269e1ae48ec1bae52a28cd38c49c5dc8c1bf92b8',
    voting_escrow_id: '0x7ab45fbe01da26e07ba21757916d540c8747cf7daa88f3171e13db17373d5adc',
    reward_distributor_id: '0x9f4f882245e49fd9213278dfbcb63a14fdbdd2ce7e25e9353a0cecdca30de853',
    distribution_cfg: '0xaff8d151ac29317201151f97d28c546b3c5923d8cfc5499f40dea61c4022c949',
    magma_token: '0x7161c6c6bb65f852797c8f7f5c4f8d57adaf796e1b840921f9e23fabeadfd54e::magma::MAGMA',
    minter_id: '0x4fa5766cd83b33b215b139fec27ac344040f3bbd84fcbee7b61fc671aadc51fa',
  },
  almmConfig: {
    factory: '',
    rewarder_global_vault: '',
  },
  gaugeConfig: {},
}

// mainnet
export const clmmMainnet: SdkOptions = {
  fullRpcUrl: getFullnodeUrl('mainnet'),
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  ve33: {
    package_id: '0x7ab45fbe01da26e07ba21757916d540c8747cf7daa88f3171e13db17373d5adc',
    published_at: '0x7ab45fbe01da26e07ba21757916d540c8747cf7daa88f3171e13db17373d5adc',
    config: SDKConfig.ve33Config,
  },
  magma_config: {
    package_id: '0x95b8d278b876cae22206131fb9724f701c9444515813042f54f0a426c9a3bc2f',
    published_at: '0x95b8d278b876cae22206131fb9724f701c9444515813042f54f0a426c9a3bc2f',
    config: SDKConfig.magmaConfig,
  },
  clmm_pool: {
    package_id: '0x4a35d3dfef55ed3631b7158544c6322a23bc434fe4fca1234cb680ce0505f82d',
    published_at: '0x4a35d3dfef55ed3631b7158544c6322a23bc434fe4fca1234cb680ce0505f82d',
    config: SDKConfig.clmmConfig,
  },
  almm_pool: {
    package_id: '0xc7f4524aad685d7a334b559aea1a1464287a2a62d571243be1877ef53e2a916b',
    published_at: '0xa8b3dbe60b27160e2267c237759dd26f1dfe04e3f2d7cb0fc235a1497bdbfc09',
    config: SDKConfig.almmConfig,
  },
  distribution: {
    package_id: '0xee4a1f231dc45a303389998fe26c4e39278cf68b404b32e4f0b9769129b8267b',
    published_at: '0xee4a1f231dc45a303389998fe26c4e39278cf68b404b32e4f0b9769129b8267b',
  },
  integrate: {
    package_id: '0x7c369062640451c79e4e8ef7540df7540d88a002d04c91ee37c771997739963f',
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
  aggregatorUrl: 'https://api.magmafinance.io/api/router',
  swapCountUrl: 'https://api.magmafinance.io/api/v2/sui/swap/count',
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
