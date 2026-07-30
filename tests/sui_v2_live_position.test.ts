import { jest } from '@jest/globals'
import { Transaction } from '@mysten/sui/transactions'
// Initialize the module graph before sdk.ts to avoid the repository's historical ESM cycle in Jest.
import '../src/modules/positionModule'
import { clmmMainnet } from '../src/config/mainnet'
import { MagmaClmmSDK } from '../src/sdk'
import { DeepbookUtils } from '../src/utils/deepbook-utils'

const describeLive = process.env.RUN_LIVE_SUI_TESTS === '1' ? describe : describe.skip

const POSITION_ID = '0x0cdb8b21de4d480a0b078dad4714373948781743bde5d03fae5b9b0887ad1fbe'
const POSITION_OWNER = '0x8da408d84f4b57cf223b93aac93b7c415c6dce6999deb96e483df66ffb453525'
const POSITION_TYPE_PACKAGE = '0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb'
const CLMM_LATEST_PACKAGE = '0x25ebb9a7c50eb17b3fa9c5a30fb8b5ad8f97caaf4928943acbcff7153dfee5e3'
const CLMM_GLOBAL_CONFIG = '0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f'
const INTEGRATION_ORIGINAL_PACKAGE = '0x996c4d9480708fb8b92aa7acf819fb0497b5ec8e65ba06601cae2fb6db3312c3'
const INTEGRATION_LATEST_PACKAGE = '0xae9c208cf58fd5ba36737c9ee5dcfa7f152d0fb5a5a99eebb7c881ebc2fe59e0'
const POOL_ID = '0xcf994611fd4c48e277ce3ffd4d4364c914af2c3cbb05f7bf6facd371de688630'

const ALMM_PAIR_ID = '0x8dc75ae5626343abe72c34b64e990e96fb1f4ec0aeb3b115233dfac8dc5e1a0c'
const USDC = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'
const SUI = '0x2::sui::SUI'
const DEEPBOOK_SUI_USDC_POOL = '0x7f526b1263c4b91b43c9e646419b5696f424de28dda3c1e6658cc0a54558baa7'
const DEEPBOOK_USDC = '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN'
const MAGMA_CLMM_POOL = '0x1e7a125ff361238148935c3248e688c7850e6dbd79cb422d4332267c5a44c959'
const MAGMA_CLMM_COIN_A = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'
const MAGMA_CLMM_COIN_B = '0x3a304c7feba2d819ea57c3542d68439ca2c386ba02159c740f7b406e592c62ea::haedal::HAEDAL'

function buildLiveSdk(positionTypePackage = clmmMainnet.clmm_pool.package_id) {
  return new MagmaClmmSDK({
    ...clmmMainnet,
    jsonRpcUrl: undefined,
    simulationAccount: { address: POSITION_OWNER },
    clmm_pool: {
      ...clmmMainnet.clmm_pool,
      package_id: positionTypePackage,
      published_at: CLMM_LATEST_PACKAGE,
      config: {
        ...clmmMainnet.clmm_pool.config!,
        global_config_id: CLMM_GLOBAL_CONFIG,
      },
    },
    integrate: {
      package_id: INTEGRATION_ORIGINAL_PACKAGE,
      published_at: INTEGRATION_LATEST_PACKAGE,
    },
  })
}

