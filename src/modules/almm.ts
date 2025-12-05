import { Transaction } from '@mysten/sui/transactions'
import { SuiObjectResponse } from '@mysten/sui/client'
import {
  get_price_x128_from_real_id,
  get_real_id,
  get_real_id_from_price_x128,
  get_storage_id_from_real_id,
} from '@magmaprotocol/calc_almm'
import Decimal from 'decimal.js'
import BN from 'bn.js'
import { BinMath, MathUtil } from '../math'
import {
  EventBin,
  CreatePairParams,
  FetchBinsParams,
  ALMMSwapParams,
  EventPositionLiquidity,
  GetPositionLiquidityParams,
  EventPairLiquidity,
  GetPairLiquidityParams,
  FetchPairParams,
  EventPairParams,
  AlmmPoolInfo,
  AlmmBurnPositionParams,
  AlmmShrinkPosition,
  AlmmCollectRewardParams,
  AlmmCollectFeeParams,
  AlmmEventEarnedFees,
  AlmmRewardsParams,
  AlmmEventEarnedRewards,
  GetPairRewarderParams,
  AlmmEventPairRewardTypes,
  AlmmCreatePairAddLiquidityParams,
  AlmmPosition,
  AlmmPositionInfo,
  MintByStrategyParams,
  RaiseByStrategyParams,
  EventCreatePair,
} from '../types/almm'
import { DataPage, PaginationArgs } from '../types/sui'
import {
  CachedContent,
  cacheTime24h,
  cacheTime5min,
  extractStructTagFromType,
  getFutureTime,
  getObjectFields,
  getObjectOwner,
  getObjectType,
  TransactionUtil,
} from '../utils'
import { CLOCK_ADDRESS, AlmmScript, getPackagerConfigs, SuiResource, Rewarder } from '../types'
import { MagmaClmmSDK } from '../sdk'
import { IModule } from '../interfaces/IModule'
import { ClmmpoolsError, PositionErrorCode, TypesErrorCode } from '../errors/errors'

export class AlmmModule implements IModule {
  protected _sdk: MagmaClmmSDK

  private readonly _cache: Record<string, CachedContent> = {}

