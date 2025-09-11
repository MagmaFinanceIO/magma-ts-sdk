import { Transaction } from '@mysten/sui/transactions'
import {
  CLOCK_ADDRESS,
  DepositPosition,
  EpochEmission,
  Gauge,
  getPackagerConfigs,
  GetRewardByPosition,
  Minter,
  StakedPositionOfPool,
  Voter,
  WithdrawPosition,
} from '../types'
import { IModule } from '../interfaces/IModule'
import { MagmaClmmSDK } from '../sdk'
import { asIntN, extractStructTagFromType, getObjectType } from '../utils'

export class GaugeModule implements IModule {
  protected _sdk: MagmaClmmSDK

  constructor(sdk: MagmaClmmSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  async depositPosition(params: DepositPosition): Promise<Transaction> {
    const tx = new Transaction()
    tx.setSender(this.sdk.senderAddress)

    const poolGauge = await this.getPoolGaguers()
    const gauge = poolGauge.get(params.poolId)
    if (gauge === undefined) {
      throw Error(`Fetch gauge of pool ${params.poolId} failed`)
    }

    const { distribution_cfg, magma_token } = getPackagerConfigs(this.sdk.sdkOptions.ve33)
    const { clmm_pool, integrate } = this.sdk.sdkOptions
    const clmmConfig = getPackagerConfigs(clmm_pool)

    const typeArguments = [params.coinTypeA, params.coinTypeB, magma_token]
    const args = [
      tx.object(clmmConfig.global_config_id),
      tx.object(distribution_cfg),
      tx.object(gauge),
      tx.object(params.poolId),
      tx.object(params.positionId),
      tx.object(CLOCK_ADDRESS),
    ]

    tx.moveCall({
      target: `${integrate.published_at}::${Gauge}::deposit_position`,
      typeArguments,
      arguments: args,
    })
    return tx
  }

  async withdrawPosition(params: WithdrawPosition): Promise<Transaction> {
    const tx = new Transaction()
    tx.setSender(this.sdk.senderAddress)

    const poolGauge = await this.sdk.Gauge.getPoolGaguers()
    const gauge = poolGauge.get(params.poolId)
    if (gauge === undefined) {
      throw Error(`Fetch gauge of pool ${params.poolId} failed`)
    }

    const { magma_token } = getPackagerConfigs(this.sdk.sdkOptions.ve33)
    const { integrate } = this.sdk.sdkOptions

    const typeArguments = [params.coinTypeA, params.coinTypeB, magma_token]
    const args = [tx.object(gauge), tx.object(params.poolId), tx.object(params.positionId), tx.object(CLOCK_ADDRESS)]

    tx.moveCall({
      target: `${integrate.published_at}::${Gauge}::withdraw_position`,
      typeArguments,
      arguments: args,
    })
    return tx
  }

  async getUserStakedPositionInfo(userAddr: string): Promise<StakedPositionOfPool[]> {
    const poolGauger = await this.getPoolGaguers()
    const poolCoins = await this.getPoolCoins([...poolGauger.keys()])

    const res: StakedPositionOfPool[] = []
    for (const [pool, gauger] of poolGauger) {
      const coins = poolCoins.get(pool)
      if (coins === undefined) {
        console.log(`Failed to get coins of pool: ${pool}`)
        continue
      }

      const stakedPositionOfPool = await this.getUserStakedPositionInfoOfPool(userAddr, pool, gauger, coins[0], coins[1])
      console.log('stakedPositionOfPool', stakedPositionOfPool)
      stakedPositionOfPool.forEach((value) => {
        ;(value.infos as any[]).forEach((info) => {
          if (info.info) {
            if (res.findIndex((position) => position.pos_object_id === info.info.fields.position_id) === -1) {
              res.push({
                coin_type_a: coins[0],
                coin_type_b: coins[1],
                liquidity: info.info.fields.liquidity,
                tick_lower_index: asIntN(BigInt(info.info.fields.tick_lower_index.fields.bits)),
                tick_upper_index: asIntN(BigInt(info.info.fields.tick_upper_index.fields.bits)),
                pos_object_id: info.info.fields.position_id,
                magma_distribution_staked: info.info.fields.magma_distribution_staked,
                pool: info.pool_id,
                earned: info.earned,
                name: info.name,
              })
            }
          }
        })
      })
    }

    return res
  }

  async getUserStakedPositionInfoOfPool(userAddr: string, pool: string, gauger: string, poolCoinA: string, poolCoinB: string) {
    const tx = new Transaction()
    const { integrate, simulationAccount } = this.sdk.sdkOptions
    const { magma_token, voter_id } = getPackagerConfigs(this.sdk.sdkOptions.ve33)

    const typeArguments = [poolCoinA, poolCoinB, magma_token]

    const args = [tx.object(voter_id), tx.object(gauger), tx.object(pool), tx.pure.address(userAddr), tx.object(CLOCK_ADDRESS)]

    tx.moveCall({
      target: `${integrate.published_at}::${Gauge}::user_staked_position_infos`,
      arguments: args,
      typeArguments,
    })

    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    if (simulateRes.error != null) {
      throw new Error(`user_staked_position_infos error code: ${simulateRes.error ?? 'unknown error'}`)
    }

    const res: any[] = []

    simulateRes.events?.forEach((item: any) => {
      res.push(item.parsedJson)
    })

    return res
  }

  async getPoolGaguers() {
    const tx = new Transaction()
    const { integrate, simulationAccount } = this.sdk.sdkOptions
    const { magma_token, voter_id } = getPackagerConfigs(this.sdk.sdkOptions.ve33)

    const typeArguments = [magma_token]
    const args = [tx.object(voter_id)]

    tx.moveCall({
      target: `${integrate.published_at}::${Voter}::pools_gauges`,
      arguments: args,
      typeArguments,
    })

    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    if (simulateRes.error != null) {
      throw new Error(`getPoolGaguers error code: ${simulateRes.error ?? 'unknown error'}`)
    }

    const poolGauger = new Map<string, string>()
    simulateRes.events?.forEach((item: any) => {
      const { gauges } = item.parsedJson
      item.parsedJson.pools.map((pool: string, index: string) => {
        poolGauger.set(pool, gauges[index])
      })
    })

    // console.log('##### ', poolGauger)
    return poolGauger
  }

  async getPoolCoins(pools: string[]) {
    const res = await this._sdk.fullClient.multiGetObjects({ ids: pools, options: { showContent: true } })

    const poolCoins = new Map<string, string[]>()

    res.forEach((item) => {
      if (item.error != null || item.data?.content?.dataType !== 'moveObject') {
        throw new Error(`Failed to get poolCoins with err: ${item.error}`)
      }

      const type = getObjectType(item) as string
      const poolTypeFields = extractStructTagFromType(type)

      poolCoins.set(item.data.objectId, poolTypeFields.type_arguments)
    })
    return poolCoins
  }

  async getEmissions() {
    const tx = new Transaction()
    const { integrate, simulationAccount } = this.sdk.sdkOptions
    const { magma_token, minter_id, voting_escrow_id } = getPackagerConfigs(this.sdk.sdkOptions.ve33)

    const typeArguments = [magma_token]

    const args = [tx.object(minter_id), tx.object(voting_escrow_id)]

    tx.moveCall({
      target: `${integrate.published_at}::${Minter}::emissions`,
      arguments: args,
      typeArguments,
    })

    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    if (simulateRes.error != null) {
      throw new Error(`all_lock_summary error code: ${simulateRes.error ?? 'unknown error'}`)
    }

    let res: EpochEmission = {
      emission: 0,
      rebase: 0,
      total_supply: 0,
      total_locked: 0,
    }
    simulateRes.events?.forEach((item: any) => {
      res = {
        emission: item.parsedJson.emission,
        rebase: item.parsedJson.rebase,
        total_supply: item.parsedJson.total_supply,
        total_locked: item.parsedJson.total_locked,
      }
    })

    return res
  }

  async getRewardByPosition(params: GetRewardByPosition): Promise<Transaction> {
    const tx = new Transaction()
    const { integrate } = this.sdk.sdkOptions
    const { magma_token } = getPackagerConfigs(this.sdk.sdkOptions.ve33)

    const typeArguments = [params.coinTypeA, params.coinTypeB, magma_token]
    const args = [tx.object(params.gaugeId), tx.object(params.poolId), tx.object(params.positionId), tx.object(CLOCK_ADDRESS)]

    tx.moveCall({
      target: `${integrate.published_at}::${Gauge}::get_reward_by_position`,
      arguments: args,
      typeArguments,
    })
    return tx
  }

  async getAllRewardByPositions(paramsList: GetRewardByPosition[]): Promise<Transaction> {
    const tx = new Transaction()
    const { integrate } = this.sdk.sdkOptions
    const { magma_token } = getPackagerConfigs(this.sdk.sdkOptions.ve33)
    paramsList.forEach((params) => {
      const typeArguments = [params.coinTypeA, params.coinTypeB, magma_token]
      const args = [tx.object(params.gaugeId), tx.object(params.poolId), tx.object(params.positionId), tx.object(CLOCK_ADDRESS)]
      tx.moveCall({
        target: `${integrate.published_at}::${Gauge}::get_reward_by_position`,
        arguments: args,
        typeArguments,
      })
    })

    return tx
  }

  async getEpochRewardByPool(pool: string, incentive_tokens: string[]): Promise<Map<string, string>> {
    const tx = new Transaction()
    const { integrate, simulationAccount } = this.sdk.sdkOptions
    const { magma_token, voter_id } = getPackagerConfigs(this.sdk.sdkOptions.ve33)

    const typeArguments = [magma_token, ...incentive_tokens]

    const args = [tx.object(voter_id), tx.object(pool), tx.object(CLOCK_ADDRESS)]

    let targetFunc = `${integrate.published_at}::${Voter}::epoch_reward_by_pool${incentive_tokens.length}`
    if (incentive_tokens.length === 1) {
      targetFunc = `${integrate.published_at}::${Voter}::epoch_reward_by_pool`
    }

    tx.moveCall({
      target: targetFunc,
      arguments: args,
      typeArguments,
    })

    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    if (simulateRes.error != null) {
      throw new Error(`getEpochRewardByPool error code: ${simulateRes.error ?? 'unknown error'}`)
    }

    const res = new Map<string, string>()

    simulateRes.events?.forEach((item: any) => {
      if (extractStructTagFromType(item.type).name === `EventPoolIncentivesAmount`) {
        res.set(item.parsedJson.token, item.parsedJson.amount)
      }
    })

    return res
  }
}