describeLive('Sui v2 live position and BCS simulation', () => {
  jest.setTimeout(120_000)

  test('reads an existing position and finds it by owner using only gRPC', async () => {
    const sdk = buildLiveSdk(POSITION_TYPE_PACKAGE)
    const position = await sdk.Position.getPositionById(POSITION_ID, false)
    const owned = await sdk.Position.getPositionList(POSITION_OWNER)

    expect(position).toMatchObject({
      pos_object_id: POSITION_ID,
      owner: POSITION_OWNER,
      pool: POOL_ID,
    })
    expect(position.coin_type_a).toMatch(/^0x/)
    expect(position.coin_type_b).toMatch(/^0x/)
    expect(owned.some((item) => item.pos_object_id === POSITION_ID)).toBe(true)
  })

  test('simulates position fees and consumes BCS-decoded event data', async () => {
    const sdk = buildLiveSdk()
    const position = await sdk.Position.getPositionById(POSITION_ID, false)
    const fees = await sdk.Position.fetchPosFeeAmount([{
      poolAddress: POOL_ID,
      positionId: POSITION_ID,
      coinTypeA: position.coin_type_a,
      coinTypeB: position.coin_type_b,
    }])

    expect(fees).toHaveLength(1)
    expect(fees[0].position_id).toBe(POSITION_ID)
    expect(fees[0].feeOwedA.isNeg()).toBe(false)
    expect(fees[0].feeOwedB.isNeg()).toBe(false)
  })

  test('classifies a live failed devInspect as simulation failure without submitting a transaction', async () => {
    const sdk = buildLiveSdk()
    const position = await sdk.Position.getPositionById(POSITION_ID, false)
    const tx = new Transaction()

    tx.moveCall({
      target: `${INTEGRATION_LATEST_PACKAGE}::fetcher_script::fetch_position_fees`,
      arguments: [
        tx.object(CLMM_GLOBAL_CONFIG),
        tx.object(POOL_ID),
        tx.pure.address(POSITION_OWNER),
      ],
      typeArguments: [position.coin_type_a, position.coin_type_b],
    })

    const result = await sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: POSITION_OWNER,
    })

    expect(result.error?.code).toBe('SIMULATION_FAILED')
    expect(result.effects?.status?.success).toBe(false)
  })

  test('simulates CLMM ticks with nested on-chain BCS datatypes', async () => {
    const sdk = buildLiveSdk()
    const position = await sdk.Position.getPositionById(POSITION_ID, false)
    const ticks = await (sdk.Pool as any).getTicks({
      pool_id: POOL_ID,
      coinTypeA: position.coin_type_a,
      coinTypeB: position.coin_type_b,
      start: [],
      limit: 3,
    })

    expect(ticks.length).toBeGreaterThan(0)
    expect(Number.isInteger(ticks[0].index)).toBe(true)
  })

  test('simulates a current Magma ALMM event with a nested on-chain BCS schema', async () => {
    const sdk = new MagmaClmmSDK({
      ...clmmMainnet,
      jsonRpcUrl: undefined,
      simulationAccount: { address: POSITION_OWNER },
    })
    const params = await sdk.Almm.fetchPairParams({
      pair: ALMM_PAIR_ID,
      coinTypeA: USDC,
      coinTypeB: SUI,
    })

    expect(params.base_factor).toBeGreaterThan(0)
    expect(params.active_index).toBeGreaterThan(0)
  })

  test('simulates a CLMM swap quote and consumes its BCS-decoded event', async () => {
    const sdk = new MagmaClmmSDK({
      ...clmmMainnet,
      jsonRpcUrl: undefined,
      simulationAccount: { address: POSITION_OWNER },
    })
    const quote = await sdk.Swap.preswap({
      pool: { poolAddress: MAGMA_CLMM_POOL },
      currentSqrtPrice: 1,
      decimalsA: 6,
      decimalsB: 9,
      a2b: false,
      byAmountIn: true,
      amount: '1000',
      coinTypeA: MAGMA_CLMM_COIN_A,
      coinTypeB: MAGMA_CLMM_COIN_B,
    } as any)

    expect(quote).not.toBeNull()
    expect(quote?.poolAddress).toBe(MAGMA_CLMM_POOL)
    expect(quote?.estimatedAmountOut).toMatch(/^\d+$/)
  })

  test('simulates a Deepbook query and decodes the live BookStatus event', async () => {
    const orders = await DeepbookUtils.getPoolAsks(
      buildLiveSdk() as any,
      DEEPBOOK_SUI_USDC_POOL,
      SUI,
      DEEPBOOK_USDC
    )

    expect(Array.isArray(orders)).toBe(true)
    orders.forEach((order) => {
      expect(Number.isFinite(order.price)).toBe(true)
      expect(Number.isFinite(order.quantity)).toBe(true)
    })
  })
})