  constructor(sdk: MagmaClmmSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  async getPools(paginationArgs: PaginationArgs = 'all', forceRefresh = false): Promise<EventCreatePair[]> {
    const { package_id } = this._sdk.sdkOptions.almm_pool

    const allPools: EventCreatePair[] = []
    const cacheKey = `${package_id}_getInitCreatePairEvent`
    const cacheData = this.getCache<EventCreatePair[]>(cacheKey, forceRefresh)

    if (cacheData !== undefined) {
      allPools.push(...cacheData)
    }

    if (allPools.length === 0) {
      try {
        const moveEventType = `${package_id}::almm_pair::EventCreatePair`
        const objects = await this._sdk.fullClient.queryEventsByPage({ MoveEventType: moveEventType }, paginationArgs)
        const dataPage: DataPage<EventCreatePair> = {
          data: [],
          hasNextPage: false,
        }

        dataPage.hasNextPage = objects.hasNextPage
        dataPage.nextCursor = objects.nextCursor

        objects.data.forEach((object: any) => {
          const fields = object.parsedJson
          if (fields) {
            allPools.push(fields)
          }
        })

        this.updateCache(cacheKey, allPools, cacheTime24h)
      } catch (error) {
        console.log('getCreatePairEvents', error)
      }
    }
    return allPools
  }

  async getPoolInfo(pools: string[]): Promise<AlmmPoolInfo[]> {
    const cachePoolList: AlmmPoolInfo[] = []
    pools = pools.filter((poolID) => {
      const cacheData = this.getCache<AlmmPoolInfo>(`${poolID}_getPoolObject`, false)
      if (cacheData !== undefined) {
        cachePoolList.push(cacheData)
        return false
      }
      return true
    })
    const objects = await this._sdk.fullClient.batchGetObjects(pools, { showContent: true })

    const poolList: AlmmPoolInfo[] = []
    objects.forEach((obj) => {
      if (obj.error != null || obj.data?.content?.dataType !== 'moveObject') {
        throw new ClmmpoolsError(`Invalid objects. error: ${obj.error}`, TypesErrorCode.InvalidType)
      }

      const fields = getObjectFields(obj)

      const rewarders: Rewarder[] = []
      fields.rewarder_manager.fields.rewarders.forEach((item: any) => {
        const { emissions_per_second } = item.fields
        const emissionSeconds = MathUtil.fromX64(new BN(emissions_per_second))
        const emissionsEveryDay = Math.floor(emissionSeconds.toNumber() * 60 * 60 * 24)

        rewarders.push({
          emissions_per_second,
          coinAddress: extractStructTagFromType(item.fields.reward_coin.fields.name).source_address,
          growth_global: item.fields.growth_global,
          emissionsEveryDay,
        })
      })

      const poolInfo: AlmmPoolInfo = {
        pool_id: fields.id.id,
        bin_step: fields.bin_step,
        coin_a: fields.x.fields.name,
        coin_b: fields.y.fields.name,
        base_factor: fields.params.fields.base_factor,
        base_fee: (fields.params.fields.base_factor * fields.bin_step) / 1e9,
        active_index: fields.params.fields.active_index,
        real_bin_id: get_real_id(fields.params.fields.active_index),
        coinAmountA: fields.reserve_x,
        coinAmountB: fields.reserve_y,
        liquidity: fields.liquidity,
        rewarder_infos: rewarders,
        params: fields.params.fields,
      }
      poolList.push(poolInfo)
      this.updateCache(`${fields.id.id}_getPoolObject`, poolInfo, cacheTime24h)
    })

    return [...cachePoolList, ...poolList]
  }

  // eg: fetch pool active_index
  async fetchPairParams(params: FetchPairParams): Promise<EventPairParams> {
    const tx = new Transaction()
    const { integrate, simulationAccount } = this.sdk.sdkOptions

    const typeArguments = [params.coinTypeA, params.coinTypeB]
    const args = [tx.object(params.pair)]

    tx.moveCall({
      target: `${integrate.published_at}::${AlmmScript}::fetch_pair_params`,
      arguments: args,
      typeArguments,
    })

    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    if (simulateRes.error != null) {
      throw new Error(`fetchPairParams error code: ${simulateRes.error ?? 'unknown error'}`)
    }

    let res: EventPairParams = {
      base_factor: 0,
      filter_period: 0,
      decay_period: 0,
      reduction_factor: 0,
      variable_fee_control: 0,
      protocol_share: 0,
      max_volatility_accumulator: 0,
      volatility_accumulator: 0,
      volatility_reference: 0,
      index_reference: 0,
      time_of_last_update: 0,
      oracle_index: 0,
      active_index: 0,
      protocol_variable_share: 0,
    }
    simulateRes.events?.forEach((item: any) => {
      console.log(extractStructTagFromType(item.type).name)
      if (extractStructTagFromType(item.type).name === `EventPairParams`) {
        res = item.parsedJson.params
      }
    })

    return res
  }

  // NOTE: x, y should be sorted
  async createPairPayload(params: CreatePairParams): Promise<Transaction> {
    const storage_id = get_storage_id_from_real_id(
      BinMath.getBinIdFromPrice(params.priceTokenBPerTokenA, params.bin_step, params.coinADecimal, params.coinBDecimal)
    )

    const tx = new Transaction()
    tx.setSender(this.sdk.senderAddress)

    const { clmm_pool, almm_pool, integrate } = this.sdk.sdkOptions
    const { global_config_id } = getPackagerConfigs(clmm_pool)
    const almmConfig = getPackagerConfigs(almm_pool)

    const typeArguments = [params.coinTypeA, params.coinTypeB]
    const args = [
      tx.object(almmConfig.factory),
      tx.object(global_config_id),
      tx.pure.u64(params.base_fee),
      tx.pure.u16(params.bin_step),
      tx.pure.u32(storage_id),
      tx.object(CLOCK_ADDRESS),
    ]

    tx.moveCall({
      target: `${integrate.published_at}::${AlmmScript}::create_pair`,
      typeArguments,
      arguments: args,
    })
    return tx
  }


  // // Create a position by percent
  // async mintPercent(params: MintPercentParams): Promise<Transaction> {
  //   const tx = new Transaction()
  //   tx.setSender(this.sdk.senderAddress)

  //   const { almm_pool, integrate } = this.sdk.sdkOptions
  //   const almmConfig = getPackagerConfigs(almm_pool)

  //   const typeArguments = [params.coinTypeA, params.coinTypeB]

  //   const allCoins = await this._sdk.getOwnerCoinAssets(this._sdk.senderAddress)
  //   const primaryCoinAInputs = TransactionUtil.buildCoinForAmount(tx, allCoins, BigInt(params.amountATotal), params.coinTypeA, false, true)
  //   const primaryCoinBInputs = TransactionUtil.buildCoinForAmount(tx, allCoins, BigInt(params.amountBTotal), params.coinTypeB, false, true)

  //   const args = [
  //     tx.object(params.pair),
  //     tx.object(almmConfig.factory),
  //     primaryCoinAInputs.targetCoin,
  //     primaryCoinBInputs.targetCoin,
  //     tx.pure.u64(params.amountATotal),
  //     tx.pure.u64(params.amountBTotal),
  //     tx.pure.vector('u32', params.storageIds),
  //     tx.pure.vector('u64', params.binsAPercent),
  //     tx.pure.vector('u64', params.binsBPercent),
  //     tx.pure.address(params.to),
  //     tx.object(CLOCK_ADDRESS),
  //   ]

  //   tx.moveCall({
  //     target: `${integrate.published_at}::${AlmmScript}::mint_percent`,
  //     typeArguments,
  //     arguments: args,
  //   })
  //   return tx
  // }

  // // Create a position by amount
  // async createPositionByAmount(params: MintAmountParams): Promise<Transaction> {
  //   const tx = new Transaction()
  //   tx.setSender(this.sdk.senderAddress)
  //   const { almm_pool, integrate } = this.sdk.sdkOptions
  //   const almmConfig = getPackagerConfigs(almm_pool)

  //   const typeArguments = [params.coinTypeA, params.coinTypeB]

  //   const allCoins = await this._sdk.getOwnerCoinAssets(this._sdk.senderAddress)
  //   const primaryCoinAInputs = TransactionUtil.buildCoinForAmount(tx, allCoins, BigInt(params.amountATotal), params.coinTypeA, false, true)
  //   const primaryCoinBInputs = TransactionUtil.buildCoinForAmount(tx, allCoins, BigInt(params.amountBTotal), params.coinTypeB, false, true)

  //   const args = [
  //     tx.object(params.pair),
  //     tx.object(almmConfig.factory),
  //     primaryCoinAInputs.targetCoin,
  //     primaryCoinBInputs.targetCoin,
  //     tx.pure.vector('u32', params.storageIds),
  //     tx.pure.vector('u64', params.amountsA),
  //     tx.pure.vector('u64', params.amountsB),
  //     tx.pure.address(params.to),
  //     tx.object(CLOCK_ADDRESS),
  //   ]

  //   tx.moveCall({
  //     target: `${integrate.published_at}::${AlmmScript}::mint_amounts`,
  //     typeArguments,
  //     arguments: args,
  //   })
  //   return tx
  // }

  async collectFeeAndRewardList(paramsList: AlmmCollectRewardParams[]): Promise<Transaction> {
    let tx = new Transaction()
    for (let index = 0; index < paramsList.length; index++) {
      const params = paramsList[index]
      tx = await this.collectFeeAndReward(params)
    }
    return tx
  }

  async collectFeeAndReward(params: AlmmCollectRewardParams & AlmmCollectFeeParams, tx?: Transaction): Promise<Transaction> {
    if (!tx) {
      tx = new Transaction()
    }
    tx = await this.collectFees(params)
    if (params.rewards_token.length > 0) {
      tx = await this.collectReward(params, tx)
    }
    return tx
  }

  async collectReward(params: AlmmCollectRewardParams, transaction?: Transaction): Promise<Transaction> {
    const tx = transaction || new Transaction()
    tx.setSender(this.sdk.senderAddress)

    const { integrate, clmm_pool, almm_pool } = this.sdk.sdkOptions
    const clmmConfigs = getPackagerConfigs(clmm_pool)
    const almmConfig = getPackagerConfigs(almm_pool)
    const typeArguments = [params.coin_a, params.coin_b, ...params.rewards_token]
    const args = [
      tx.object(almmConfig.factory),
      tx.object(params.pool_id),
      tx.object(clmmConfigs.global_vault_id),
      tx.object(params.position_id),
      tx.object(CLOCK_ADDRESS),
    ]
    let target = `${integrate.published_at}::${AlmmScript}::collect_reward`
    if (params.rewards_token.length > 1) {
      target = `${integrate.published_at}::${AlmmScript}::collect_reward${params.rewards_token.length}`
    }

    tx.moveCall({
      target,
      typeArguments,
      arguments: args,
    })
    return tx
  }

  async collectFees(params: AlmmCollectFeeParams, transaction?: Transaction): Promise<Transaction> {
    const tx = transaction || new Transaction()
    tx.setSender(this.sdk.senderAddress)

    const { integrate, almm_pool } = this.sdk.sdkOptions
    const almmConfig = getPackagerConfigs(almm_pool)

    const typeArguments = [params.coin_a, params.coin_b]
    const args = [tx.object(almmConfig.factory), tx.object(params.pool_id), tx.object(params.position_id), tx.object(CLOCK_ADDRESS)]

    const target = `${integrate.published_at}::${AlmmScript}::collect_fees`

    tx.moveCall({
      target,
      typeArguments,
      arguments: args,
    })
    return tx
  }

  async createPairAddLiquidity(params: AlmmCreatePairAddLiquidityParams): Promise<Transaction> {
    const tx = new Transaction()
    tx.setSender(this.sdk.senderAddress)

    const { clmm_pool, almm_pool, integrate } = this.sdk.sdkOptions
    const { global_config_id } = getPackagerConfigs(clmm_pool)
    const almmConfig = getPackagerConfigs(almm_pool)
    const typeArguments = [params.coinTypeA, params.coinTypeB]

    const allCoins = await this._sdk.getOwnerCoinAssets(this._sdk.senderAddress)

    const amountATotal = params.amountsX.reduce((accumulator, currentValue) => accumulator + currentValue, 0)
    const amountBTotal = params.amountsY.reduce((accumulator, currentValue) => accumulator + currentValue, 0)

    const primaryCoinAInputs = TransactionUtil.buildCoinForAmount(tx, allCoins, BigInt(amountATotal), params.coinTypeA, false, true)
    const primaryCoinBInputs = TransactionUtil.buildCoinForAmount(tx, allCoins, BigInt(amountBTotal), params.coinTypeB, false, true)

    const storageIds: number[] = []
    params.realIds.forEach((i) => {
      storageIds.push(get_storage_id_from_real_id(i))
    })
    const args = [
      tx.object(almmConfig.factory),
      tx.object(global_config_id),
      tx.pure.u64(params.baseFee),
      tx.pure.u16(params.binStep),
      tx.pure.u32(get_storage_id_from_real_id(params.activeId)),
      primaryCoinAInputs.targetCoin,
      primaryCoinBInputs.targetCoin,
      tx.pure.vector('u32', storageIds),
      tx.pure.vector('u64', params.amountsX),
      tx.pure.vector('u64', params.amountsY),
      tx.pure.address(params.to),
      tx.object(CLOCK_ADDRESS),
    ]
    const target = `${integrate.published_at}::${AlmmScript}::create_pair_add_liquidity`

    tx.moveCall({
      target,
      typeArguments,
      arguments: args,
    })
    return tx
  }

  async swap(params: ALMMSwapParams): Promise<Transaction> {
    const tx = new Transaction()
    tx.setSender(this.sdk.senderAddress)

    const { clmm_pool, almm_pool, integrate } = this.sdk.sdkOptions
    const { global_config_id } = getPackagerConfigs(clmm_pool)
    const almmConfig = getPackagerConfigs(almm_pool)
    const typeArguments = [params.coinTypeA, params.coinTypeB]

    const allCoinAsset = await this._sdk.getOwnerCoinAssets(this._sdk.senderAddress)
    const primaryCoinInputA = TransactionUtil.buildCoinForAmount(
      tx,
      allCoinAsset,
      params.swapForY ? BigInt(params.amountIn) : BigInt(0),
      params.coinTypeA,
      false,
      true
    )

    const primaryCoinInputB = TransactionUtil.buildCoinForAmount(
      tx,
      allCoinAsset,
      params.swapForY ? BigInt(0) : BigInt(params.amountIn),
      params.coinTypeB,
      false,
      true
    )

    const args = [
      tx.object(almmConfig.factory),
      tx.object(params.pair),
      tx.object(global_config_id),
      primaryCoinInputA.targetCoin,
      primaryCoinInputB.targetCoin,
      tx.pure.u64(params.amountIn),
      tx.pure.u64(params.minAmountOut),
      tx.pure.bool(params.swapForY),
      tx.pure.address(params.to),
      tx.object(CLOCK_ADDRESS),
    ]

    tx.moveCall({
      target: `${integrate.published_at}::${AlmmScript}::swap`,
      typeArguments,
      arguments: args,
    })
    return tx
  }

  async fetchBins(params: FetchBinsParams): Promise<EventBin[]> {
    const tx = new Transaction()
    const { integrate, simulationAccount } = this.sdk.sdkOptions

    const typeArguments = [params.coinTypeA, params.coinTypeB]
    const args = [tx.object(params.pair), tx.pure.u64(params.offset), tx.pure.u64(params.limit)]

    tx.moveCall({
      target: `${integrate.published_at}::${AlmmScript}::fetch_bins`,
      arguments: args,
      typeArguments,
    })

    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    if (simulateRes.error != null) {
      throw new Error(`swap code: ${simulateRes.error ?? 'unknown error'}`)
    }

    let res: EventBin[] = []
    simulateRes.events?.forEach((item: any) => {
      if (extractStructTagFromType(item.type).name === `EventFetchBins`) {
        const { bins } = item.parsedJson
        res = bins
      }
    })
    res.forEach((bin) => {
      bin.real_bin_id = get_real_id(Number(bin.storage_id))
    })
    return res.sort((a, b) => a.real_bin_id - b.real_bin_id)
  }

  // /**
  //  * Gets a list of positions for the given account address.
  //  * @param accountAddress The account address to get positions for.
  //  * @param assignPoolIds An array of pool IDs to filter the positions by.
  //  * @returns array of Position objects.
  //  */
  // async getUserPositionById(positionId: string, showDisplay = true): Promise<AlmmPositionInfo> {
  //   let position
  //   const ownerRes: any = await this._sdk.fullClient.getObject({
  //     id: positionId,
  //     options: { showContent: true, showType: true, showDisplay, showOwner: true },
  //   })

  //   const type = extractStructTagFromType(ownerRes.data.type)
  //   if (type.full_address === this.buildPositionType()) {
  //     position = this.buildPosition(ownerRes)
  //   } else {
  //     throw new ClmmpoolsError(`Almm Position not exists. Get Position error:${ownerRes.error}`, PositionErrorCode.InvalidPositionObject)
  //   }
  //   const poolMap = new Set<string>()
  //   poolMap.add(position.pool)
  //   const pool = (await this.getPoolInfo(Array.from(poolMap)))[0]
  //   const _params: GetPairRewarderParams[] = []
  //   _params.push({
  //     pool_id: pool.pool_id,
  //     coin_a: pool.coin_a,
  //     coin_b: pool.coin_b,
  //   })

  //   const pool_reward_coins = await this.getPairRewarders(_params)
  //   // 1. Get Liquidity
  //   // 2. Get rewards
  //   // 3. Get fees
  //   const positionLiquidity = await this.getPositionLiquidity({
  //     pair: position.pool,
  //     positionId: position.pos_object_id,
  //     coinTypeA: pool!.coin_a,
  //     coinTypeB: pool!.coin_b,
  //   })
  //   const rewards_token = pool_reward_coins.get(position.pool) || []
  //   let positionRewards: AlmmEventEarnedRewards = { position_id: position.pos_object_id, reward: [], amount: [] }
  //   if (rewards_token.length > 0) {
  //     positionRewards = await this.getEarnedRewards({
  //       pool_id: position.pool,
  //       position_id: position.pos_object_id,
  //       coin_a: pool!.coin_a,
  //       coin_b: pool!.coin_b,
  //       rewards_token: pool_reward_coins.get(position.pool) || [],
  //     })
  //   }

  //   const positionFees = await this.getEarnedFees({
  //     pool_id: position.pool,
  //     position_id: position.pos_object_id,
  //     coin_a: pool!.coin_a,
  //     coin_b: pool!.coin_b,
  //   })

  //   return {
  //     position,
  //     liquidity: positionLiquidity,
  //     rewards: positionRewards,
  //     fees: positionFees,
  //     contractPool: pool,
  //   }
  // }

  /**
   * Gets a list of positions for the given account address.
   * @param positionId The account address to get positions for.
   * @param assignPoolIds An array of pool IDs to filter the positions by.
   * @returns array of Position objects.
   */
  async getUserPositionById(positionId: string, showDisplay = true): Promise<AlmmPositionInfo[]> {
    const allPosition = []
    const ownerRes = await this._sdk.fullClient.getObject({
      id: positionId,
      options: { showContent: true, showType: true, showDisplay, showOwner: true },
    })
    if (ownerRes.data) {
      const type = extractStructTagFromType(ownerRes.data.type!)
      if (type.full_address === this.buildPositionType()) {
        const position = this.buildPosition(ownerRes)
        const cacheKey = `${position.pos_object_id}_getPositionList`
        this.updateCache(cacheKey, position, cacheTime24h)
        allPosition.push(position)
      }
      return await this.getUserPositionInfo(allPosition)
    }
    return []
  }

  /**
   * Gets a list of positions for the given account address.
   * @param accountAddress The account address to get positions for.
   * @param assignPoolIds An array of pool IDs to filter the positions by.
   * @param showDisplay When some testnet rpc nodes can't return object's display data, you can set this option to false, avoid returning errors. Default set true.
   * @returns array of Position objects.
   */
  async getUserPositions(accountAddress: string, assignPoolIds: string[] = [], showDisplay = true): Promise<AlmmPositionInfo[]> {
    const allPosition = []
    const ownerRes: any = await this._sdk.fullClient.getOwnedObjectsByPage(accountAddress, {
      options: { showType: true, showContent: true, showDisplay, showOwner: true },
      filter: { Package: this._sdk.sdkOptions.almm_pool.package_id },
    })

    const hasAssignPoolIds = assignPoolIds.length > 0
    for (const item of ownerRes.data as any[]) {
      const type = extractStructTagFromType(item.data.type)

      if (type.full_address === this.buildPositionType()) {
        const position = this.buildPosition(item)
        const cacheKey = `${position.pos_object_id}_getPositionList`
        this.updateCache(cacheKey, position, cacheTime24h)
        if (hasAssignPoolIds) {
          if (assignPoolIds.includes(position.pool)) {
            allPosition.push(position)
          }
        } else {
          allPosition.push(position)
        }
      }
    }
    return this.getUserPositionInfo(allPosition)
  }

  private async getUserPositionInfo(allPosition: AlmmPosition[]): Promise<AlmmPositionInfo[]> {
    const poolMap = new Set<string>()
    for (const item of allPosition) {
      poolMap.add(item.pool)
    }
    const poolList = await this.getPoolInfo(Array.from(poolMap))
    const _params: GetPairRewarderParams[] = []

    for (const pool of poolList) {
      _params.push({
        pool_id: pool.pool_id,
        coin_a: pool.coin_a,
        coin_b: pool.coin_b,
      })
    }

    const pool_reward_coins = await this.getPairRewarders(_params)

    const positionsLiquidityRes: EventPositionLiquidity[] = []
    const positionsRewardsRes: AlmmEventEarnedRewards[] = []
    const positionsFeesRes: AlmmEventEarnedFees[] = []

    // 1. Get Liquidity
    // 2. Get rewards
    // 3. Get fees
    for (const item of allPosition) {
      const pool = poolList.find((pool) => pool.pool_id === item.pool)
      const tx = new Transaction()
      this._getPositionLiquidity(
        {
          pair: item.pool,
          positionId: item.pos_object_id,
          coinTypeA: pool!.coin_a,
          coinTypeB: pool!.coin_b,
        },
        tx
      )
      if (pool_reward_coins.has(item.pool) && pool_reward_coins.get(item.pool)?.length !== 0) {
        this._getEarnedRewards(
          {
            pool_id: item.pool,
            position_id: item.pos_object_id,
            coin_a: pool!.coin_a,
            coin_b: pool!.coin_b,
            rewards_token: pool_reward_coins.get(item.pool) || [],
          },
          tx
        )
      }
      this._getEarnedFees(
        {
          pool_id: item.pool,
          position_id: item.pos_object_id,
          coin_a: pool!.coin_a,
          coin_b: pool!.coin_b,
        },
        tx
      )

      const { simulationAccount } = this.sdk.sdkOptions
      const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
        transactionBlock: tx,
        sender: simulationAccount.address,
      })

      if (simulateRes.error != null) {
        throw new Error(`fetchPositionLiquidity error code: ${simulateRes.error ?? 'unknown error'}`)
      }

      simulateRes.events?.forEach((item: any) => {
        if (extractStructTagFromType(item.type).name === `EventPositionLiquidity`) {
          positionsLiquidityRes.push({
            position_id: item.parsedJson.position_id,
            shares: item.parsedJson.shares,
            liquidity: item.parsedJson.liquidity,
            x_equivalent: item.parsedJson.x_equivalent,
            y_equivalent: item.parsedJson.y_equivalent,
            bin_real_ids: (item.parsedJson.bin_ids as number[]).map((id) => get_real_id(id)),
            bin_x_eq: item.parsedJson.bin_x_eq,
            bin_y_eq: item.parsedJson.bin_y_eq,
            bin_liquidity: item.parsedJson.bin_liquidity,
          })
        }
        if (extractStructTagFromType(item.type).name === `EventEarnedFees`) {
          positionsFeesRes.push({
            position_id: item.parsedJson.position_id,
            x: item.parsedJson.x.name,
            y: item.parsedJson.y.name,
            fee_x: item.parsedJson.fee_x,
            fee_y: item.parsedJson.fee_y,
          })
        }
        if (extractStructTagFromType(item.type).name === `EventEarnedRewards`) {
          positionsRewardsRes.push({
            position_id: item.parsedJson.position_id,
            reward: [item.parsedJson.reward.name],
            amount: [item.parsedJson.amount],
          })
        }
        if (extractStructTagFromType(item.type).name === `EventEarnedRewards2`) {
          positionsRewardsRes.push({
            position_id: item.parsedJson.position_id,
            reward: [item.parsedJson.reward1.name, item.parsedJson.reward2.name],
            amount: [item.parsedJson.amount1, item.parsedJson.amount2],
          })
        }
        if (extractStructTagFromType(item.type).name === `EventEarnedRewards3`) {
          positionsRewardsRes.push({
            position_id: item.parsedJson.position_id,
            reward: [item.parsedJson.reward1.name, item.parsedJson.reward2.name, item.parsedJson.reward3.name],
            amount: [item.parsedJson.amount1, item.parsedJson.amount2, item.parsedJson.amount3],
          })
        }
      })
    }

