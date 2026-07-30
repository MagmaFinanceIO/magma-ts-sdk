import { jest } from '@jest/globals'
import { AlmmModule } from '../src/modules/almm'
import { GaugeModule } from '../src/modules/gaugeModule'
import { LockModule } from '../src/modules/lockModule'
import { PoolModule } from '../src/modules/poolModule'

const PACKAGE_ID = `0x${'1'.repeat(64)}`
const OWNER = `0x${'2'.repeat(64)}`
const PAIR_ID = `0x${'3'.repeat(64)}`
const POOL_ID = `0x${'4'.repeat(64)}`
const GAUGE_ID = `0x${'5'.repeat(64)}`
const LOCK_ID = `0x${'6'.repeat(64)}`
const COIN_A = '0x2::sui::SUI'
const COIN_B = `${PACKAGE_ID}::coin_b::COIN_B`

function simulationWithEvents(events: any[]) {
  return {
    error: null,
    effects: { status: { success: true, error: null } },
    events,
  }
}

function event(eventName: string, parsedBcs: Record<string, unknown>) {
  return {
    type: `${PACKAGE_ID}::test::${eventName}`,
    parsedBcs,
    parsedJson: parsedBcs,
  }
}

function buildSdk(simulationResult: Record<string, unknown>) {
  return {
    senderAddress: OWNER,
    sdkOptions: {
      simulationAccount: { address: OWNER },
      integrate: {
        package_id: PACKAGE_ID,
        published_at: PACKAGE_ID,
      },
      clmm_pool: {
        package_id: PACKAGE_ID,
        published_at: PACKAGE_ID,
        config: {
          global_config_id: POOL_ID,
        },
      },
      ve33: {
        package_id: PACKAGE_ID,
        published_at: PACKAGE_ID,
        config: {
          minter_id: PACKAGE_ID,
          magma_token: COIN_A,
          reward_distributor_id: PACKAGE_ID,
          voter_id: PACKAGE_ID,
          voting_escrow_id: PACKAGE_ID,
        },
      },
    },
    fullClient: {
      devInspectTransactionBlock: jest.fn(async () => simulationResult),
    },
  }
}

describe('devInspect event contracts for ALMM, Pool, Lock, and Gauge', () => {
  test('ALMM.fetchPairParams returns BCS-decoded pair params from EventPairParams', async () => {
    const pairParams = {
      base_factor: 10,
      active_index: 123,
      bin_step: 5,
    }
    const almm = new AlmmModule(buildSdk(simulationWithEvents([event('EventPairParams', { params: pairParams })])) as any)

    await expect(
      almm.fetchPairParams({
        pair: PAIR_ID,
        coinTypeA: COIN_A,
        coinTypeB: COIN_B,
      })
    ).resolves.toBe(pairParams)
  })

  test('ALMM.fetchPairParams rejects successful simulations missing EventPairParams', async () => {
    const almm = new AlmmModule(buildSdk(simulationWithEvents([])) as any)

    await expect(
      almm.fetchPairParams({
        pair: PAIR_ID,
        coinTypeA: COIN_A,
        coinTypeB: COIN_B,
      })
    ).rejects.toThrow(/EventPairParams/)
  })

  test('Pool.getTicks returns an empty list when FetchTicksResultEvent contains no ticks', async () => {
    const pool = new PoolModule(buildSdk(simulationWithEvents([event('FetchTicksResultEvent', { ticks: [] })])) as any)

    await expect(
      (pool as any).getTicks({
        pool_id: POOL_ID,
        start: [],
        limit: 10,
        coinTypeA: COIN_A,
        coinTypeB: COIN_B,
      })
    ).resolves.toEqual([])
  })

  test('Pool.getTicks rejects successful simulations missing FetchTicksResultEvent', async () => {
    const pool = new PoolModule(buildSdk(simulationWithEvents([])) as any)

    await expect(
      (pool as any).getTicks({
        pool_id: POOL_ID,
        start: [],
        limit: 10,
        coinTypeA: COIN_A,
        coinTypeB: COIN_B,
      })
    ).rejects.toThrow(/FetchTicksResultEvent/)
  })

  test('Lock.aLockSummary returns BCS-decoded LockSummary data', async () => {
    const lockSummary = {
      fee_incentive_total: '11',
      reward_distributor_claimable: '22',
      voting_power: '33',
    }
    const lock = new LockModule(buildSdk(simulationWithEvents([event('LockSummary', lockSummary)])) as any)

    await expect(lock.aLockSummary(LOCK_ID)).resolves.toEqual(lockSummary)
  })

  test('Lock.aLockSummary rejects successful simulations missing LockSummary', async () => {
    const lock = new LockModule(buildSdk(simulationWithEvents([])) as any)

    await expect(lock.aLockSummary(LOCK_ID)).rejects.toThrow(/LockSummary/)
  })

  test('Gauge.getPoolGaguers returns BCS-decoded pool to gauge mapping', async () => {
    const gauge = new GaugeModule(
      buildSdk(
        simulationWithEvents([
          event('PoolsGauges', {
            pools: [POOL_ID],
            gauges: [GAUGE_ID],
          }),
        ])
      ) as any
    )

    const poolGauges = await gauge.getPoolGaguers()

    expect(poolGauges).toBeInstanceOf(Map)
    expect(poolGauges.get(POOL_ID)).toBe(GAUGE_ID)
  })

  test('Gauge.getPoolGaguers rejects successful simulations missing pool/gauge data', async () => {
    const gauge = new GaugeModule(buildSdk(simulationWithEvents([])) as any)

    await expect(gauge.getPoolGaguers()).rejects.toThrow(/expected event/)
  })

  test('Gauge.getPoolGaguers rejects successful simulations with invalid pool/gauge shape', async () => {
    const gauge = new GaugeModule(
      buildSdk(
        simulationWithEvents([
          event('PoolsGauges', {
            pools: [POOL_ID],
            gauges: GAUGE_ID,
          }),
        ])
      ) as any
    )

    await expect(gauge.getPoolGaguers()).rejects.toThrow(/expected event/)
  })

  test('Gauge.getPoolGaguers rejects mismatched pool/gauge arrays', async () => {
    const gauge = new GaugeModule(
      buildSdk(
        simulationWithEvents([
          event('PoolsGauges', {
            pools: [POOL_ID],
            gauges: [],
          }),
        ])
      ) as any
    )

    await expect(gauge.getPoolGaguers()).rejects.toThrow(/expected event/)
  })

  test('Gauge.getUserStakedPositionInfoOfPool returns BCS-decoded info arrays', async () => {
    const infos = [{ pool_id: POOL_ID, earned: '10' }]
    const gauge = new GaugeModule(
      buildSdk(
        simulationWithEvents([
          event('UserStakedPositionInfos', {
            infos,
          }),
        ])
      ) as any
    )

    await expect(gauge.getUserStakedPositionInfoOfPool(OWNER, POOL_ID, GAUGE_ID, COIN_A, COIN_B)).resolves.toEqual([{ infos }])
  })

  test('Gauge.getUserStakedPositionInfoOfPool rejects unrelated or malformed events', async () => {
    const gauge = new GaugeModule(
      buildSdk(
        simulationWithEvents([
          event('UnrelatedEvent', {
            value: 'not staked position data',
          }),
        ])
      ) as any
    )

    await expect(gauge.getUserStakedPositionInfoOfPool(OWNER, POOL_ID, GAUGE_ID, COIN_A, COIN_B)).rejects.toThrow(/expected event/)
  })
})
