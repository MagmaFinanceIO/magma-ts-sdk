// Initialize the module graph before config imports to avoid the repository's historical ESM cycle in Jest.
import '../src/modules/positionModule'
import { clmmMainnet } from '../src/config/mainnet'
import { clmmTestnet } from '../src/config/testnet'

describe('built-in network config defaults', () => {
  test('uses the final May 2026 CLMM and integration deployments on mainnet', () => {
    expect(clmmMainnet.clmm_pool).toMatchObject({
      package_id: '0x4a35d3dfef55ed3631b7158544c6322a23bc434fe4fca1234cb680ce0505f82d',
      published_at: '0x0acd1d187950450ae3e625375f8067a7802e99a05b6e655e1fec124a0e3c891e',
    })
    expect(clmmMainnet.integrate).toEqual({
      package_id: '0x668909f9f30380dd1b63834534dc2bd19b274e6312a0dfa9be0ee5b0cef73446',
      published_at: '0x668909f9f30380dd1b63834534dc2bd19b274e6312a0dfa9be0ee5b0cef73446',
    })
  })

  test.each([
    ['mainnet', clmmMainnet],
    ['testnet', clmmTestnet],
  ])('keeps %s Gauge/Lock packages disabled until current ve33 deployments are configured', (_network, config) => {
    expect(config.ve33?.package_id).toBe('')
    expect(config.ve33?.published_at).toBe('')
  })
})
