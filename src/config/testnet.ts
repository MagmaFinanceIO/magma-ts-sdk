import { getFullnodeUrl } from '@mysten/sui/client'
import MagmaClmmSDK, { SdkOptions } from '../main'

const SDKConfig = {
  clmmConfig: {
    pools_id: '0xd7037b38ae757d7a69b61146b27c288600b9aefbffbf884b856881dff6a4f27b',
    global_config_id: '0x83baa8b07800029302f75ac6906240e86cf05066d37eedcabc61a0d6b6dc6eda',
    global_vault_id: '0xf78d2ee3c312f298882cb680695e5e8c81b1d441a646caccc058006c2851ddea',
    admin_cap_id: '0xa456f86a53fc31e1243f065738ff1fc93f5a62cc080ff894a0fb3747556a799b',
  },
  magmaConfig: {
    coin_list_id: '0x257eb2ba592a5480bba0a97d05338fab17cc3283f8df6998a0e12e4ab9b84478',
    launchpad_pools_id: '0xdc3a7bd66a6dcff73c77c866e87d73826e446e9171f34e1c1b656377314f94da',
    clmm_pools_id: '0x26c85500f5dd2983bf35123918a144de24e18936d0b234ef2b49fbb2d3d6307d',
    admin_cap_id: '0xd328ff427794b8ca0a69c3ebb0c0e4d2e81267ec4ba36e11487362c6508a4c0f',
    coin_list_handle: '0x3204350fc603609c91675e07b8f9ac0999b9607d83845086321fca7f469de235',
    launchpad_pools_handle: '0xae67ff87c34aceea4d28107f9c6c62e297a111e9f8e70b9abbc2f4c9f5ec20fd',
    clmm_pools_handle: '0xd28736923703342b4752f5ed8c2f2a5c0cb2336c30e1fed42b387234ce8408ec',
  },
  ve33Config: {
    // global_config_id: '0xbbe54f3c2bd06c5ab7f93950025bff6710c9a83836d7145636fea383b315774d',
    voter_id: '0x59571991a5c7041c4376d980061af5c7a6d8345006d6b5167bd1f00fc17b8ddb',
    voting_escrow_id: '0x9081c8044719135da4ff2d52907fcd40c19e2a40750cbba4c1d6a59610ae1446',
    reward_distributor_id: '0xdf213d8e0ca49c8f4a508e7d3b3a6983c4aafd639f7c99479fc75fb4451d752e',
    distribution_cfg: '0x94e23846c975e2faf89a61bfc2b10ad64decab9069eb1f9fc39752b010868c74',
    magma_token: '0x45ac2371c33ca0df8dc784d62c8ce5126d42edd8c56820396524dff2ae0619b1::magma_token::MAGMA_TOKEN',
    minter_id: '0x89435d6b2a510ba50ca23303f10e91ec058f138a88f69a43fe03cd22edb214c5',
  },
  almmConfig: {
    factory: '',
    rewarder_global_vault: '',
  },
}

export const clmmTestnet: SdkOptions = {
  fullRpcUrl: getFullnodeUrl('testnet'),
  magma_config: {
    package_id: '',
    published_at: '',
    config: SDKConfig.magmaConfig,
  },
  ve33: {
    package_id: '0x7ab45fbe01da26e07ba21757916d540c8747cf7daa88f3171e13db17373d5adc',
    published_at: '0x7ab45fbe01da26e07ba21757916d540c8747cf7daa88f3171e13db17373d5adc',
    config: SDKConfig.ve33Config,
  },
  clmm_pool: {
    package_id: '0xca1b84a430d03e22dae08a7273c8e9dcfdb40b7f559574105f008600eeb7b4bd',
    published_at: '0xca1b84a430d03e22dae08a7273c8e9dcfdb40b7f559574105f008600eeb7b4bd',
    config: SDKConfig.clmmConfig,
  },
  almm_pool: {
    package_id: '',
    published_at: '',
    config: SDKConfig.almmConfig,
  },
  distribution: {
    package_id: '0x45ac2371c33ca0df8dc784d62c8ce5126d42edd8c56820396524dff2ae0619b1',
    published_at: '0x45ac2371c33ca0df8dc784d62c8ce5126d42edd8c56820396524dff2ae0619b1',
  },
  integrate: {
    package_id: '0x975672d26fc9ba026a35f2001951fbcf5e37e75aca41db7c762d61b4e1e64986',
    published_at: '0x975672d26fc9ba026a35f2001951fbcf5e37e75aca41db7c762d61b4e1e64986',
  },

  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  faucet: {
    package_id: '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc',
    published_at: '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc',
  },
  deepbook: {
    package_id: '0x000000000000000000000000000000000000000000000000000000000000dee9',
    published_at: '0x000000000000000000000000000000000000000000000000000000000000dee9',
  },
  deepbook_endpoint_v2: {
    package_id: '0x56d90d0c055edb534b11e7548270bb458fd47c69b77bf40c14d5eb00e6e6cf64',
    published_at: '0x56d90d0c055edb534b11e7548270bb458fd47c69b77bf40c14d5eb00e6e6cf64',
  },
  aggregatorUrl: 'https://testnet.magmafinance.io/api/router',
  swapCountUrl: 'https://api-sui.devmagma.com/v2/sui/swap/count',
}

/**
 * Initialize the testnet SDK
 * @param fullNodeUrl. If provided, it will be used as the full node URL.
 * @param simulationAccount. If provided, it will be used as the simulation account address.
 * @returns
 */
export function initTestnetSDK(fullNodeUrl?: string, simulationAccount?: string): MagmaClmmSDK {
  if (fullNodeUrl) {
    clmmTestnet.fullRpcUrl = fullNodeUrl
  }
  if (simulationAccount) {
    clmmTestnet.simulationAccount.address = simulationAccount
  }
  return new MagmaClmmSDK(clmmTestnet)
}
