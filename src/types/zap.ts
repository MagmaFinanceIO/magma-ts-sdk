import { TransactionObjectArgument } from '@mysten/sui/transactions'

export const defaultSwapSlippage = 0.005

export type SwapResultV2 = {
  swap_in_amount: string
  swap_out_amount: string
  route_obj?: any
  after_sqrt_price: string
  swap_price: string
}

export type DepositMode = 'FixedOneSide' | 'FlexibleBoth' | 'OnlyCoinA' | 'OnlyCoinB'

export type FixedOneSideOptions = {
  mode: 'FixedOneSide'
  fixed_amount: string
  fixed_coin_a: boolean
}

export type FlexibleBothOptions = {
  mode: 'FlexibleBoth'
  coin_amount_a: string
  coin_amount_b: string
  coin_type_a: string
  coin_type_b: string
  coin_decimal_a: number
  coin_decimal_b: number
  max_remain_rate?: number
}

export type OnlyCoinAOptions = {
  mode: 'OnlyCoinA'
  coin_amount: string
  coin_type_a: string
  coin_type_b: string
  coin_decimal_a: number
  coin_decimal_b: number
  max_remain_rate?: number
}

export type OnlyCoinBOptions = {
  mode: 'OnlyCoinB'
  coin_amount: string
  coin_type_a: string
  coin_type_b: string
  coin_decimal_a: number
  coin_decimal_b: number
  max_remain_rate?: number
}

export type BaseDepositOptions = {
  pool_id: string
  tick_lower: number
  tick_upper: number
  current_sqrt_price: string
  mark_price?: string
  slippage: number
  swap_slippage?: number
}

export type CalculationDepositResult = {
  liquidity: string
  amount_a: string
  amount_b: string
  amount_limit_a: string
  amount_limit_b: string
  original_input_amount_a: string
  original_input_amount_b: string
  mode: DepositMode
  fixed_liquidity_coin_a: boolean
  swap_result?: SwapResultV2
  sub_deposit_result?: CalculationDepositResult
}

export type DepositOptions = {
  deposit_obj: CalculationDepositResult
  pool_id: string
  farms_pool_id?: string
  coin_type_a: string
  coin_type_b: string
  tick_lower: number
  tick_upper: number
  slippage: number
  swap_slippage?: number
  pos_obj?: {
    pos_id: string | TransactionObjectArgument
    collect_fee: boolean
    collect_rewarder_types: string[]
  }
}

export type WithdrawCalculationOptions = {
  pool_id: string
  tick_lower: number
  tick_upper: number
  coin_decimal_a: number
  coin_decimal_b: number
  current_sqrt_price: string
  mode: DepositMode
  coin_type_a: string
  coin_type_b: string
  burn_liquidity?: string
} & (
  | { mode: 'FixedOneSide'; fixed_amount?: string; fixed_coin_a?: boolean }
  | {
      mode: 'FlexibleBoth'
      receive_amount_a: string
      receive_amount_b: string
      available_liquidity: string
      max_remain_rate?: number
    }
  | { mode: 'OnlyCoinA'; receive_amount_a?: string; available_liquidity: string; max_remain_rate?: number }
  | { mode: 'OnlyCoinB'; receive_amount_b?: string; available_liquidity: string; max_remain_rate?: number }
)

export type CalculationWithdrawResult = {
  burn_liquidity: string
  amount_a: string
  amount_b: string
  total_receive_amount?: string
  mode: DepositMode
  swap_result?: SwapResultV2
}

export type WithdrawOptions = {
  withdraw_obj: CalculationWithdrawResult
  pool_id: string
  farms_pool_id?: string
  pos_id: string
  close_pos: boolean
  collect_fee: boolean
  collect_rewarder_types: string[]
  collect_farms_rewarder?: boolean
  coin_type_a: string
  coin_type_b: string
  tick_lower: number
  tick_upper: number
  slippage: number
  swap_slippage?: number
}