    const out = []
    for (let i = 0; i < allPosition.length; i++) {
      const item = allPosition[i]
      const pool = poolList.find((pool) => pool.pool_id === item.pool)
      const positionLiquidity = positionsLiquidityRes.find((liquidity) => liquidity.position_id === item.pos_object_id)
      const positionRewards = positionsRewardsRes.find((rewards) => rewards.position_id === item.pos_object_id)
      const positionFees = positionsFeesRes.find((fees) => fees.position_id === item.pos_object_id)
      out.push({
        position: allPosition[i],
        liquidity: positionLiquidity!,
        rewards: positionRewards || { position_id: item.pos_object_id, reward: [], amount: [] },
        fees: positionFees!,
        contractPool: pool!,
        coin_type_a: pool?.coin_a || '',
        coin_type_b: pool?.coin_b || '',
      })
    }

    return out
  }

  private buildPosition(object: SuiObjectResponse): AlmmPosition {
    if (object.error != null || object.data?.content?.dataType !== 'moveObject') {
      throw new ClmmpoolsError(`Almm Position not exists. Get Position error:${object.error}`, PositionErrorCode.InvalidPositionObject)
    }
    const fields = getObjectFields(object)

    const ownerWarp = getObjectOwner(object) as {
      AddressOwner: string
    }

    // adapter new/old bin format
    let bin_real_ids = [];
    if (fields.bin_count) {
      bin_real_ids = new Array(fields.bin_count).fill(1).map((_, index) => get_real_id(fields.bin_start + index))
    } else {
      bin_real_ids = (fields.bin_ids as number[]).map((id) => get_real_id(id))
    }
    return {
      pos_object_id: fields.id.id,
      owner: ownerWarp.AddressOwner,
      pool: fields.pair_id,
      bin_real_ids,
      type: '',
    }
  }

  // return [coin_a, coin_b]
  private async getPoolCoins(pools: string[]): Promise<Map<string, string[]>> {
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

  private buildPositionType(): string {
    return `${this._sdk.sdkOptions.almm_pool.package_id}::almm_position::Position`
  }

  async getPositionsLiquidityLimit(params: GetPositionLiquidityParams[]): Promise<EventPositionLiquidity[]> {
    const out: EventPositionLiquidity[] = []
    const limit = 2

    for (let i = 0; i < params.length; i += limit) {
      if (i + limit >= params.length) {
        const res = await this.getPositionsLiquidity(params.slice(i, params.length))
        out.push(...res)
        return out
      }
      const res = await this.getPositionsLiquidity(params.slice(i, i + limit))
      out.push(...res)
    }
    return out
  }

  private async getPositionsLiquidity(params: GetPositionLiquidityParams[]): Promise<EventPositionLiquidity[]> {
    let tx = new Transaction()
    for (const param of params) {
      tx = await this._getPositionLiquidity(param, tx)
    }
    return this._parsePositionLiquidity(tx)
  }

  private async _getPositionLiquidity(params: GetPositionLiquidityParams, tx?: Transaction): Promise<Transaction> {
    tx = tx || new Transaction()
    const { integrate } = this.sdk.sdkOptions

    const typeArguments = [params.coinTypeA, params.coinTypeB]
    const args = [tx.object(params.pair), tx.object(params.positionId)]

    tx.moveCall({
      target: `${integrate.published_at}::${AlmmScript}::position_liquidity`,
      arguments: args,
      typeArguments,
    })
    return tx
  }

  private async _parsePositionLiquidity(tx: Transaction): Promise<EventPositionLiquidity[]> {
    const { simulationAccount } = this.sdk.sdkOptions
    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    if (simulateRes.error != null) {
      throw new Error(`fetchPositionLiquidity error code: ${simulateRes.error ?? 'unknown error'}`)
    }

    const out: EventPositionLiquidity[] = []
    simulateRes.events?.forEach((item: any) => {
      if (extractStructTagFromType(item.type).name === `EventPositionLiquidity`) {
        out.push({
          position_id: item.parsedJson.position_id,
          shares: item.parsedJson.shares,
          liquidity: item.parsedJson.liquidity,
          x_equivalent: item.parsedJson.x_equivalent,
          y_equivalent: item.parsedJson.y_equivalent,
          bin_real_ids: (item.parsedJson.bin_ids as number[]).map((id) => get_real_id(id)),
          bin_x_eq: item.parsedJson.bin_x_eq,
          bin_y_eq: item.parsedJson.bin_y_eq,
          bin_liquidity: item.parsedJson.bin_liquidity,
        })
      }
    })
    return out
  }

  async getPairLiquidity(params: GetPairLiquidityParams): Promise<EventPairLiquidity> {
    const tx = new Transaction()
    const { integrate, simulationAccount } = this.sdk.sdkOptions

    const typeArguments = [params.coinTypeA, params.coinTypeB]
    const args = [tx.object(params.pair)]

    tx.moveCall({
      target: `${integrate.published_at}::${AlmmScript}::pair_liquidity`,
      arguments: args,
      typeArguments,
    })

    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    if (simulateRes.error != null) {
      throw new Error(`getPairLiquidity error code: ${simulateRes.error ?? 'unknown error'}`)
    }

    const out: EventPairLiquidity = {
      shares: 0,
      liquidity: 0,
      x: 0,
      y: 0,
      bin_ids: [],
      bin_x: [],
      bin_y: [],
    }
    simulateRes.events?.forEach((item: any) => {
      if (extractStructTagFromType(item.type).name === `EventPositionLiquidity`) {
        out.shares = item.parsedJson.shares
        out.liquidity = item.parsedJson.liquidity
        out.x = item.parsedJson.x
        out.y = item.parsedJson.y
        out.bin_ids = item.bin_ids
        out.bin_x = item.bin_x
        out.bin_y = item.bin_y
      }
    })
    return out
  }

  async getEarnedFeesLimit(params: AlmmCollectFeeParams[]): Promise<AlmmEventEarnedFees[]> {
    const out: AlmmEventEarnedFees[] = []
    const limit = 2

    for (let i = 0; i < params.length; i += limit) {
      if (i + limit >= params.length) {
        const res = await this.getEarnedFees(params.slice(i, params.length))
        out.push(...res)
        return out
      }
      const res = await this.getEarnedFees(params.slice(i, i + limit))
      out.push(...res)
    }
    return out
  }

  private async getEarnedFees(params: AlmmCollectFeeParams[]): Promise<AlmmEventEarnedFees[]> {
    let tx = new Transaction()
    for (const param of params) {
      tx = await this._getEarnedFees(param, tx)
    }
    return this._parseEarnedFees(tx)
  }

  private async _getEarnedFees(params: AlmmCollectFeeParams, tx?: Transaction): Promise<Transaction> {
    tx = tx || new Transaction()
    const { integrate } = this.sdk.sdkOptions

    const typeArguments = [params.coin_a, params.coin_b]
    const args = [tx.object(params.pool_id), tx.object(params.position_id)]

    tx.moveCall({
      target: `${integrate.published_at}::${AlmmScript}::earned_fees`,
      arguments: args,
      typeArguments,
    })
    return tx
  }

  private async _parseEarnedFees(tx: Transaction): Promise<AlmmEventEarnedFees[]> {
    const { simulationAccount } = this.sdk.sdkOptions
    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    const out: AlmmEventEarnedFees[] = []
    if (simulateRes.error != null) {
      throw new Error(`fetchPairRewards error code: ${simulateRes.error ?? 'unknown error'}`)
    }
    simulateRes.events?.forEach((item: any) => {
      if (extractStructTagFromType(item.type).name === `EventEarnedFees`) {
        out.push({
          position_id: item.parsedJson.position_id,
          x: item.parsedJson.x.name,
          y: item.parsedJson.y.name,
          fee_x: item.parsedJson.fee_x,
          fee_y: item.parsedJson.fee_y,
        })
      }
    })
    return out
  }

  async getEarnedRewards(params: AlmmRewardsParams[]): Promise<AlmmEventEarnedRewards[]> {
    let tx = new Transaction()
    for (const param of params) {
      if (param.rewards_token.length !== 0) {
        tx = await this._getEarnedRewards(param, tx)
      }
    }
    return this._parseEarnedRewards(tx)
  }

  private async _getEarnedRewards(params: AlmmRewardsParams, tx?: Transaction): Promise<Transaction> {
    tx = tx || new Transaction()
    const { integrate } = this.sdk.sdkOptions

    const typeArguments = [params.coin_a, params.coin_b, ...params.rewards_token]

    const args = [tx.object(params.pool_id), tx.object(params.position_id), tx.object(CLOCK_ADDRESS)]
    let target = `${integrate.published_at}::${AlmmScript}::earned_rewards`
    if (params.rewards_token.length > 1) {
      target = `${integrate.published_at}::${AlmmScript}::earned_rewards${params.rewards_token.length}`
    }

    tx.moveCall({
      target,
      arguments: args,
      typeArguments,
    })

    return tx
  }

  private async _parseEarnedRewards(tx: Transaction): Promise<AlmmEventEarnedRewards[]> {
    const { simulationAccount } = this.sdk.sdkOptions
    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    const res: AlmmEventEarnedRewards[] = []
    if (simulateRes.error != null) {
      throw new Error(`getEarnedRewards error code: ${simulateRes.error ?? 'unknown error'}`)
    }
    simulateRes.events?.forEach((item: any) => {
      if (extractStructTagFromType(item.type).name === `EventEarnedRewards`) {
        res.push({
          position_id: item.parsedJson.position_id,
          reward: [item.parsedJson.reward.name],
          amount: [item.parsedJson.amount],
        })
      } else if (extractStructTagFromType(item.type).name === `EventEarnedRewards2`) {
        res.push({
          position_id: item.parsedJson.position_id,
          reward: [item.parsedJson.reward1.name, item.parsedJson.reward2.name],
          amount: [item.parsedJson.amount1, item.parsedJson.amount2],
        })
      } else if (extractStructTagFromType(item.type).name === `EventEarnedRewards3`) {
        res.push({
          position_id: item.parsedJson.position_id,
          reward: [item.parsedJson.reward1.name, item.parsedJson.reward2.name, item.parsedJson.reward3.name],
          amount: [item.parsedJson.amount1, item.parsedJson.amount2, item.parsedJson.amount3],
        })
      }
    })
    return res
  }

  // return pool_id => reward_tokens
  async getPairRewarders(params: GetPairRewarderParams[]): Promise<Map<string, string[]>> {
    let tx = new Transaction()
    for (const param of params) {
      tx = await this._getPairRewarders(param, tx)
    }
    return this._parsePairRewarders(tx)
  }

  private async _getPairRewarders(params: GetPairRewarderParams, tx?: Transaction): Promise<Transaction> {
    tx = tx || new Transaction()
    const { integrate } = this.sdk.sdkOptions

    const typeArguments = [params.coin_a, params.coin_b]
    const args = [tx.object(params.pool_id)]

    tx.moveCall({
      target: `${integrate.published_at}::${AlmmScript}::get_pair_rewarders`,
      arguments: args,
      typeArguments,
    })
    return tx
  }

  private async _parsePairRewarders(tx: Transaction): Promise<Map<string, string[]>> {
    const { simulationAccount } = this.sdk.sdkOptions

    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    const out = new Map<string, string[]>()
    if (simulateRes.error != null) {
      throw new Error(`getPairReward error code: ${simulateRes.error ?? 'unknown error'}`)
    }
    simulateRes.events?.forEach((item: any) => {
      if (extractStructTagFromType(item.type).name === `EventPairRewardTypes`) {
        const pairRewards: AlmmEventPairRewardTypes = {
          pair_id: '',
          tokens: [],
        }

        pairRewards.pair_id = item.parsedJson.pair_id
        item.parsedJson.tokens.forEach((token: any) => {
          pairRewards.tokens.push(token.name)
        })

        out.set(pairRewards.pair_id, pairRewards.tokens)
      }
    })
    return out
  }

  /**
   * Updates the cache for the given key.
   *
   * @param key The key of the cache entry to update.
   * @param data The data to store in the cache.
   * @param time The time in minutes after which the cache entry should expire.
   */
  updateCache(key: string, data: SuiResource, time = cacheTime5min) {
    let cacheData = this._cache[key]
    if (cacheData) {
      cacheData.overdueTime = getFutureTime(time)
      cacheData.value = data
    } else {
      cacheData = new CachedContent(data, getFutureTime(time))
    }
    this._cache[key] = cacheData
  }

  /**
   * Gets the cache entry for the given key.
   *
   * @param key The key of the cache entry to get.
   * @param forceRefresh Whether to force a refresh of the cache entry.
   * @returns The cache entry for the given key, or undefined if the cache entry does not exist or is expired.
   */
  getCache<T>(key: string, forceRefresh = false): T | undefined {
    const cacheData = this._cache[key]
    const isValid = cacheData?.isValid()
    if (!forceRefresh && isValid) {
      return cacheData.value as T
    }
    if (!isValid) {
      delete this._cache[key]
    }
    return undefined
  }
}
