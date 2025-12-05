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
    factory: '0xedb456e93e423dd75a8ddebedd9974bb661195043027e32ce01649d6ccee74cf',
    rewarder_global_vault: '0xe039c948f91be3ddcb1cb5b7ecea6fa63997898faeac1d94239298e54f8d953e',
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
    package_id: '0x532bf64e6f0bf702353387d53a28a3239249f47c39d58954f2c0a1f9f4436c20',
    published_at: '0x8800c3f7496a09dd62b0850b178b73ada2aeaf34d076dcd1c1bbd0da0015550d',
    config: SDKConfig.almmConfig,
  },
  clmm_pool: {
    package_id: '0x4a35d3dfef55ed3631b7158544c6322a23bc434fe4fca1234cb680ce0505f82d',
    published_at: '0x183af2adf115f331105825ae63e1d7d3c848d67beb4d60bc36208a90a5e92f4b',
    config: SDKConfig.clmmConfig,
  },
  integrate: {
    package_id: '0xcd23d8f0a6e8b67d25499a722a4c989c6d01b97dee10f8c354bfbd42a6b3ebd9',
    published_at: '0x4a9d6fb6f34ca8918756c2dfddf8f0a7fd5ef590bcffa6c03db24a6f10f42c5e',
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
