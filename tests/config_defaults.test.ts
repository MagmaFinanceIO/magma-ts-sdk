// Initialize the module graph before config imports to avoid the repository's historical ESM cycle in Jest.
import '../src/modules/positionModule'
import { clmmMainnet } from '../src/config/mainnet'
import { clmmTestnet } from '../src/config/testnet'

describe('built-in network config defaults', () => {
  test.each([
    ['mainnet', clmmMainnet],
    ['testnet', clmmTestnet],
  ])('keeps %s Gauge/Lock packages disabled until current ve33 deployments are configured', (_network, config) => {
    expect(config.ve33?.package_id).toBe('')
    expect(config.ve33?.published_at).toBe('')
  })
})
