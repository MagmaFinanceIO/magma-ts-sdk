import { jest } from '@jest/globals'
import BN from 'bn.js'
import { Transaction } from '@mysten/sui/transactions'
import { AlmmModule } from '../src/modules/almm'
import { GaugeModule } from '../src/modules/gaugeModule'
import { LockModule } from '../src/modules/lockModule'
import { PoolModule } from '../src/modules/poolModule'
import { PositionModule } from '../src/modules/positionModule'
import { RewarderModule } from '../src/modules/rewarderModule'
import { RouterModule } from '../src/modules/routerModule'
import { SwapModule } from '../src/modules/swapModule'
import { TokenModule } from '../src/modules/tokenModule'
import { DeepbookUtils } from '../src/utils/deepbook-utils'

const PACKAGE_ID = `0x${'1'.repeat(64)}`
const OWNER = `0x${'2'.repeat(64)}`
const POOL_ID = `0x${'3'.repeat(64)}`
const POSITION_ID = `0x${'4'.repeat(64)}`
const COIN_A = '0x2::sui::SUI'
const COIN_B = `${PACKAGE_ID}::coin_b::COIN_B`

const failedSimulation = {
  error: { code: 'SIMULATION_FAILED', message: 'Transaction simulation failed' },
  effects: {
    status: {
      success: false,
      error: { command: 0, kind: 'MoveAbort', abortCode: '42', location: `${PACKAGE_ID}::fetcher_script` },
    },
  },
  events: [],
}

const successfulNoEvents = {
  error: null,
  effects: { status: { success: true, error: null } },
  events: [],
}

function successfulEvent(eventName: string, parsedBcs: Record<string, unknown>) {
  return {
    error: null,
    effects: { status: { success: true, error: null } },
    events: [
      {
        type: `${PACKAGE_ID}::fetcher_script::${eventName}`,
        parsedBcs,
        parsedJson: parsedBcs,
      },
    ],
  }
}

function buildSdk(overrides: Record<string, unknown> = {}) {
  return {
    senderAddress: OWNER,
    sdkOptions: {
      simulationAccount: { address: OWNER },
      clmm_pool: {
        package_id: PACKAGE_ID,
        published_at: PACKAGE_ID,
        config: {
          global_config_id: POOL_ID,
        },
      },
      integrate: {
        package_id: PACKAGE_ID,
        published_at: PACKAGE_ID,
      },
      token: {
        package_id: PACKAGE_ID,
        published_at: PACKAGE_ID,
        config: {
          coin_registry_id: POOL_ID,
          pool_registry_id: POOL_ID,
        },
      },
      deepbook: {
        package_id: PACKAGE_ID,
        published_at: PACKAGE_ID,
      },
      deepbook_endpoint_v2: {
        package_id: PACKAGE_ID,
        published_at: PACKAGE_ID,
      },
    },
    fullClient: {
      devInspectTransactionBlock: jest.fn(async () => failedSimulation),
      getOwnedObjectsByPage: jest.fn(async () => ({ data: [], hasNextPage: false, nextCursor: null })),
    },
    getOwnerCoinAssets: jest.fn(async () => []),
    ...overrides,
  }
}

function buildSdkWithSimulation(simulationResult: Record<string, unknown>) {
  return buildSdk({
    fullClient: {
      devInspectTransactionBlock: jest.fn(async () => simulationResult),
      getOwnedObjectsByPage: jest.fn(async () => ({ data: [], hasNextPage: false, nextCursor: null })),
    },
  })
}

function buildSdkForAllConsumers(simulationResult: Record<string, unknown>) {
  const packageConfig = {
    package_id: PACKAGE_ID,
    published_at: PACKAGE_ID,
  }
  return buildSdk({
    sdkOptions: {
      simulationAccount: { address: OWNER },
      integrate: packageConfig,
      almm_pool: packageConfig,
      clmm_pool: {
        ...packageConfig,
        config: {
          global_config_id: POOL_ID,
        },
      },
      ve33: {
        ...packageConfig,
        config: {
          distribution_cfg: PACKAGE_ID,
          magma_token: COIN_A,
          minter_id: PACKAGE_ID,
          reward_distributor_id: PACKAGE_ID,
          voter_id: PACKAGE_ID,
          voting_escrow_id: PACKAGE_ID,
        },
      },
      token: {
        ...packageConfig,
        config: {
          coin_registry_id: POOL_ID,
          pool_registry_id: POOL_ID,
        },
      },
      deepbook: packageConfig,
      deepbook_endpoint_v2: packageConfig,
    },
    fullClient: {
      devInspectTransactionBlock: jest.fn(async () => simulationResult),
      getOwnedObjectsByPage: jest.fn(async () => ({ data: [], hasNextPage: false, nextCursor: null })),
    },
  })
}

