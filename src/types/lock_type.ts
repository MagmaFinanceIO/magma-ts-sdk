import { SuiAddressType, SuiObjectIdType } from './sui'

export type CreateLockParams = {
  /**
   * The swap amount.
   */
  amount: string

  /**
   * How long the lock will last. Should be in range [MIN_LOCK_TIME, MAX_LOCK_TIME]
   MAX_LOCK_TIME: u64 = 4 * 52 * WEEK;
   MIN_LOCK_TIME: u64 = WEEK;
   */
  lockDurationDays: number

  /**
   * If the lock is permanent.
   */
  permanent: boolean
}

export type IncreaseLockAmountParams = {
  lockId: SuiObjectIdType

  /**
   * The swap amount.
   */
  amount: string
}

export type MergeLockParams = {
  fromLockId: SuiObjectIdType

  toLockId: SuiObjectIdType
}

export type TransferLockParams = {
  lockId: SuiObjectIdType

  to: string
}

export type IncreaseUnlockTimeParams = {
  lockId: SuiObjectIdType

  /**
   * Timestamp when the lock will end.
   * Used for calc new lock duration
   */
  newLockEndAt: number
}

export type LockPermanentParams = {
  lockId: SuiObjectIdType
}

export type VoteParams = {
  lockId: SuiObjectIdType

  pools: SuiAddressType[]

  weights: number[]
}

export type ClaimFeesParams = {
  /**
   * The address type of the coin A.
   */
  coinAType: SuiAddressType

  /**
   * The address type of the coin A.
   */
  coinBType: SuiAddressType

  locks: SuiObjectIdType
}

export type ClaimFeesPoolsParams = {
  /**
   * The address type of the coin A.
   */
  coinAType: SuiAddressType

  /**
   * The address type of the coin A.
   */
  coinBType: SuiAddressType

  locks: SuiObjectIdType[]
}

export type ClaimAndLockParams = {
  lockId: SuiObjectIdType
}

export type PokeParams = {
  lockId: SuiObjectIdType
}
