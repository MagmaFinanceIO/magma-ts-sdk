import BN from 'bn.js'
import { NFT, SuiAddressType, SuiObjectIdType } from './sui'
import { Rewarder } from './clmm_type'

export type FetchPairParams = {
  pair: string
  coinTypeA: string
  coinTypeB: string
}

export type CreatePairParams = {
  bin_step: number
  base_fee: number
  coinTypeA: string
  coinTypeB: string
  coinADecimal: number
  coinBDecimal: number
  priceTokenBPerTokenA: string
}

export type MintPercentParams = {
  pair: string
  coinTypeA: string
  coinTypeB: string
  amountATotal: number
  amountBTotal: number
  storageIds: number[] // vector<u32>
  binsAPercent: number[] // vector<u64>
  binsBPercent: number[] // vector<u64>
  to: string
}

export type MintAmountParams = {
  pair: string
  coinTypeA: string
  coinTypeB: string
  amountATotal: number
  amountBTotal: number
  storageIds: number[] // vector<u32>
  amountsA: number[] // vector<u64>
  amountsB: number[] // vector<u64>
  to: string
}

export type ALMMSwapParams = {
  pair: string
  coinTypeA: string
  coinTypeB: string
  amountIn: number // u64
  minAmountOut: number // u64
  swapForY: boolean
  to: string
}

export type FetchBinsParams = {
  pair: string
  coinTypeA: string
  coinTypeB: string
  offset: number
  limit: number
}

export type GetPositionLiquidityParams = {
  pair: string
  positionId: string
  coinTypeA: string
  coinTypeB: string
}

export type GetPairLiquidityParams = {
  pair: string
  coinTypeA: string
  coinTypeB: string
}

export type EventPairParams = {
  base_factor: number // u16, basis_point
  filter_period: number // u16, 12bit
  decay_period: number // u16, 12bit
  reduction_factor: number // u16, 14bit
  variable_fee_control: number // u32, 24bit, basis_point
  protocol_share: number // u16, 14bit
  max_volatility_accumulator: number // u32, 20bit, basis_point
  volatility_accumulator: number // u32, 20bit, basis_point
  volatility_reference: number // u32, 20bit
  index_reference: number // u32, 24bit
  time_of_last_update: number | string // u64
  oracle_index: number // u16
  active_index: number // u32, 24bit StorageId
  protocol_variable_share: number
}

export type EventBin = {
  storage_id: number | string // u32
  price_q128: number | string // u256
  reserve_x: number | string // u64
  reserve_y: number | string // u64

  staked_liquidity: number | string // u256
  staked_lp_amount: number | string // u64

  fee_x: number | string // u64
  fee_y: number | string // u64
  fee_growth_x: number | string // u256
  fee_growth_y: number | string // u256
  rewarder_growth: RewarderGrowth // vector<u256>
  distribution_growth: number | string // u256
  distribution_last_updated: number | string // u64

  real_bin_id: number
}

export type RewarderGrowth = {
  contents: string[]
}

export type EventPositionLiquidity = {
  position_id: string
  shares: number | string // u64
  liquidity: number | string // u256
  x_equivalent: number | string // u64
  y_equivalent: number | string // u64
  bin_real_ids: number[] // vector<u32>
  bin_x_eq: number[] | string[] // vector<u64>
  bin_y_eq: number[] | string[] // vector<u64>
  bin_liquidity: number[] | string[] // vector<u256>
}

export type EventPairLiquidity = {
  shares: number | string // u64
  liquidity: number | string // u256
  x: number | string // x total_reserve, u256
  y: number | string // y total_reserve, u256

  bin_ids: number[] | string[] // vector<u32>
  bin_x: number[] | string[] // x_amount, vector<u64>
  bin_y: number[] | string[] // y_amount, vector<u64>
}

export type AlmmPoolInfo = {
  pool_id: string
  bin_step: number
  coin_a: string
  coin_b: string
  base_factor: number
  base_fee: number
  active_index: number
  real_bin_id: number
  coinAmountA: string
  coinAmountB: string
  index?: number
  liquidity: string
  rewarder_infos: Rewarder[]
  params: EventPairParams
}