type ConsumerCase = [name: string, run: (simulationResult: Record<string, unknown>) => Promise<unknown>]

const previouslyUncoveredConsumerCases: ConsumerCase[] = [
  [
    'ALMM.fetchBins',
    async (simulationResult) => {
      const almm = new AlmmModule(buildSdkForAllConsumers(simulationResult) as any)
      return almm.fetchBins({
        pair: POOL_ID,
        offset: 0,
        limit: 1,
        coinTypeA: COIN_A,
        coinTypeB: COIN_B,
      })
    },
  ],
  [
    'ALMM.getUserPositionInfo',
    async (simulationResult) => {
      const almm = new AlmmModule(buildSdkForAllConsumers(simulationResult) as any)
      jest.spyOn(almm, 'getPoolInfo').mockResolvedValue([
        {
          pool_id: POOL_ID,
          coin_a: COIN_A,
          coin_b: COIN_B,
        } as any,
      ])
      jest.spyOn(almm, 'getPairRewarders').mockResolvedValue(new Map())
      return (almm as any).getUserPositionInfo([
        {
          pos_object_id: POSITION_ID,
          owner: OWNER,
          pool: POOL_ID,
          type: `${PACKAGE_ID}::almm_position::Position`,
          bin_real_ids: [],
        },
      ])
    },
  ],
  [
    'ALMM._parsePositionLiquidity',
    async (simulationResult) => {
      const almm = new AlmmModule(buildSdkForAllConsumers(simulationResult) as any)
      return (almm as any)._parsePositionLiquidity(new Transaction())
    },
  ],
  [
    'ALMM.getPairLiquidity',
    async (simulationResult) => {
      const almm = new AlmmModule(buildSdkForAllConsumers(simulationResult) as any)
      return almm.getPairLiquidity({
        pair: POOL_ID,
        coinTypeA: COIN_A,
        coinTypeB: COIN_B,
      })
    },
  ],
  [
    'ALMM._parseEarnedFees',
    async (simulationResult) => {
      const almm = new AlmmModule(buildSdkForAllConsumers(simulationResult) as any)
      return (almm as any)._parseEarnedFees(new Transaction())
    },
  ],
  [
    'ALMM._parseEarnedRewards',
    async (simulationResult) => {
      const almm = new AlmmModule(buildSdkForAllConsumers(simulationResult) as any)
      return (almm as any)._parseEarnedRewards(new Transaction())
    },
  ],
  [
    'ALMM._parsePairRewarders',
    async (simulationResult) => {
      const almm = new AlmmModule(buildSdkForAllConsumers(simulationResult) as any)
      return (almm as any)._parsePairRewarders(new Transaction())
    },
  ],
  [
    'Gauge.getUserStakedPositionInfoOfPool',
    async (simulationResult) => {
      const gauge = new GaugeModule(buildSdkForAllConsumers(simulationResult) as any)
      return gauge.getUserStakedPositionInfoOfPool(OWNER, POOL_ID, PACKAGE_ID, COIN_A, COIN_B)
    },
  ],
  [
    'Gauge.getEmissions',
    async (simulationResult) => {
      const gauge = new GaugeModule(buildSdkForAllConsumers(simulationResult) as any)
      return gauge.getEmissions()
    },
  ],
  [
    'Gauge.getEpochRewardByPool',
    async (simulationResult) => {
      const gauge = new GaugeModule(buildSdkForAllConsumers(simulationResult) as any)
      return gauge.getEpochRewardByPool(POOL_ID, [COIN_B])
    },
  ],
  [
    'Lock._parseLockSummary',
    async (simulationResult) => {
      const lock = new LockModule(buildSdkForAllConsumers(simulationResult) as any)
      return lock._parseLockSummary(new Transaction())
    },
  ],
  [
    'Lock.allLockSummary',
    async (simulationResult) => {
      const lock = new LockModule(buildSdkForAllConsumers(simulationResult) as any)
      return lock.allLockSummary()
    },
  ],
  [
    'Lock.poolWeights',
    async (simulationResult) => {
      const lock = new LockModule(buildSdkForAllConsumers(simulationResult) as any)
      return lock.poolWeights([POOL_ID])
    },
  ],
  [
    'Lock._parseVotingFeeRewardTokens',
    async (simulationResult) => {
      const lock = new LockModule(buildSdkForAllConsumers(simulationResult) as any)
      return lock._parseVotingFeeRewardTokens(new Transaction())
    },
  ],
  [
    'Lock.getVotingFeeRewardTokens',
    async (simulationResult) => {
      const lock = new LockModule(buildSdkForAllConsumers(simulationResult) as any)
      return lock.getVotingFeeRewardTokens(POSITION_ID)
    },
  ],
  [
    'Lock._parseVotingBribeRewardTokens',
    async (simulationResult) => {
      const lock = new LockModule(buildSdkForAllConsumers(simulationResult) as any)
      return lock._parseVotingBribeRewardTokens(new Transaction())
    },
  ],
  [
    'Lock.getVotingBribeRewardTokens',
    async (simulationResult) => {
      const lock = new LockModule(buildSdkForAllConsumers(simulationResult) as any)
      return lock.getVotingBribeRewardTokens(POSITION_ID)
    },
  ],
  [
    'Lock._parseFeeRewards',
    async (simulationResult) => {
      const lock = new LockModule(buildSdkForAllConsumers(simulationResult) as any)
      return lock._parseFeeRewards(new Transaction())
    },
  ],
  [
    'Lock._getPoolFeeRewards',
    async (simulationResult) => {
      const lock = new LockModule(buildSdkForAllConsumers(simulationResult) as any)
      return lock._getPoolFeeRewards(POSITION_ID, COIN_A, COIN_B, new Map())
    },
  ],
  [
    'Lock._parseIncentiveRewards',
    async (simulationResult) => {
      const lock = new LockModule(buildSdkForAllConsumers(simulationResult) as any)
      return lock._parseIncentiveRewards(new Transaction())
    },
  ],
  [
    'Lock._getPoolIncentiveRewards',
    async (simulationResult) => {
      const lock = new LockModule(buildSdkForAllConsumers(simulationResult) as any)
      return lock._getPoolIncentiveRewards(POSITION_ID, [COIN_B], new Map())
    },
  ],
  [
    'Lock.getPoolBribeRewardTokens',
    async (simulationResult) => {
      const lock = new LockModule(buildSdkForAllConsumers(simulationResult) as any)
      return lock.getPoolBribeRewardTokens(POOL_ID)
    },
  ],
  [
    'Lock.getLockVotingStats',
    async (simulationResult) => {
      const lock = new LockModule(buildSdkForAllConsumers(simulationResult) as any)
      return lock.getLockVotingStats(POSITION_ID)
    },
  ],
  [
    'Pool.fetchPositionRewardList',
    async (simulationResult) => {
      const pool = new PoolModule(buildSdkForAllConsumers(simulationResult) as any)
      return pool.fetchPositionRewardList({
        pool_id: POOL_ID,
        coinTypeA: COIN_A,
        coinTypeB: COIN_B,
      })
    },
  ],
  [
    'Swap.preSwapWithMultiPool',
    async (simulationResult) => {
      const swap = new SwapModule(buildSdkForAllConsumers(simulationResult) as any)
      return swap.preSwapWithMultiPool({
        poolAddresses: [POOL_ID],
        a2b: true,
        byAmountIn: true,
        amount: '1',
        coinTypeA: COIN_A,
        coinTypeB: COIN_B,
      })
    },
  ],
]

