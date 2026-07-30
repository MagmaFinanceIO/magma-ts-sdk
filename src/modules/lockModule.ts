import { Transaction } from '@mysten/sui/transactions'
import { ClmmpoolsError, LockErrorCode } from '../errors/errors'
import {
  CreateLockParams,
  IncreaseLockAmountParams,
  MergeLockParams,
  TransferLockParams,
  IncreaseUnlockTimeParams,
  LockPermanentParams,
  VoteParams,
  ClaimFeesParams as ClaimVotingRewardsParams,
  ClaimFeesPoolsParams as ClaimVotingRewardsPoolsParams,
  ClaimAndLockParams,
  PokeParams,
  VotingEscrow,
  CLOCK_ADDRESS,
  getPackagerConfigs,
  Voter,
} from '../types'
import { checkInvalidSuiAddress, extractStructTagFromType, getObjectFields } from '../utils'
import { IModule } from '../interfaces/IModule'
import { MagmaClmmSDK } from '../sdk'
import { TransactionUtil } from '../utils/transaction-util'

type LockID = string
type PoolID = string

type LocksInfo = {
  owner: string
  lockInfo: LockInfo[]
}

type AllLockSummary = {
  current_epoch_end: number
  current_epoch_vote_end: number
  rebase_apr: number
  team_emission_rate: number
  total_locked: number
  total_voted_power: number
  total_voting_power: number
}

type LockInfo = {
  lock_id: string
  amount: string
  start: string
  end: string
  permanent: boolean

  rebase_amount: Coin
  voting_power: string
  voting_rewards: Map<string, Coin[]> // pool => incentiveTokenAmount / feeTokenAmount
}

type Coin = {
  kind?: CoinType
  token_addr: string
  amount: string
}

enum CoinType {
  RebaseCoin = 'rebaseCoin',
  Fee = 'fee',
  Incentive = 'incentiveCoin',
}

type PoolWeight = {
  poolId: string
  weight: string
}

type ALockSummary = {
  fee_incentive_total: string
  reward_distributor_claimable: string
  voting_power: string
}

function simulationEventsByName(simulateRes: any, eventName: string): any[] {
  return (
    simulateRes.events?.filter((item: any) => {
      return extractStructTagFromType(item.type).name === eventName
    }) ?? []
  )
}

function requireSimulationEvents(simulateRes: any, eventName: string, context: string): any[] {
  const events = simulationEventsByName(simulateRes, eventName)
  if (events.length === 0) {
    throw new Error(`${context} simulation did not emit ${eventName}`)
  }
  return events
}

export type AddBribeReward = {
  poolId: string
  amount: string
  coinType: string
}

export type LockVoteEvent = {
  lock_id: string
  last_voted_at: string
  pools: string[]
  votes: string[]
}

export class LockModule implements IModule {
  protected _sdk: MagmaClmmSDK