export type AlmmAddLiquidityParams = {
  pool_id: string
  coin_a: string
  coin_b: string
  position_id: string
  amounts_a: number[] // vector<u64>
  amounts_b: number[] // vector<u64>
  receiver: string
  rewards_token: string[]
}

export type AlmmBurnPositionParams = {
  pool_id: string
  position_id: string
  coin_a: string
  coin_b: string
  rewards_token: string[]
}

export type AlmmShrinkPosition = {
  pool_id: string
  position_id: string
  coin_a: string
  coin_b: string
  delta_percentage: number
  rewards_token: string[]
}

export type AlmmCollectRewardParams = {
  pool_id: string
  coin_a: string
  coin_b: string
  position_id: string
  rewards_token: string[]
}

export type AlmmCollectFeeParams = {
  pool_id: string
  coin_a: string
  coin_b: string
  position_id: string
}

// public entry fun earned_rewards2<X, Y, R1, R2>(pair: &AlmmPair<X, Y>, position_id: ID, clock: &Clock) {
export type AlmmRewardsParams = {
  pool_id: string
  position_id: string
  coin_a: string
  coin_b: string
  rewards_token: string[]
}

export type AlmmEventEarnedFees = {
  position_id: string
  x: string
  y: string
  fee_x: number
  fee_y: number
}

export type AlmmEventEarnedRewards = {
  position_id: string
  reward: string[]
  amount: number[]
}

export type GetPairRewarderParams = {
  pool_id: string
  coin_a: string
  coin_b: string
}

export type AlmmEventPairRewardTypes = {
  pair_id: string
  tokens: string[]
}

export type BinDisplay = {
  binId: number
  amountX: BN
  amountY: BN
}

export type AlmmCreatePairAddLiquidityParams = {
  baseFee: number // u64,
  binStep: number // u16,
  coinTypeA: string
  coinTypeB: string
  activeId: number // RealID, u32,
  realIds: number[]
  amountsX: number[]
  amountsY: number[]
  to: string
}

export type AlmmPosition = {
  pos_object_id: SuiObjectIdType
  owner: SuiObjectIdType
  pool: SuiObjectIdType
  type: SuiAddressType
  bin_real_ids: number[]
}

export type AlmmPositionInfo = {
  position: AlmmPosition
  liquidity: EventPositionLiquidity
  rewards: AlmmEventEarnedRewards
  fees: AlmmEventEarnedFees
  contractPool: AlmmPoolInfo
  coin_type_a: string
  coin_type_b: string
}

export type MintByStrategyParams = {
  pair: string
  bin_step: number
  coinTypeA: string
  coinTypeB: string
  amountATotal: number // u64
  amountBTotal: number // u64
  fixCoinA: boolean
  fixCoinB: boolean
  strategy: number // u8
  /**
   * RealID. u32
   */
  min_bin: number
  /**
   * RealID. u32
   */
  max_bin: number
  /**
   * RealID. Used for calc slippage
   */
  active_bin: number
  /**
   * base 10000 = 100%
   */
  slippage: number
}

export type RaiseByStrategyParams = {
  pair: string
  positionId: string
  bin_step: number
  coinTypeA: string
  coinTypeB: string
  amountATotal: number // u64
  amountBTotal: number // u64
  fixCoinA: boolean
  fixCoinB: boolean
  strategy: number // u8
  min_bin: number // RealID. u32
  max_bin: number // RealID. u32
  active_bin: number // RealID. Used for calc slippage
  slippage: number // base 10000

  receiver: string
  rewards_token: string[]
}

export type EventCreatePair = {
  pair_id: string
  factory_id: string
  bin_step: number // u16
  active_id: number // u32
  params: EventPairParams
  token_x: Token
  token_y: Token
  lp_token_id: string
}

export type Token = {
  name: string
}
