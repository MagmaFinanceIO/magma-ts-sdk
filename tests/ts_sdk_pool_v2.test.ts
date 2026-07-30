import { jest } from '@jest/globals'
import type { SuiGrpcClient } from '@mysten/sui/grpc'
// Initialize the historical module graph before SDK construction to avoid the repository's ESM cycle in Jest.
import '../src/modules/positionModule'
import { MagmaClmmSDK, type SdkOptions } from '../src/sdk'

const id = (digit: string) => `0x${digit.repeat(64)}`

const OWNER = id('1')
const COIN_A = `${id('2')}::coin_a::COIN_A`
const COIN_B = `${id('3')}::coin_b::COIN_B`
const METADATA_A = id('4')
const METADATA_B = id('5')

function packageConfig(packageId: string) {
  return {
    package_id: packageId,
    published_at: packageId,
  }
}

function buildSdk(): MagmaClmmSDK {
  const options: SdkOptions = {
    network: 'mainnet',
    suiGrpcClient: {} as SuiGrpcClient,
    simulationAccount: { address: OWNER },
    magma_config: packageConfig(id('6')),
    ve33: packageConfig(id('7')),
    clmm_pool: {
      ...packageConfig(id('8')),
      config: {
        pools_id: id('9'),
        global_config_id: id('a'),
        global_vault_id: id('b'),
        admin_cap_id: id('c'),
      },
    },
    almm_pool: packageConfig(id('d')),
    distribution: packageConfig(id('e')),
    integrate: packageConfig(id('f')),
    deepbook: packageConfig(id('1')),
    deepbook_endpoint_v2: packageConfig(id('2')),
    aggregatorUrl: 'https://example.com/router',
  }
  const sdk = new MagmaClmmSDK(options)
  sdk.senderAddress = OWNER
  jest.spyOn(sdk, 'getOwnerCoinAssets').mockResolvedValue([])
  return sdk
}

function unresolvedObjectId(data: any, argument: any): string | undefined {
  if (argument?.$kind !== 'Input') return undefined
  return data.inputs[argument.Input]?.UnresolvedObject?.objectId
}

describe('magma-ts-sdk CLMM v2 transaction compatibility', () => {
  test('keeps metadata paired with canonical coin types in create_pool_v2', async () => {
    const sdk = buildSdk()
    const metadataByCoin = new Map([
      [COIN_A, METADATA_A],
      [COIN_B, METADATA_B],
    ])

    const transaction = await sdk.Pool.createPoolTransactionPayload({
      tick_spacing: 2,
      initialize_sqrt_price: '1',
      uri: '',
      fix_amount_a: true,
      amount_a: '0',
      amount_b: '0',
      coinTypeA: COIN_B,
      coinTypeB: COIN_A,
      slippage: 0,
      metadata_a: METADATA_B,
      metadata_b: METADATA_A,
      tick_lower: -1,
      tick_upper: 1,
    })

    const data = transaction.getData() as any
    const createPool = data.commands.find((command: any) => command.MoveCall?.module === 'pool_creator_v2')?.MoveCall

    expect(createPool?.function).toBe('create_pool_v2')
    expect(createPool?.typeArguments).toHaveLength(2)
    expect(unresolvedObjectId(data, createPool.arguments[9])).toBe(metadataByCoin.get(createPool.typeArguments[0]))
    expect(unresolvedObjectId(data, createPool.arguments[10])).toBe(metadataByCoin.get(createPool.typeArguments[1]))

    const transfers = data.commands.filter(
      (command: any) => command.MoveCall?.module === 'utils' && command.MoveCall?.function === 'transfer_coin_to_sender'
    )
    expect(transfers).toHaveLength(2)
  })
})