  constructor(sdk: MagmaClmmSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  async createLockTransactionPayload(params: CreateLockParams): Promise<Transaction> {
    if (this._sdk.senderAddress.length === 0) {
      throw Error('this config sdk senderAddress is empty')
    }
    const allCoinAsset = await this._sdk.getOwnerCoinAssets(this._sdk.senderAddress)

    return TransactionUtil.buildCreateLockTransaction(this.sdk, params, allCoinAsset)
  }

  async increaseLockAmountTransactionPayload(params: IncreaseLockAmountParams): Promise<Transaction> {
    if (this._sdk.senderAddress.length === 0) {
      throw Error('this config sdk senderAddress is empty')
    }
    const allCoinAsset = await this._sdk.getOwnerCoinAssets(this._sdk.senderAddress)

    return TransactionUtil.buildIncreaseLockAmountTransaction(this.sdk, params, allCoinAsset)
  }

  async mergeLockTransactionPayload(params: MergeLockParams): Promise<Transaction> {
    if (this._sdk.senderAddress.length === 0) {
      throw Error('this config sdk senderAddress is empty')
    }

    return TransactionUtil.buildMergeLockTransaction(this.sdk, params)
  }

  // public fun transfer<T>(lock: Lock, ve: &mut VotingEscrow<T>, to: address, clock: &Clock, ctx: &mut TxContext) {
  async transferLockTransactionPayload(params: TransferLockParams): Promise<Transaction> {
    if (this._sdk.senderAddress.length === 0) {
      throw Error('this config sdk senderAddress is empty')
    }

    return TransactionUtil.buildTransferLockTransaction(this.sdk, params)
  }

  async increaseUnlockTimePayload(params: IncreaseUnlockTimeParams): Promise<Transaction> {
    if (this._sdk.senderAddress.length === 0) {
      throw Error('this config sdk senderAddress is empty')
    }

    return TransactionUtil.buildIncreaseUnlockTimeTransaction(this.sdk, params)
  }

  // public fun lock_permanent<T>(self: &mut VotingEscrow<T>, lock: &mut Lock, clock: &Clock, ctx: &mut TxContext) {
  async lockPermanentPayload(params: LockPermanentParams): Promise<Transaction> {
    if (this._sdk.senderAddress.length === 0) {
      throw Error('this config sdk senderAddress is empty')
    }

    return TransactionUtil.buildLockPermanentTransaction(this.sdk, params)
  }

  async unlockPermanentPayload(params: LockPermanentParams): Promise<Transaction> {
    if (this._sdk.senderAddress.length === 0) {
      throw Error('this config sdk senderAddress is empty')
    }

    return TransactionUtil.buildUnlockPermanentTransaction(this.sdk, params)
  }

  async votePayload(params: VoteParams): Promise<Transaction> {
    if (this._sdk.senderAddress.length === 0) {
      throw Error('this config sdk senderAddress is empty')
    }

    return TransactionUtil.buildVoteTransaction(this.sdk, params)
  }

  // public fun claim_fees<T, B>(self: &mut Voter<T>, ve: &mut VotingEscrow<T>, mut locks: vector<Lock>, clock: &Clock, ctx: &mut TxContext) {
  async claimVotingRewardsPayload(params: ClaimVotingRewardsParams): Promise<Transaction> {
    if (this._sdk.senderAddress.length === 0) {
      throw Error('this config sdk senderAddress is empty')
    }

    return TransactionUtil.buildClaimVotingRewardsTransaction(this.sdk, params)
  }

  // public fun claim_fees<T, B>(self: &mut Voter<T>, ve: &mut VotingEscrow<T>, mut locks: vector<Lock>, clock: &Clock, ctx: &mut TxContext) {
  async claimVotingRewardsPoolsPayload(params: ClaimVotingRewardsPoolsParams): Promise<Transaction> {
    if (this._sdk.senderAddress.length === 0) {
      throw Error('this config sdk senderAddress is empty')
    }

    return TransactionUtil.buildClaimVotingRewardsPoolsTransaction(this.sdk, params)
  }

  async claimAndLockRebasesPayload(params: ClaimAndLockParams): Promise<Transaction> {
    if (this._sdk.senderAddress.length === 0) {
      throw Error('this config sdk senderAddress is empty')
    }
    return TransactionUtil.buildClaimAndLockRebases(this.sdk, params)
  }

  async burnLockTransactionPayload(lockId: string): Promise<Transaction> {
    if (this._sdk.senderAddress.length === 0) {
      throw Error('this config sdk senderAddress is empty')
    }
    return TransactionUtil.buildBurnLockTransaction(this.sdk, lockId)
  }

  async pokePayload(params: PokeParams): Promise<Transaction> {
    if (this._sdk.senderAddress.length === 0) {
      throw Error('this config sdk senderAddress is empty')
    }
    return TransactionUtil.buildPoke(this.sdk, params)
  }

  async addBribeReward(params: AddBribeReward): Promise<Transaction> {
    if (this._sdk.senderAddress.length === 0) {
      throw Error('this config sdk senderAddress is empty')
    }

    const tx = new Transaction()
    tx.setSender(this.sdk.senderAddress)

    const { integrate, ve33 } = this.sdk.sdkOptions
    const { magma_token, voter_id } = getPackagerConfigs(ve33)
    const typeArguments = [magma_token, params.coinType]
    const allCoinAsset = await this._sdk.getOwnerCoinAssets(this._sdk.senderAddress)
    const coinInput = TransactionUtil.buildCoinForAmount(tx, allCoinAsset, BigInt(params.amount), params.coinType, false, true)

    const args = [tx.object(voter_id), tx.object(params.poolId), coinInput.targetCoin, tx.object(CLOCK_ADDRESS)]
    tx.moveCall({
      target: `${integrate.published_at}::${Voter}::add_bribe_reward`,
      typeArguments,
      arguments: args,
    })
    return tx
  }

  async claimVotingBribe(locks: string[], incentive_tokens: string[]): Promise<Transaction> {
    if (this._sdk.senderAddress.length === 0) {
      throw Error('this config sdk senderAddress is empty')
    }
    return TransactionUtil.buildClaimVotingBribe(this.sdk, locks, incentive_tokens)
  }

  async claimVotingFeeAndBribeForPool(
    lockId: string,
    poolId: string,
    feeTokens: string[],
    incentiveTokens: string[]
  ): Promise<Transaction> {
    if (feeTokens.length !== 2) {
      throw Error('feeTokens length must be 2')
    }
    if (incentiveTokens.length < 1 || incentiveTokens.length > 3) {
      throw Error('incentiveTokens length must be between 1 and 3')
    }

    const { integrate, ve33 } = this.sdk.sdkOptions
    const { voting_escrow_id, magma_token, voter_id } = getPackagerConfigs(ve33)
    const typeArguments = [magma_token, ...feeTokens, ...incentiveTokens]

    let targetFunc = `${integrate.published_at}::${Voter}::claim_voting_bribes_for_single_pool${incentiveTokens.length}`
    if (incentiveTokens.length === 1) {
      targetFunc = `${integrate.published_at}::${Voter}::claim_voting_bribes_for_single_pool`
    }

    const tx = new Transaction()
    tx.setSender(this.sdk.senderAddress)
    const args = [tx.object(voter_id), tx.object(voting_escrow_id), tx.object(lockId), tx.object(poolId), tx.object(CLOCK_ADDRESS)]
    tx.moveCall({
      target: targetFunc,
      typeArguments,
      arguments: args,
    })
    return tx
  }

  async fastLocksOfUser(user: string): Promise<LocksInfo> {
    const locksInfo: LocksInfo = { owner: user, lockInfo: [] }
    const { distribution, ve33 } = this._sdk.sdkOptions //  getPackagerConfigs(this._sdk.sdkOptions.magma_config)
    const { magma_token } = getPackagerConfigs(ve33)

    // all objects
    const ownerRes = await this._sdk.fullClient.getOwnedObjectsByPage(user, {
      options: { showType: true, showContent: true, showDisplay: true, showOwner: true },
      filter: {
        MatchAll: [{ Package: distribution.package_id }, { StructType: `${distribution.package_id}::voting_escrow::Lock` }],
      },
    })

    for (const item of ownerRes.data as any[]) {
      try {
        const { fields } = item.data.content
        const aLockSummary = await this.aLockSummary(fields.id.id)
        const lockInfo: LockInfo = {
          lock_id: fields.id.id,
          amount: fields.amount,
          start: fields.start,
          end: fields.end,
          permanent: fields.permanent,

          rebase_amount: {
            kind: CoinType.RebaseCoin,
            token_addr: magma_token,
            amount: aLockSummary.reward_distributor_claimable,
          },
          voting_power: aLockSummary.voting_power,
          voting_rewards: new Map<string, Coin[]>(),
        }

        locksInfo.lockInfo.push(lockInfo)
      } catch (error) {
        console.error('fastLocksOfUser error', error)
      }
    }
    return locksInfo
  }

  async locksOfUserV2(user: string): Promise<LocksInfo> {
    const locksInfo: LocksInfo = { owner: user, lockInfo: [] }
    const { distribution, ve33 } = this._sdk.sdkOptions //  getPackagerConfigs(this._sdk.sdkOptions.magma_config)
    const { magma_token } = getPackagerConfigs(ve33)

    // all objects
    const ownerRes = await this._sdk.fullClient.getOwnedObjectsByPage(user, {
      options: { showType: true, showContent: true, showDisplay: true, showOwner: true },
      filter: {
        MatchAll: [{ Package: distribution.package_id }, { StructType: `${distribution.package_id}::voting_escrow::Lock` }],
      },
    })

    // const lockSummary = new Map<string, ALockSummary>()
    const ids = ownerRes.data
      .map((item: any) => item.data?.content?.fields?.id?.id ?? item.data?.objectId)
      .filter((id: string | undefined): id is string => Boolean(id))
    const lockSummary = await this.getAllLockSummary(ids)
    const lockIncentiveTokens = await this.getAllBribeRewardTokensOfLock(ids) // all IncentiveTokens of LockId
    const lockFeeTokens = await this.getAllVotingFeeRewardTokens(ids) // all FeeTokens of LockId

    const poolIncentiveRewards = await this.getAllIncentiveRewards(lockIncentiveTokens)
    const poolFeeRewards = await this.getAllFeeRewards(lockFeeTokens)

    for (const item of ownerRes.data as any[]) {
      const { fields } = item.data.content
      const lock_id = fields.id.id

      // pool => coin...
      const votingRewards = new Map<string, Coin[]>() // pool => rewardTokens
      poolIncentiveRewards.get(lock_id)?.forEach((value, pool) => {
        if (!votingRewards.has(pool)) {
          votingRewards.set(pool, [])
        }
        votingRewards.get(pool)?.push(...value)
      })
      poolFeeRewards.get(lock_id)?.forEach((value, pool) => {
        if (!votingRewards.has(pool)) {
          votingRewards.set(pool, [])
        }
        votingRewards.get(pool)?.push(...value)
      })

      const lockInfo: LockInfo = {
        lock_id,
        amount: fields.amount,
        start: fields.start,
        end: fields.end,
        permanent: fields.permanent,

        rebase_amount: {
          kind: CoinType.RebaseCoin,
          token_addr: magma_token,
          amount: lockSummary.get(lock_id)?.reward_distributor_claimable || '0',
        },
        voting_power: lockSummary.get(lock_id)?.voting_power || '0',
        // pool => incentive/fee => amount
        voting_rewards: votingRewards,
      }

      locksInfo.lockInfo.push(lockInfo)
    }
    return locksInfo
  }

  async locksOfUser(user: string): Promise<LocksInfo> {
    const locksInfo: LocksInfo = { owner: user, lockInfo: [] }
    const { distribution, ve33 } = this._sdk.sdkOptions //  getPackagerConfigs(this._sdk.sdkOptions.magma_config)
    const { magma_token } = getPackagerConfigs(ve33)

    // all objects
    const ownerRes = await this._sdk.fullClient.getOwnedObjectsByPage(user, {
      options: { showType: true, showContent: true, showDisplay: true, showOwner: true },
      filter: {
        MatchAll: [{ Package: distribution.package_id }, { StructType: `${distribution.package_id}::voting_escrow::Lock` }],
      },
    })

    for (const item of ownerRes.data as any[]) {
      try {
        const { fields } = item.data.content

        const aLockSummary = await this.aLockSummary(fields.id.id)
        const poolIncentiveTokens = await this.getVotingBribeRewardTokens(fields.id.id)
        const poolFeeTokens = await this.getVotingFeeRewardTokens(fields.id.id)

        const incentiveTokens: string[] = []
        poolIncentiveTokens.forEach((value) => {
          incentiveTokens.push(...value)
        })

        const feeTokens: string[] = []
        poolFeeTokens.forEach((value) => {
          feeTokens.push(...value)
        })

        // coin => pool => amount
        const poolIncentiveRewards = await this.getPoolIncentiveRewards(fields.id.id, incentiveTokens)
        const votingRewards = new Map<string, Coin[]>() // pool => rewardTokens
        poolIncentiveRewards.forEach((value, coin) => {
          value.forEach((amount, pool) => {
            if (!votingRewards.has(pool)) {
              votingRewards.set(pool, [])
            }
            votingRewards.get(pool)?.push({
              kind: CoinType.Incentive,
              token_addr: coin,
              amount: amount.toString(),
            })
          })
        })

        const poolFeeRewards = await this.getPoolFeeRewards(fields.id.id, feeTokens)
        // const feeRewards = new Map<string, Coin[]>()
        poolFeeRewards.forEach((value, coin) => {
          value.forEach((amount, pool) => {
            if (!votingRewards.has(pool)) {
              votingRewards.set(pool, [])
            }
            votingRewards.get(pool)?.push({
              kind: CoinType.Fee,
              token_addr: coin,
              amount: amount.toString(),
            })
          })
        })

        const lockInfo: LockInfo = {
          lock_id: fields.id.id,
          amount: fields.amount,
          start: fields.start,
          end: fields.end,
          permanent: fields.permanent,

          rebase_amount: {
            kind: CoinType.RebaseCoin,
            token_addr: magma_token,
            amount: aLockSummary.reward_distributor_claimable,
          },
          voting_power: aLockSummary.voting_power,
          // pool => incentive/fee => amount
          voting_rewards: votingRewards,
        }

        locksInfo.lockInfo.push(lockInfo)
      } catch (error) {
        console.error('locksOfUser error', error)
      }
    }
    return locksInfo
  }

  async aLockInfo(lockId: string): Promise<LockInfo> {
    const lockObj = await this._sdk.fullClient.getObject({
      id: lockId,
      options: {
        showContent: true,
        showDisplay: true,
        showOwner: true,
        showPreviousTransaction: true,
        showStorageRebate: true,
        showType: true,
      },
    })
    if (lockObj.error != null || lockObj.data?.content?.dataType !== 'moveObject') {
      throw new ClmmpoolsError(
        `getPool error code: ${lockObj.error?.code ?? 'unknown error'}, please check config and object id`,
        LockErrorCode.InvalidLockObject
      )
    }

    const { magma_token } = getPackagerConfigs(this.sdk.sdkOptions.ve33)

    const aLockSummary = await this.aLockSummary(lockId)
    const poolIncentiveTokens = await this.getVotingBribeRewardTokens(lockId)
    const poolFeeTokens = await this.getVotingFeeRewardTokens(lockId)

    const incentiveTokens: string[] = []
    poolIncentiveTokens.forEach((value) => {
      incentiveTokens.push(...value)
    })

    const feeTokens: string[] = []
    poolFeeTokens.forEach((value) => {
      feeTokens.push(...value)
    })

    const poolIncentiveRewards = await this.getPoolIncentiveRewards(lockId, incentiveTokens)
    const votingRewards = new Map<string, Coin[]>() // pool => rewardTokens
    poolIncentiveRewards.forEach((value, coin) => {
      value.forEach((amount, pool) => {
        if (!votingRewards.has(pool)) {
          votingRewards.set(pool, [])
        }
        votingRewards.get(pool)?.push({
          kind: CoinType.Incentive,
          token_addr: coin,
          amount: amount.toString(),
        })
      })
    })

    const poolFeeRewards = await this.getPoolFeeRewards(lockId, feeTokens)
    // const feeRewards = new Map<string, Coin[]>()
    poolFeeRewards.forEach((value, coin) => {
      value.forEach((amount, pool) => {
        if (!votingRewards.has(pool)) {
          votingRewards.set(pool, [])
        }
        votingRewards.get(pool)?.push({
          kind: CoinType.Fee,
          token_addr: coin,
          amount: amount.toString(),
        })
      })
    })

    const fields = getObjectFields(lockObj)

    const lockInfo: LockInfo = {
      lock_id: lockId,
      amount: fields.amount,
      start: fields.start,
      end: fields.end,
      permanent: fields.permanent,

      rebase_amount: {
        kind: CoinType.RebaseCoin,
        token_addr: magma_token,
        amount: aLockSummary.reward_distributor_claimable,
      },
      voting_power: aLockSummary.voting_power,
      voting_rewards: votingRewards,
    }
    return lockInfo
  }

  async aLockSummary(lock_id: string): Promise<ALockSummary> {
    const tx = new Transaction()
    const { integrate, simulationAccount, ve33 } = this.sdk.sdkOptions
    const { voting_escrow_id, magma_token, voter_id, reward_distributor_id } = getPackagerConfigs(ve33)
    const typeArguments = [magma_token]

    const args = [
      tx.object(voter_id),
      tx.object(voting_escrow_id),
      tx.object(reward_distributor_id),
      tx.object(lock_id),
      tx.object(CLOCK_ADDRESS),
    ]

    tx.moveCall({
      target: `${integrate.published_at}::${VotingEscrow}::lock_summary`,
      arguments: args,
      typeArguments,
    })

    if (!checkInvalidSuiAddress(simulationAccount.address)) {
      throw Error('this config simulationAccount is not set right')
    }
    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    if (simulateRes.error != null) {
      throw new Error(`lock_summary error code: ${simulateRes.error ?? 'unknown error'}`)
    }

    const [lockSummaryEvent] = requireSimulationEvents(simulateRes, 'LockSummary', 'lock_summary')
    const res: ALockSummary = {
      fee_incentive_total: lockSummaryEvent.parsedBcs.fee_incentive_total,
      reward_distributor_claimable: lockSummaryEvent.parsedBcs.reward_distributor_claimable,
      voting_power: lockSummaryEvent.parsedBcs.voting_power,
    }
    return res
  }

  // Return: lock_id => ALockSummary
  async getAllLockSummary(lock_ids: string[]): Promise<Map<LockID, ALockSummary>> {
    if (lock_ids.length === 0) {
      return new Map<LockID, ALockSummary>()
    }

    let tx = new Transaction()
    for (const lock_id of lock_ids) {
      tx = await this._aLockSummary(lock_id, tx)
    }
    return this._parseLockSummary(tx)
  }

  async _aLockSummary(lock_id: string, tx?: Transaction): Promise<Transaction> {
    tx = tx || new Transaction()

    const { integrate, simulationAccount, ve33 } = this.sdk.sdkOptions
    const { voting_escrow_id, magma_token, voter_id, reward_distributor_id } = getPackagerConfigs(ve33)
    const typeArguments = [magma_token]

    if (!checkInvalidSuiAddress(simulationAccount.address)) {
      throw Error('this config simulationAccount is not set right')
    }

    const args = [
      tx.object(voter_id),
      tx.object(voting_escrow_id),
      tx.object(reward_distributor_id),
      tx.object(lock_id),
      tx.object(CLOCK_ADDRESS),
    ]

    tx.moveCall({
      target: `${integrate.published_at}::${VotingEscrow}::lock_summary`,
      arguments: args,
      typeArguments,
    })
    return tx
  }

  async _parseLockSummary(tx: Transaction): Promise<Map<LockID, ALockSummary>> {
    const { simulationAccount } = this.sdk.sdkOptions
    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    if (simulateRes.error != null) {
      throw new Error(`lock_summary error code: ${simulateRes.error ?? 'unknown error'}`)
    }

    const res = new Map<LockID, ALockSummary>()
    requireSimulationEvents(simulateRes, 'LockSummary', 'lock_summary').forEach((item: any) => {
      res.set(item.parsedBcs.lock_id, {
        fee_incentive_total: item.parsedBcs.fee_incentive_total,
        reward_distributor_claimable: item.parsedBcs.reward_distributor_claimable,
        voting_power: item.parsedBcs.voting_power,
      })
    })
    return res
  }

  async allLockSummary(): Promise<AllLockSummary> {
    const tx = new Transaction()
    const { integrate, simulationAccount, ve33 } = this.sdk.sdkOptions
    const { voting_escrow_id, magma_token, voter_id, minter_id } = getPackagerConfigs(ve33)
    const typeArguments = [magma_token]

    const args = [tx.object(minter_id), tx.object(voter_id), tx.object(voting_escrow_id), tx.object(CLOCK_ADDRESS)]

    tx.moveCall({
      target: `${integrate.published_at}::${VotingEscrow}::summary`,
      arguments: args,
      typeArguments,
    })

    if (!checkInvalidSuiAddress(simulationAccount.address)) {
      throw Error('this config simulationAccount is not set right')
    }
    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    if (simulateRes.error != null) {
      throw new Error(`all_lock_summary error code: ${simulateRes.error ?? 'unknown error'}`)
    }

    const [summaryEvent] = requireSimulationEvents(simulateRes, 'Summary', 'all_lock_summary')
    const summary: AllLockSummary = {
      current_epoch_end: Number(summaryEvent.parsedBcs.current_epoch_end),
      current_epoch_vote_end: Number(summaryEvent.parsedBcs.current_epoch_vote_end),
      rebase_apr: Number(summaryEvent.parsedBcs.rebase_apr),
      team_emission_rate: Number(summaryEvent.parsedBcs.team_emission_rate),
      total_locked: Number(summaryEvent.parsedBcs.total_locked),
      total_voted_power: Number(summaryEvent.parsedBcs.total_voted_power),
      total_voting_power: Number(summaryEvent.parsedBcs.total_voting_power),
    }
    return summary
  }

  async poolWeights(pools: string[]): Promise<PoolWeight[]> {
    if (pools.length === 0) {
      return []
    }

    const tx = new Transaction()
    const { integrate, simulationAccount, ve33 } = this.sdk.sdkOptions
    const { magma_token, voter_id } = getPackagerConfigs(ve33)
    const typeArguments = [magma_token]

    const poolsParams = tx.pure.vector('id', pools)
    const args = [tx.object(voter_id), poolsParams]

    tx.moveCall({
      target: `${integrate.published_at}::${Voter}::pools_tally`,
      arguments: args,
      typeArguments,
    })

    if (!checkInvalidSuiAddress(simulationAccount.address)) {
      throw Error('this config simulationAccount is not set right')
    }
    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    if (simulateRes.error != null) {
      throw new Error(`all_lock_summary error code: ${simulateRes.error ?? 'unknown error'}`)
    }

    const poolWeights: PoolWeight[] = []
    requireSimulationEvents(simulateRes, 'PoolsTally', 'pools_tally').forEach((item: any) => {
      item.parsedBcs.list.forEach((item: any) => {
        poolWeights.push({
          poolId: item.id,
          weight: item.weight,
        })
      })
    })
    return poolWeights
  }

  async getAllVotingFeeRewardTokens(lock_ids: string[]): Promise<Map<LockID, string[]>> {
    if (lock_ids.length === 0) {
      return new Map<LockID, string[]>()
    }

    let tx = new Transaction()
    for (const lock_id of lock_ids) {
      tx = await this._getVotingFeeRewardTokens(lock_id, tx)
    }
    return this._parseVotingFeeRewardTokens(tx)
  }

  async _getVotingFeeRewardTokens(lock_id: string, tx?: Transaction): Promise<Transaction> {
    tx = tx || new Transaction()
    const { integrate, simulationAccount, ve33 } = this.sdk.sdkOptions
    const { magma_token, voter_id } = getPackagerConfigs(ve33)
    const typeArguments = [magma_token]

    const args = [tx.object(voter_id), tx.object(lock_id)]

    if (!checkInvalidSuiAddress(simulationAccount.address)) {
      throw Error('this config simulationAccount is not set right')
    }
    tx.moveCall({
      target: `${integrate.published_at}::${Voter}::get_voting_fee_reward_tokens`,
      arguments: args,
      typeArguments,
    })
    return tx
  }

  async _parseVotingFeeRewardTokens(tx: Transaction): Promise<Map<LockID, string[]>> {
    const { simulationAccount } = this.sdk.sdkOptions
    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    if (simulateRes.error != null) {
      throw new Error(`all_lock_summary error code: ${simulateRes.error ?? 'unknown error'}`)
    }

    const poolFeeRewardTokens = new Map<LockID, string[]>()
    requireSimulationEvents(simulateRes, 'EventFeeRewardTokens', 'get_voting_fee_reward_tokens').forEach((event: any) => {
      const { lock_id } = event.parsedBcs
      if (!poolFeeRewardTokens.has(lock_id)) {
        poolFeeRewardTokens.set(lock_id, [])
      }

      event.parsedBcs.list.contents.forEach((poolTokens: any) => {
        poolTokens.value.forEach((token: any) => {
          poolFeeRewardTokens.get(lock_id)?.push(token.name)
        })
      })
    })
    return poolFeeRewardTokens
  }

  async getVotingFeeRewardTokens(lock_id: string) {
    const tx = new Transaction()
    const { integrate, simulationAccount, ve33 } = this.sdk.sdkOptions
    const { magma_token, voter_id } = getPackagerConfigs(ve33)
    const typeArguments = [magma_token]

    const args = [tx.object(voter_id), tx.object(lock_id)]

    if (!checkInvalidSuiAddress(simulationAccount.address)) {
      throw Error('this config simulationAccount is not set right')
    }
    tx.moveCall({
      target: `${integrate.published_at}::${Voter}::get_voting_fee_reward_tokens`,
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

    const poolRewardTokens = new Map<string, string[]>()
    requireSimulationEvents(simulateRes, 'EventFeeRewardTokens', 'get_voting_fee_reward_tokens').forEach((item: any) => {
      item.parsedBcs.list.contents.forEach((poolTokens: any) => {
        if (!poolRewardTokens.has(poolTokens.key)) {
          poolRewardTokens.set(poolTokens.key, [])
        }

        poolTokens.value.forEach((token: any) => {
          poolRewardTokens.get(poolTokens.key)?.push(token.name)
        })
      })
    })
    return poolRewardTokens
  }

  // tokens
  async getAllBribeRewardTokensOfLock(lock_ids: string[]): Promise<Map<LockID, string[]>> {
    if (lock_ids.length === 0) {
      return new Map<LockID, string[]>()
    }

    let tx = new Transaction()
    for (const lock_id of lock_ids) {
      tx = await this._getVotingBribeRewardTokens(lock_id, tx)
    }
    return this._parseVotingBribeRewardTokens(tx)
  }

  async _getVotingBribeRewardTokens(lock_id: string, tx?: Transaction): Promise<Transaction> {
    tx = tx || new Transaction()
    const { integrate, simulationAccount, ve33 } = this.sdk.sdkOptions
    const { magma_token, voter_id } = getPackagerConfigs(ve33)
    const typeArguments = [magma_token]

    if (!checkInvalidSuiAddress(simulationAccount.address)) {
      throw Error('this config simulationAccount is not set right')
    }

    const args = [tx.object(voter_id), tx.object(lock_id)]
    tx.moveCall({
      target: `${integrate.published_at}::${Voter}::get_voting_bribe_reward_tokens`,
      arguments: args,
      typeArguments,
    })
    return tx
  }

  async _parseVotingBribeRewardTokens(tx: Transaction): Promise<Map<LockID, string[]>> {
    const { simulationAccount } = this.sdk.sdkOptions

    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    if (simulateRes.error != null) {
      throw new Error(`all_lock_summary error code: ${simulateRes.error ?? 'unknown error'}`)
    }

    const poolBirbeRewardTokens = new Map<LockID, string[]>()
    requireSimulationEvents(simulateRes, 'EventBribeRewardTokens', 'get_voting_bribe_reward_tokens').forEach((event: any) => {
      const { lock_id } = event.parsedBcs
      if (!poolBirbeRewardTokens.has(lock_id)) {
        poolBirbeRewardTokens.set(lock_id, [])
      }

      event.parsedBcs.list.contents.forEach((poolTokens: any) => {
        poolTokens.value.forEach((token: any) => {
          poolBirbeRewardTokens.get(lock_id)?.push(token.name)
        })
      })
    })
    return poolBirbeRewardTokens
  }

  // Return PoolId => tokens
  async getVotingBribeRewardTokens(lock_id: string) {
    const tx = new Transaction()
    const { integrate, simulationAccount, ve33 } = this.sdk.sdkOptions
    const { magma_token, voter_id } = getPackagerConfigs(ve33)
    const typeArguments = [magma_token]

    if (!checkInvalidSuiAddress(simulationAccount.address)) {
      throw Error('this config simulationAccount is not set right')
    }

    const args = [tx.object(voter_id), tx.object(lock_id)]
    tx.moveCall({
      target: `${integrate.published_at}::${Voter}::get_voting_bribe_reward_tokens`,
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

    const poolBirbeRewardTokens = new Map<string, string[]>()
    requireSimulationEvents(simulateRes, 'EventBribeRewardTokens', 'get_voting_bribe_reward_tokens').forEach((item: any) => {
      item.parsedBcs.list.contents.forEach((poolTokens: any) => {
        if (!poolBirbeRewardTokens.has(poolTokens.key)) {
          poolBirbeRewardTokens.set(poolTokens.key, [])
        }

        poolTokens.value.forEach((token: any) => {
          poolBirbeRewardTokens.get(poolTokens.key)?.push(token.name)
        })
      })
    })
    return poolBirbeRewardTokens
  }

  async getAllFeeRewards(fee_tokens: Map<LockID, string[]>): Promise<Map<LockID, Map<PoolID, Coin[]>>> {
    let tx = new Transaction()
    let hasFeeRewardRequest = false
    fee_tokens.forEach((tokens, lock_id) => {
      if (tokens.length !== 0) {
        hasFeeRewardRequest = true
        tx = this._getFeeRewards(lock_id, tokens, tx)
      }
    })

    if (!hasFeeRewardRequest) {
      return new Map<LockID, Map<PoolID, Coin[]>>()
    }

    return await this._parseFeeRewards(tx)
  }

  _getFeeRewards(lock_id: string, fee_tokens: string[], tx: Transaction): Transaction {
    if (fee_tokens.length % 2 !== 0) {
      fee_tokens.push(fee_tokens[0])
    }

    for (let i = 0; i + 1 < fee_tokens.length; i += 2) {
      tx = this._getFeeRewardsInner(lock_id, fee_tokens[i], fee_tokens[i + 1], tx)
    }

    return tx
  }

  _getFeeRewardsInner(lock_id: LockID, token_a: string, token_b: string, tx?: Transaction): Transaction {
    tx = tx || new Transaction()
    const { integrate, ve33 } = this.sdk.sdkOptions
    const { magma_token, voter_id } = getPackagerConfigs(ve33)
    const typeArguments = [magma_token, token_a, token_b]

    const args = [tx.object(voter_id), tx.object(lock_id), tx.object(CLOCK_ADDRESS)]
    const targetFunc = `${integrate.published_at}::${Voter}::claimable_voting_fee_rewards`

    tx.moveCall({
      target: targetFunc,
      arguments: args,
      typeArguments,
    })
    return tx
  }

  async _parseFeeRewards(tx: Transaction): Promise<Map<LockID, Map<PoolID, Coin[]>>> {
    const { simulationAccount } = this.sdk.sdkOptions
    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    if (simulateRes.error != null) {
      throw new Error(`getPoolIncentiveRewards error code: ${simulateRes.error ?? 'unknown error'}`)
    }

    const poolFeeRewardTokens = new Map<LockID, Map<PoolID, Coin[]>>()
    requireSimulationEvents(simulateRes, 'ClaimableVotingFee', 'claimable_voting_fee_rewards').forEach((event: any) => {
      const { lock_id } = event.parsedBcs

      if (!poolFeeRewardTokens.has(lock_id)) {
        poolFeeRewardTokens.set(lock_id, new Map<PoolID, Coin[]>())
      }

      event.parsedBcs.list.contents.forEach((rewardTokens: any) => {
        rewardTokens.value.contents.forEach((token: any) => {
          if (!poolFeeRewardTokens.get(lock_id)?.has(rewardTokens.key.name)) {
            poolFeeRewardTokens.get(lock_id)?.set(rewardTokens.key.name, [])
          }
          poolFeeRewardTokens.get(lock_id)?.get(rewardTokens.key.name)?.push({
            kind: CoinType.Incentive,
            token_addr: token.key,
            amount: token.value,
          })
        })
      })
    })
    return poolFeeRewardTokens
  }

  async getPoolFeeRewards(lock_id: LockID, tokens: string[]) {
    const poolFeeRewardTokens = new Map<string, Map<string, string>>()

    if (tokens.length === 0) {
      return poolFeeRewardTokens
    }
    if (tokens.length % 2 !== 0) {
      tokens.push(tokens[0])
    }
    for (let i = 0; i + 1 < tokens.length; i += 2) {
      await this._getPoolFeeRewards(lock_id, tokens[i], tokens[i + 1], poolFeeRewardTokens)
    }
    return poolFeeRewardTokens
  }

  // if you have many tokens, call this function multi times
  async _getPoolFeeRewards(lock_id: string, token_a: string, token_b: string, poolFeeRewardTokens: Map<string, Map<string, string>>) {
    const tx = new Transaction()
    const { integrate, simulationAccount, ve33 } = this.sdk.sdkOptions
    const { magma_token, voter_id } = getPackagerConfigs(ve33)
    const typeArguments = [magma_token, token_a, token_b]

    const args = [tx.object(voter_id), tx.object(lock_id), tx.object(CLOCK_ADDRESS)]
    const targetFunc = `${integrate.published_at}::${Voter}::claimable_voting_fee_rewards`

    tx.moveCall({
      target: targetFunc,
      arguments: args,
      typeArguments,
    })

    if (!checkInvalidSuiAddress(simulationAccount.address)) {
      throw Error('this config simulationAccount is not set right')
    }
    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })
    if (simulateRes.error != null) {
      throw new Error(`getPoolFeeRewards error code: ${simulateRes.error ?? 'unknown error'}`)
    }

    requireSimulationEvents(simulateRes, 'ClaimableVotingFee', 'claimable_voting_fee_rewards').forEach((item: any) => {
      item.parsedBcs.data.contents.forEach((rewardTokens: any) => {
        if (!poolFeeRewardTokens.has(rewardTokens.key.name)) {
          poolFeeRewardTokens.set(rewardTokens.key.name, new Map<string, string>())
        }

        rewardTokens.value.contents.forEach((token: any) => {
          poolFeeRewardTokens.get(rewardTokens.key.name)?.set(token.key, token.value)
        })
      })
    })
    return poolFeeRewardTokens
  }

  // params: lock_id => incentive_tokens
  // lock_id => Pool => rewardTokens
  async getAllIncentiveRewards(lock_incentive_tokens: Map<LockID, string[]>): Promise<Map<LockID, Map<PoolID, Coin[]>>> {
    let tx = new Transaction()
    let hasIncentiveRewardRequest = false
    lock_incentive_tokens.forEach((tokens, lock_id) => {
      if (tokens.length !== 0) {
        hasIncentiveRewardRequest = true
        tx = this._getIncentiveRewards(lock_id, tokens, tx)
      }
    })

    if (!hasIncentiveRewardRequest) {
      return new Map<LockID, Map<PoolID, Coin[]>>()
    }

    return await this._parseIncentiveRewards(tx)
  }

  _getIncentiveRewards(lock_id: string, incentive_tokens: string[], tx?: Transaction): Transaction {
    tx = tx || new Transaction()
    if (incentive_tokens.length === 0) {
      return tx
    }

    let i = 0
    for (; i + 3 < incentive_tokens.length; i += 3) {
      this._getIncentiveRewardsInner(lock_id, incentive_tokens.slice(i, i + 3), tx)
    }
    if (i < incentive_tokens.length) {
      return this._getIncentiveRewardsInner(lock_id, incentive_tokens.slice(i), tx)
    }
    return tx
  }

  _getIncentiveRewardsInner(locksId: string, incentive_tokens: string[], tx?: Transaction): Transaction {
    tx = tx || new Transaction()
    // tokenId => pool => incentive_tokens
    if (incentive_tokens.length > 3) {
      throw Error('Too many tokens')
    }

    // const tx = new Transaction()
    const { integrate, simulationAccount, ve33 } = this.sdk.sdkOptions
    const { magma_token, voter_id } = getPackagerConfigs(ve33)
    const typeArguments = [magma_token, ...incentive_tokens]

    const args = [tx.object(voter_id), tx.object(locksId), tx.object(CLOCK_ADDRESS)]
    let targetFunc = `${integrate.published_at}::${Voter}::claimable_voting_bribes_${incentive_tokens.length}`
    if (incentive_tokens.length === 1) {
      targetFunc = `${integrate.published_at}::${Voter}::claimable_voting_bribes`
    }

    if (!checkInvalidSuiAddress(simulationAccount.address)) {
      throw Error('this config simulationAccount is not set right')
    }

    tx.moveCall({
      target: targetFunc,
      arguments: args,
      typeArguments,
    })

    return tx
  }

  async _parseIncentiveRewards(tx: Transaction): Promise<Map<LockID, Map<PoolID, Coin[]>>> {
    const { simulationAccount } = this.sdk.sdkOptions
    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    if (simulateRes.error != null) {
      throw new Error(`getPoolIncentiveRewards error code: ${simulateRes.error ?? 'unknown error'}`)
    }

    const poolBribeRewardTokens = new Map<LockID, Map<PoolID, Coin[]>>()
    requireSimulationEvents(simulateRes, 'ClaimableVotingBribes', 'claimable_voting_bribes').forEach((event: any) => {
      const { lock_id } = event.parsedBcs

      if (!poolBribeRewardTokens.has(lock_id)) {
        poolBribeRewardTokens.set(lock_id, new Map<PoolID, Coin[]>())
      }

      event.parsedBcs.list.contents.forEach((rewardTokens: any) => {
        rewardTokens.value.contents.forEach((token: any) => {
          if (!poolBribeRewardTokens.get(lock_id)?.has(rewardTokens.key.name)) {
            poolBribeRewardTokens.get(lock_id)?.set(rewardTokens.key.name, [])
          }
          poolBribeRewardTokens.get(lock_id)?.get(rewardTokens.key.name)?.push({
            kind: CoinType.Incentive,
            token_addr: token.key,
            amount: token.value,
          })
        })
      })
    })
    return poolBribeRewardTokens
  }

  // coin => pool => amount
  async getPoolIncentiveRewards(lock_id: string, incentive_tokens: string[]) {
    const poolBribeRewardTokens = new Map<string, Map<string, string>>()
    if (incentive_tokens.length === 0) {
      return poolBribeRewardTokens
    }
    let i = 0
    for (; i + 3 < incentive_tokens.length; i += 3) {
      await this._getPoolIncentiveRewards(lock_id, incentive_tokens.slice(i, i + 3), poolBribeRewardTokens)
    }
    if (i < incentive_tokens.length) {
      await this._getPoolIncentiveRewards(lock_id, incentive_tokens.slice(i), poolBribeRewardTokens)
    }

    return poolBribeRewardTokens
  }

  // tokenId => pool => incentive_tokens
  async _getPoolIncentiveRewards(locksId: string, incentive_tokens: string[], poolBribeRewardTokens: Map<string, Map<string, string>>) {
    // tokenId => pool => incentive_tokens
    if (incentive_tokens.length === 0) {
      return poolBribeRewardTokens
    }
    if (incentive_tokens.length > 3) {
      throw Error('Too many tokens')
    }

    const tx = new Transaction()
    const { integrate, simulationAccount, ve33 } = this.sdk.sdkOptions
    const { magma_token, voter_id } = getPackagerConfigs(ve33)
    const typeArguments = [magma_token, ...incentive_tokens]

    const args = [tx.object(voter_id), tx.object(locksId), tx.object(CLOCK_ADDRESS)]
    let targetFunc = `${integrate.published_at}::${Voter}::claimable_voting_bribes_${incentive_tokens.length}`
    if (incentive_tokens.length === 1) {
      targetFunc = `${integrate.published_at}::${Voter}::claimable_voting_bribes`
    }

    if (!checkInvalidSuiAddress(simulationAccount.address)) {
      throw Error('this config simulationAccount is not set right')
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
      throw new Error(`getPoolIncentiveRewards error code: ${simulateRes.error ?? 'unknown error'}`)
    }

    requireSimulationEvents(simulateRes, 'ClaimableVotingBribes', 'claimable_voting_bribes').forEach((item: any) => {
      item.parsedBcs.data.contents.forEach((rewardTokens: any) => {
        if (!poolBribeRewardTokens.has(rewardTokens.key.name)) {
          poolBribeRewardTokens.set(rewardTokens.key.name, new Map<string, string>())
        }

        rewardTokens.value.contents.forEach((token: any) => {
          poolBribeRewardTokens.get(rewardTokens.key.name)?.set(token.key, token.value)
        })
      })
    })
    return poolBribeRewardTokens
  }

  async getPoolBribeRewardTokens(pool_id: string) {
    const tx = new Transaction()
    const { integrate, simulationAccount, ve33 } = this.sdk.sdkOptions
    const { magma_token, voter_id } = getPackagerConfigs(ve33)
    const typeArguments = [magma_token]

    const args = [tx.object(voter_id), tx.object(pool_id)]
    tx.moveCall({
      target: `${integrate.published_at}::${Voter}::get_voting_bribe_reward_tokens_by_pool`,
      arguments: args,
      typeArguments,
    })

    if (!checkInvalidSuiAddress(simulationAccount.address)) {
      throw Error('this config simulationAccount is not set right')
    }
    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    if (simulateRes.error != null) {
      throw new Error(`getPoolBribeRewardTokens error code: ${simulateRes.error ?? 'unknown error'}`)
    }

    const poolBirbeRewardTokens = new Map<string, string[]>()
    requireSimulationEvents(simulateRes, 'EventRewardTokens', 'get_voting_bribe_reward_tokens_by_pool').forEach((item: any) => {
      item.parsedBcs.list.contents.forEach((poolTokens: any) => {
        if (!poolBirbeRewardTokens.has(poolTokens.key)) {
          poolBirbeRewardTokens.set(poolTokens.key, [])
        }

        poolTokens.value.forEach((token: any) => {
          poolBirbeRewardTokens.get(poolTokens.key)?.push(token.name)
        })
      })
    })
    return poolBirbeRewardTokens
  }

  async getLockVotingStats(lockId: string) {
    const tx = new Transaction()
    const { integrate, simulationAccount, ve33 } = this.sdk.sdkOptions
    const { magma_token, voter_id } = getPackagerConfigs(ve33)

    const args = [tx.object(voter_id), tx.object(lockId), tx.object(CLOCK_ADDRESS)]
    const typeArguments = [magma_token]

    tx.moveCall({
      target: `${integrate.published_at}::${Voter}::lock_voting_stats`,
      arguments: args,
      typeArguments,
    })

    if (!checkInvalidSuiAddress(simulationAccount.address)) {
      throw Error('this config simulationAccount is not set right')
    }

    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })
    if (simulateRes.error != null) {
      throw new Error(`lock_voting_stats error code: ${simulateRes.error ?? 'unknown error'}`)
    }

    const [lockVotingStatsEvent] = requireSimulationEvents(simulateRes, 'EventLockVotingStats', 'lock_voting_stats')
    const res: LockVoteEvent = {
      lock_id: lockVotingStatsEvent.parsedBcs.lock_id,
      last_voted_at: lockVotingStatsEvent.parsedBcs.last_voted_at,
      pools: lockVotingStatsEvent.parsedBcs.pools,
      votes: lockVotingStatsEvent.parsedBcs.votes,
    }
    return res
  }
}