describe('devInspect business consumers', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('Position.calculateFee propagates failed simulation instead of returning zero fees', async () => {
    const position = new PositionModule(buildSdk() as any)
    jest.spyOn(position, 'collectFeeTransactionPayload').mockResolvedValue(new Transaction())

    await expect(
      position.calculateFee({
        pool_id: POOL_ID,
        pos_id: POSITION_ID,
        coinTypeA: COIN_A,
        coinTypeB: COIN_B,
      } as any)
    ).rejects.toThrow(/SIMULATION_FAILED|simulation/i)
  })

  test('Rewarder.fetchPosFeeAmount propagates failed simulation instead of returning an empty list', async () => {
    const rewarder = new RewarderModule(buildSdk() as any)

    await expect(
      rewarder.fetchPosFeeAmount([
        {
          poolAddress: POOL_ID,
          positionId: POSITION_ID,
          coinTypeA: COIN_A,
          coinTypeB: COIN_B,
        },
      ])
    ).rejects.toThrow(/SIMULATION_FAILED|simulation/i)
  })

  test('Router.preRouterSwapA2B2C propagates failed simulation instead of returning null', async () => {
    const router = new RouterModule(buildSdk() as any)

    await expect(
      router.preRouterSwapA2B2C([
        {
          stepNums: 1,
          poolAB: POOL_ID,
          poolBC: undefined,
          a2b: true,
          b2c: undefined,
          byAmountIn: true,
          amount: new BN(1),
          coinTypeA: COIN_A,
          coinTypeB: COIN_B,
          coinTypeC: undefined,
        },
      ])
    ).rejects.toThrow(/SIMULATION_FAILED|simulation/i)
  })

  test('Token.getAllRegisteredTokenList propagates failed simulation instead of returning an empty list', async () => {
    const token = new TokenModule(buildSdk() as any)

    await expect(token.getAllRegisteredTokenList(true)).rejects.toThrow(/SIMULATION_FAILED|simulation/i)
  })

  test('Token.getAllRegisteredPoolList propagates failed simulation instead of returning an empty list', async () => {
    const token = new TokenModule(buildSdk() as any)

    await expect(token.getAllRegisteredPoolList(true)).rejects.toThrow(/SIMULATION_FAILED|simulation/i)
  })

  test('DeepbookUtils.getPoolAsks propagates failed simulation instead of returning an empty list', async () => {
    await expect(DeepbookUtils.getPoolAsks(buildSdk() as any, POOL_ID, COIN_A, COIN_B)).rejects.toThrow(/SIMULATION_FAILED|simulation/i)
  })

  test('DeepbookUtils.getPoolBids propagates failed simulation instead of returning an empty list', async () => {
    await expect(DeepbookUtils.getPoolBids(buildSdk() as any, POOL_ID, COIN_A, COIN_B)).rejects.toThrow(/SIMULATION_FAILED|simulation/i)
  })

  test('DeepbookUtils.simulateSwap propagates failed simulation instead of returning null', async () => {
    jest.spyOn(DeepbookUtils, 'getAccountCap').mockResolvedValue('')

    await expect(DeepbookUtils.simulateSwap(buildSdk() as any, POOL_ID, COIN_A, COIN_B, true, 0)).rejects.toThrow(
      /SIMULATION_FAILED|simulation/i
    )
  })

  test('Position.calculateFee rejects successful simulations that omit the collect-fee event', async () => {
    const position = new PositionModule(buildSdkWithSimulation(successfulNoEvents) as any)
    jest.spyOn(position, 'collectFeeTransactionPayload').mockResolvedValue(new Transaction())

    await expect(
      position.calculateFee({
        pool_id: POOL_ID,
        pos_id: POSITION_ID,
        coinTypeA: COIN_A,
        coinTypeB: COIN_B,
      } as any)
    ).rejects.toThrow(/CollectFeeEvent|simulation event|missing/i)
  })

  test('Position.fetchPosFeeAmount rejects successful simulations that omit fee events', async () => {
    const position = new PositionModule(buildSdkWithSimulation(successfulNoEvents) as any)

    await expect(
      position.fetchPosFeeAmount([
        {
          poolAddress: POOL_ID,
          positionId: POSITION_ID,
          coinTypeA: COIN_A,
          coinTypeB: COIN_B,
        },
      ])
    ).rejects.toThrow(/FetchPositionFeesEvent|simulation event|missing/i)
  })

  test('Position.fetchPosFeeAmount rejects an unexpected fee event count', async () => {
    const position = new PositionModule(
      buildSdkWithSimulation(
        successfulEvent('FetchPositionFeesEvent', {
          fee_owned_a: '1',
          fee_owned_b: '2',
          position_id: POSITION_ID,
        })
      ) as any
    )

    await expect(
      position.fetchPosFeeAmount([
        {
          poolAddress: POOL_ID,
          positionId: POSITION_ID,
          coinTypeA: COIN_A,
          coinTypeB: COIN_B,
        },
        {
          poolAddress: POOL_ID,
          positionId: OWNER,
          coinTypeA: COIN_A,
          coinTypeB: COIN_B,
        },
      ])
    ).rejects.toThrow(/unexpected event count/i)
  })

  test('Position.fetchPosFeeAmount parses successful BCS fee events', async () => {
    const position = new PositionModule(
      buildSdkWithSimulation(
        successfulEvent('FetchPositionFeesEvent', {
          fee_owned_a: '11',
          fee_owned_b: '22',
          position_id: POSITION_ID,
        })
      ) as any
    )

    await expect(
      position.fetchPosFeeAmount([
        {
          poolAddress: POOL_ID,
          positionId: POSITION_ID,
          coinTypeA: COIN_A,
          coinTypeB: COIN_B,
        },
      ])
    ).resolves.toEqual([
      {
        feeOwedA: new BN(11),
        feeOwedB: new BN(22),
        position_id: POSITION_ID,
      },
    ])
  })

  test('Rewarder.fetchPosFeeAmount rejects successful simulations that omit fee events', async () => {
    const rewarder = new RewarderModule(buildSdkWithSimulation(successfulNoEvents) as any)

    await expect(
      rewarder.fetchPosFeeAmount([
        {
          poolAddress: POOL_ID,
          positionId: POSITION_ID,
          coinTypeA: COIN_A,
          coinTypeB: COIN_B,
        },
      ])
    ).rejects.toThrow(/FetchPositionFeesEvent|simulation event|missing/i)
  })

  test('Rewarder.fetchPosRewardersAmount rejects successful simulations that omit reward events', async () => {
    const rewarder = new RewarderModule(buildSdkWithSimulation(successfulNoEvents) as any)

    await expect(
      rewarder.fetchPosRewardersAmount([
        {
          poolAddress: POOL_ID,
          positionId: POSITION_ID,
          coinTypeA: COIN_A,
          coinTypeB: COIN_B,
          rewarderInfo: [
            {
              coinAddress: COIN_B,
              emissions_per_second: 0,
              growth_global: 0,
              emissionsEveryDay: 0,
            },
          ],
        },
      ])
    ).rejects.toThrow(/FetchPositionRewardsEvent|simulation event|missing/i)
  })

  test('Rewarder.fetchPosRewardersAmount parses successful BCS reward events', async () => {
    const rewarder = new RewarderModule(
      buildSdkWithSimulation(
        successfulEvent('FetchPositionRewardsEvent', {
          data: ['33'],
        })
      ) as any
    )

    await expect(
      rewarder.fetchPosRewardersAmount([
        {
          poolAddress: POOL_ID,
          positionId: POSITION_ID,
          coinTypeA: COIN_A,
          coinTypeB: COIN_B,
          rewarderInfo: [
            {
              coinAddress: COIN_B,
              emissions_per_second: 0,
              growth_global: 0,
              emissionsEveryDay: 0,
            },
          ],
        },
      ])
    ).resolves.toEqual([
      {
        poolAddress: POOL_ID,
        positionId: POSITION_ID,
        rewarderAmountOwed: [
          {
            amount_owed: new BN(33),
            coin_address: COIN_B,
          },
        ],
      },
    ])
  })

  test('Router.preRouterSwapA2B2C returns null when a successful simulation omits quote events', async () => {
    const router = new RouterModule(buildSdkWithSimulation(successfulNoEvents) as any)

    await expect(
      router.preRouterSwapA2B2C([
        {
          stepNums: 1,
          poolAB: POOL_ID,
          poolBC: undefined,
          a2b: true,
          b2c: undefined,
          byAmountIn: true,
          amount: new BN(1),
          coinTypeA: COIN_A,
          coinTypeB: COIN_B,
          coinTypeC: undefined,
        },
      ])
    ).resolves.toBeNull()
  })

  test('Swap.preswap propagates failed simulation', async () => {
    const swap = new SwapModule(buildSdk() as any)

    await expect(
      swap.preswap({
        pool: { poolAddress: POOL_ID },
        currentSqrtPrice: 1,
        decimalsA: 9,
        decimalsB: 9,
        a2b: true,
        byAmountIn: true,
        amount: '1',
        coinTypeA: COIN_A,
        coinTypeB: COIN_B,
      } as any)
    ).rejects.toThrow(/SIMULATION_FAILED|simulation/i)
  })

  test('Swap.preswap returns null when a successful simulation omits quote events', async () => {
    const swap = new SwapModule(buildSdkWithSimulation(successfulNoEvents) as any)

    await expect(
      swap.preswap({
        pool: { poolAddress: POOL_ID },
        currentSqrtPrice: 1,
        decimalsA: 9,
        decimalsB: 9,
        a2b: true,
        byAmountIn: true,
        amount: '1',
        coinTypeA: COIN_A,
        coinTypeB: COIN_B,
      } as any)
    ).resolves.toBeNull()
  })

  test('Token.getAllRegisteredTokenList rejects successful simulations that omit token-list events', async () => {
    const token = new TokenModule(buildSdkWithSimulation(successfulNoEvents) as any)

    await expect(token.getAllRegisteredTokenList(true)).rejects.toThrow(/FetchCoinListEvent|simulation event|missing/i)
  })

  test('Token.getAllRegisteredPoolList rejects successful simulations that omit pool-list events', async () => {
    const token = new TokenModule(buildSdkWithSimulation(successfulNoEvents) as any)

    await expect(token.getAllRegisteredPoolList(true)).rejects.toThrow(/FetchPoolListEvent|simulation event|missing/i)
  })

  test('DeepbookUtils.getPoolAsks rejects successful simulations that omit book-status events', async () => {
    await expect(DeepbookUtils.getPoolAsks(buildSdkWithSimulation(successfulNoEvents) as any, POOL_ID, COIN_A, COIN_B)).rejects.toThrow(
      /BookStatus|simulation event|missing/i
    )
  })

  test('DeepbookUtils.getPoolBids rejects successful simulations that omit book-status events', async () => {
    await expect(DeepbookUtils.getPoolBids(buildSdkWithSimulation(successfulNoEvents) as any, POOL_ID, COIN_A, COIN_B)).rejects.toThrow(
      /BookStatus|simulation event|missing/i
    )
  })

  test('DeepbookUtils.simulateSwap rejects successful simulations that omit swap events', async () => {
    jest.spyOn(DeepbookUtils, 'getAccountCap').mockResolvedValue('')

    await expect(
      DeepbookUtils.simulateSwap(buildSdkWithSimulation(successfulNoEvents) as any, POOL_ID, COIN_A, COIN_B, true, 0)
    ).rejects.toThrow(/DeepbookSwapEvent|simulation event|missing/i)
  })

  test.each(previouslyUncoveredConsumerCases)(
    '%s propagates a failed simulation instead of accepting it as success',
    async (_name, run) => {
      await expect(run(failedSimulation)).rejects.toThrow()
    }
  )

  test.each(previouslyUncoveredConsumerCases.filter(([name]) => name !== 'Swap.preSwapWithMultiPool'))(
    '%s rejects a successful simulation that omits its required event',
    async (_name, run) => {
      await expect(run(successfulNoEvents)).rejects.toThrow()
    }
  )

  test('Swap.preSwapWithMultiPool returns null for a successful simulation without a viable quote event', async () => {
    const [, run] = previouslyUncoveredConsumerCases.find(([name]) => name === 'Swap.preSwapWithMultiPool')!

    await expect(run(successfulNoEvents)).resolves.toBeNull()
  })
})
