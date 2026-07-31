import { jest } from '@jest/globals'
import { Transaction } from '@mysten/sui/transactions'
import BN from 'bn.js'
import type { AddLiquidityFixTokenParams, CoinAsset } from '../src/types/clmm_type'
import type SDK from '../src/index'
import { TransactionUtil, type BuildCoinResult } from '../src/utils/transaction-util'

const id = (digit: string) => `0x${digit.repeat(64)}`
const OWNER = id('1')
const SUI = '0x2::sui::SUI'
const OTHER_COIN = `${id('2')}::other::OTHER`

const allCoins: CoinAsset[] = [
  {
    coinAddress: SUI,
    coinObjectId: id('3'),
    balance: 10_000n,
  },
  {
    coinAddress: OTHER_COIN,
    coinObjectId: id('4'),
    balance: 100_000n,
  },
]

function buildSdk(): SDK {
  return {
    senderAddress: OWNER,
    fullClient: {
      calculationTxGas: jest.fn(async () => 2_000),
    },
  } as unknown as SDK
}

function buildParams(): AddLiquidityFixTokenParams {
  return {
    pool_id: id('5'),
    pos_id: id('6'),
    coinTypeA: SUI,
    coinTypeB: OTHER_COIN,
    amount_a: '9000',
    amount_b: '100',
    slippage: 0.01,
    fix_amount_a: true,
    is_open: false,
    tick_lower: -10,
    tick_upper: 10,
    collect_fee: false,
    rewarder_coin_types: [],
  }
}

function mockCoinInput(): BuildCoinResult {
  const tx = new Transaction()
  return {
    targetCoin: tx.object(id('7')),
    remainCoins: [],
    isMintZeroCoin: false,
    tragetCoinAmount: '0',
  }
}

afterEach(() => {
  jest.restoreAllMocks()
})

describe('SUI Coin A gas adjustment regression', () => {
  test('the real gas adjustment path creates a replacement transaction', async () => {
    const result = await TransactionUtil.adjustTransactionForGas(buildSdk(), [allCoins[0]], 9_000n, new Transaction())

    expect(result.fixAmount).toBe(6_500n)
    expect(result.newTx).toBeInstanceOf(Transaction)
  })

  test('the normal builder returns the replacement transaction', async () => {
    const originalTx = new Transaction()
    jest.spyOn(TransactionUtil, 'buildAddLiquidityFixToken').mockResolvedValue(originalTx)
    jest.spyOn(TransactionUtil, 'buildAddLiquidityFixTokenCoinInput').mockReturnValue(mockCoinInput())
    jest.spyOn(TransactionUtil, 'fixAddLiquidityFixTokenParams').mockImplementation((params) => params)
    const rebuild = jest
      .spyOn(TransactionUtil as any, 'buildAddLiquidityFixTokenArgs')
      .mockImplementation((...args: unknown[]) => args[0] as Transaction)

    const result = await TransactionUtil.buildAddLiquidityFixTokenForGas(buildSdk(), allCoins, buildParams(), {
      slippage: 0.01,
      curSqrtPrice: new BN(1),
    })

    expect(result).not.toBe(originalTx)
    expect(rebuild).toHaveBeenCalledTimes(1)
    expect((rebuild.mock.calls[0][3] as AddLiquidityFixTokenParams).amount_a).toBe(6_500)
  })

  test('the protection builder returns the replacement transaction', async () => {
    const originalTx = new Transaction()
    jest.spyOn(TransactionUtil, 'buildAddLiquidityWithProtectionFixToken').mockResolvedValue(originalTx)
    jest.spyOn(TransactionUtil, 'buildAddLiquidityFixTokenCoinInput').mockReturnValue(mockCoinInput())
    jest.spyOn(TransactionUtil, 'fixAddLiquidityFixTokenParams').mockImplementation((params) => params)
    const rebuild = jest
      .spyOn(TransactionUtil as any, 'buildAddLiquidityWithProtectionFixTokenArgs')
      .mockImplementation((...args: unknown[]) => args[0] as Transaction)

    const result = await TransactionUtil.buildAddLiquidityWithProtectionFixTokenForGas(buildSdk(), allCoins, buildParams(), {
      slippage: 0.01,
      curSqrtPrice: new BN(1),
    })

    expect(result).not.toBe(originalTx)
    expect(rebuild).toHaveBeenCalledTimes(1)
    expect((rebuild.mock.calls[0][3] as AddLiquidityFixTokenParams).amount_a).toBe(6_500)
  })
})
