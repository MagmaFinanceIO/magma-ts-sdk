import { buildSdk } from './data/init_test_data'
import 'isomorphic-fetch'

const sdk = buildSdk()

describe('sdk config', () => {
  test('clmmConfig', async () => {
    try {
      const clmmConfig = await sdk.Pool.getClmmConfigs()
      console.log('clmmConfig ', clmmConfig)
    } catch (error) {
      console.log(error)
    }
  })

  test('magmaConfig', async () => {
    try {
      const magmaConfig = await sdk.MagmaConfig.getMagmaConfig()
      console.log('magmaConfig: ', magmaConfig)
    } catch (error) {
      console.log(error)
    }
  })
})

describe('warp sdk config', () => {
  const config = sdk.sdkOptions
  test('sdk Config', async () => {
    const sdkOptions = sdk.sdkOptions
    try {
      if (sdkOptions.clmm_pool.package_id.length > 0) {
        const initEvent = await sdk.Pool.getClmmConfigs()
        config.clmm_pool.config = initEvent
      }
    } catch (error) {
      console.log('clmmConfig', error)
    }

    try {
      if (sdkOptions.magma_config.package_id.length > 0) {
        const magmaConfig = await sdk.MagmaConfig.getMagmaConfig()
        config.magma_config.config = magmaConfig
      }
    } catch (error) {
      console.log('tokenConfig', error)
    }
    console.log(config)
  })
})
