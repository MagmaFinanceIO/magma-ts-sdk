import { jest } from '@jest/globals'
import type { SuiGrpcClient } from '@mysten/sui/grpc'
import { Transaction } from '@mysten/sui/transactions'
import BN from 'bn.js'
import '../src/modules/positionModule'
import { ClmmpoolsError, UtilsErrorCode } from '../src/errors/errors'
import { CoinAssist } from '../src/math/CoinAssist'
import { MagmaClmmSDK, type SdkOptions } from '../src/sdk'
import { convertScientificToDecimal, fromDecimalsAmount, toDecimalsAmount } from '../src/utils/numbers'
import { TransactionUtil } from '../src/utils/transaction-util'

const id = (digit: string) => `0x${digit.repeat(64)}`
const OWNER = id('1')
const COIN_A = `${id('2')}::coin_a::COIN_A`
const COIN_B = `${id('3')}::coin_b::COIN_B`

function packageConfig(packageId: string) {
  return { package_id: packageId, published_at: packageId }
}

function buildSdk(): MagmaClmmSDK {
  const options: SdkOptions = {
    network: 'mainnet',
    suiGrpcClient: {} as SuiGrpcClient,
    simulationAccount: { address: OWNER },
    magma_config: packageConfig(id('4')),
    ve33: packageConfig(id('5')),
    clmm_pool: {
      ...packageConfig(id('6')),
      config: {
        pools_id: id('7'),
        global_config_id: id('8'),
        global_vault_id: id('9'),
        admin_cap_id: id('a'),
      },
    },
    almm_pool: {
      ...packageConfig(id('b')),
      config: {
        factory: id('c'),
        rewarder_global_vault: id('d'),
      },
    },
    distribution: packageConfig(id('e')),
    integrate: packageConfig(id('f')),
    deepbook: packageConfig(id('1')),
    deepbook_endpoint_v2: packageConfig(id('2')),
    aggregatorUrl: 'https://example.com/router',
  }
  const sdk = new MagmaClmmSDK(options)
  sdk.senderAddress = OWNER
  jest.spyOn(sdk, 'getOwnerCoinAssets').mockResolvedValue([])
  return sdk
}

function moveCalls(transaction: Transaction): any[] {
  return (transaction.getData() as any).commands.map((command: any) => command.MoveCall).filter(Boolean)
}

describe('May 2026 magma-clmm-sdk compatibility migration', () => {
  test('preserves integer precision and scientific-notation conversion', () => {
    expect(toDecimalsAmount('1.23456789', 6)).toBe('1234567')
    expect(fromDecimalsAmount('1234567', 6)).toBe('1.234567')
    expect(convertScientificToDecimal('1.25e-7', 9)).toBe('0.000000125')
  })

  test('consumes each matching multi-coin input once and reports a typed miss', () => {
    const tx = new Transaction()
    const first = tx.object(id('3'))
    const second = tx.object(id('4'))
    const input = {
      coin_type: COIN_A,
      remain_coins: [],
      amount_coin_array: [
        { coin_object_id: first, amount: '10', used: false },
        { coin_object_id: second, amount: '10', used: false },
      ],
    }

    expect(CoinAssist.getCoinAmountObjId(input, '10')).toBe(first)
    expect(CoinAssist.getCoinAmountObjId(input, '10')).toBe(second)
    expect(() => CoinAssist.getCoinAmountObjId(input, '10')).toThrow(
      expect.objectContaining<Partial<ClmmpoolsError>>({ errorCode: UtilsErrorCode.CoinNotFound })
    )
  })

  test('builds mint and add-liquidity strategy calls against the integration package', async () => {
    const sdk = buildSdk()
    const mintTx = new Transaction()
    const mint = await sdk.Almm.mintByStrategy(
      {
        pair: id('3'),
        bin_step: 5,
        coinTypeA: COIN_A,
        coinTypeB: COIN_B,
        amountATotal: '100',
        amountBTotal: '100',
        fixCoinA: true,
        fixCoinB: true,
        strategy: 0,
        min_bin: -10,
        max_bin: 10,
        active_bin: 0,
        slippage: 50,
        coin_object_id_a: mintTx.object(id('4')),
        coin_object_id_b: mintTx.object(id('5')),
      },
      mintTx
    )
    expect(moveCalls(mint)).toEqual(
      expect.arrayContaining([expect.objectContaining({ module: 'almm_script', function: 'mint_by_strategy' })])
    )

    const raiseTx = new Transaction()
    const raise = await sdk.Almm.addLiquidityByStrategy(
      {
        pair: id('3'),
        positionId: id('4'),
        bin_step: 5,
        coinTypeA: COIN_A,
        coinTypeB: COIN_B,
        amountATotal: '100',
        amountBTotal: '100',
        fixCoinA: true,
        fixCoinB: true,
        strategy: 0,
        min_bin: -10,
        max_bin: 10,
        active_bin: 0,
        slippage: 50,
        receiver: OWNER,
        rewards_token: [COIN_A],
        coin_object_id_a: raiseTx.object(id('5')),
        coin_object_id_b: raiseTx.object(id('6')),
      },
      raiseTx
    )
    expect(moveCalls(raise)).toEqual(
      expect.arrayContaining([expect.objectContaining({ module: 'almm_script', function: 'raise_by_strategy_1' })])
    )
  })

  test('builds reward-aware burn and shrink calls', async () => {
    const sdk = buildSdk()
    const common = {
      pool_id: id('3'),
      position_id: id('4'),
      coin_a: COIN_A,
      coin_b: COIN_B,
      rewards_token: [COIN_A, COIN_B],
    }

    const burn = await sdk.Almm.burnPosition(common)
    expect(moveCalls(burn)).toEqual(
      expect.arrayContaining([expect.objectContaining({ module: 'almm_script', function: 'burn_position_reward2' })])
    )

    const shrink = await sdk.Almm.shrinkPosition({ ...common, delta_percentage: 5000 })
    expect(moveCalls(shrink)).toEqual(
      expect.arrayContaining([expect.objectContaining({ module: 'almm_script', function: 'shrink_position_reward2' })])
    )
  })

  test('keeps protected and unprotected SUI gas-adjustment builders separated', async () => {
    const sdk = buildSdk()
    const standard = jest
      .spyOn(TransactionUtil, 'buildAddLiquidityFixTokenForGas')
      .mockResolvedValue(new Transaction())
    const protectedBuilder = jest
      .spyOn(TransactionUtil, 'buildAddLiquidityWithProtectionFixTokenForGas')
      .mockResolvedValue(new Transaction())
    const params = {
      pool_id: id('3'),
      pos_id: id('4'),
      coinTypeA: '0x2::sui::SUI',
      coinTypeB: COIN_B,
      amount_a: '100',
      amount_b: '100',
      slippage: 0.01,
      fix_amount_a: true,
      is_open: false,
      tick_lower: -10,
      tick_upper: 10,
      collect_fee: false,
      rewarder_coin_types: [],
    }
    const gasEstimate = { slippage: 0.01, curSqrtPrice: new BN(1) }

    await sdk.Position.createAddLiquidityFixTokenPayload(params, gasEstimate)
    expect(standard).toHaveBeenCalledTimes(1)
    expect(protectedBuilder).not.toHaveBeenCalled()

    await sdk.Position.createAddLiquidityFixTokenWithProtectionPayload(params, gasEstimate)
    expect(protectedBuilder).toHaveBeenCalledTimes(1)
  })
})
