import { jest } from '@jest/globals'
import { bcs } from '@mysten/sui/bcs'
import type { SuiGrpcClient } from '@mysten/sui/grpc'
import { Transaction } from '@mysten/sui/transactions'
import { fromBase64 } from '@mysten/sui/utils'
import '../src/modules/positionModule'
import { ClmmpoolsError, MathErrorCode, TypesErrorCode } from '../src/errors/errors'
import { MagmaClmmSDK, type SdkOptions } from '../src/sdk'
import type { U64Amount } from '../src/types/almm'
import { TransactionUtil } from '../src/utils/transaction-util'

const id = (digit: string) => `0x${digit.repeat(64)}`
const OWNER = id('1')
const COIN_A = `${id('2')}::coin_a::COIN_A`
const COIN_B = `${id('3')}::coin_b::COIN_B`
const UNSAFE_AMOUNT = '9007199254740993'
const UNSAFE_AMOUNT_B = '9007199254740995'
const U64_MAX = '18446744073709551615'

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

function moveCall(transaction: Transaction, functionName: string): any {
  const data = transaction.getData() as any
  return data.commands.find((command: any) => command.MoveCall?.function === functionName)?.MoveCall
}

function pureBytes(transaction: Transaction, argument: any): Uint8Array {
  const data = transaction.getData() as any
  return fromBase64(data.inputs[argument.Input].Pure.bytes)
}

function u64Argument(transaction: Transaction, functionName: string, argumentIndex: number): string {
  const call = moveCall(transaction, functionName)
  return bcs.u64().parse(pureBytes(transaction, call.arguments[argumentIndex]))
}

function u64VectorArgument(transaction: Transaction, functionName: string, argumentIndex: number): string[] {
  const call = moveCall(transaction, functionName)
  return bcs.vector(bcs.u64()).parse(pureBytes(transaction, call.arguments[argumentIndex]))
}

function mockCoinBuilder(amounts: bigint[]) {
  return jest.spyOn(TransactionUtil, 'buildCoinForAmount').mockImplementation((tx, _allCoins, amount) => {
    amounts.push(amount)
    return {
      targetCoin: tx.object(id('9')),
      remainCoins: [],
      isMintZeroCoin: amount === BigInt(0),
      tragetCoinAmount: amount.toString(),
    }
  })
}

afterEach(() => {
  jest.restoreAllMocks()
})

describe('ALMM u64 amount precision', () => {
  test('preserves unsafe JavaScript integers and slippage bounds in mintByStrategy', async () => {
    const sdk = buildSdk()
    const tx = new Transaction()
    const params = {
      pair: id('3'),
      bin_step: 5,
      coinTypeA: COIN_A,
      coinTypeB: COIN_B,
      amountATotal: UNSAFE_AMOUNT,
      amountBTotal: UNSAFE_AMOUNT,
      fixCoinA: true,
      fixCoinB: false,
      strategy: 0,
      min_bin: -10,
      max_bin: 10,
      active_bin: 0,
      slippage: 50,
      coin_object_id_a: tx.object(id('4')),
      coin_object_id_b: tx.object(id('5')),
    }

    const result = await sdk.Almm.mintByStrategy(params, tx)

    expect(u64Argument(result, 'mint_by_strategy', 5)).toBe(UNSAFE_AMOUNT)
    expect(u64Argument(result, 'mint_by_strategy', 7)).toBe('0')
    expect(u64Argument(result, 'mint_by_strategy', 13)).toBe('8962163258467288')
    expect(u64Argument(result, 'mint_by_strategy', 14)).toBe('9052235251014697')
    expect(params.amountATotal).toBe(UNSAFE_AMOUNT)
    expect(params.amountBTotal).toBe(UNSAFE_AMOUNT)
  })

  test.each([
    ['without rewards', []],
    ['with rewards', [COIN_A]],
  ])('preserves unsafe integers when adding liquidity %s', async (_name, rewards_token) => {
    const sdk = buildSdk()
    const tx = new Transaction()
    const functionName = rewards_token.length === 0 ? 'raise_by_strategy' : 'raise_by_strategy_1'
    const pureOffset = rewards_token.length === 0 ? 0 : 1

    const result = await sdk.Almm.addLiquidityByStrategy(
      {
        pair: id('3'),
        positionId: id('4'),
        bin_step: 5,
        coinTypeA: COIN_A,
        coinTypeB: COIN_B,
        amountATotal: UNSAFE_AMOUNT,
        amountBTotal: UNSAFE_AMOUNT_B,
        fixCoinA: false,
        fixCoinB: true,
        strategy: 0,
        min_bin: -10,
        max_bin: 10,
        active_bin: 0,
        slippage: 50,
        receiver: OWNER,
        rewards_token,
        coin_object_id_a: tx.object(id('5')),
        coin_object_id_b: tx.object(id('6')),
      },
      tx
    )

    expect(u64Argument(result, functionName, 6 + pureOffset)).toBe('0')
    expect(u64Argument(result, functionName, 8 + pureOffset)).toBe(UNSAFE_AMOUNT_B)
    expect(u64Argument(result, functionName, 12 + pureOffset)).toBe('8962163258467288')
    expect(u64Argument(result, functionName, 13 + pureOffset)).toBe('9052235251014697')
  })

  test('preserves vector values and bigint totals in createPairAddLiquidity', async () => {
    const sdk = buildSdk()
    const builtAmounts: bigint[] = []
    mockCoinBuilder(builtAmounts)

    const result = await sdk.Almm.createPairAddLiquidity({
      baseFee: 100,
      binStep: 5,
      coinTypeA: COIN_A,
      coinTypeB: COIN_B,
      activeId: 0,
      realIds: [-1, 1],
      amountsX: [UNSAFE_AMOUNT, BigInt(2)],
      amountsY: [BigInt(3), UNSAFE_AMOUNT_B],
      to: OWNER,
    })

    expect(builtAmounts).toEqual([BigInt('9007199254740995'), BigInt('9007199254740998')])
    expect(u64VectorArgument(result, 'create_pair_add_liquidity', 8)).toEqual([UNSAFE_AMOUNT, '2'])
    expect(u64VectorArgument(result, 'create_pair_add_liquidity', 9)).toEqual(['3', UNSAFE_AMOUNT_B])
  })

  test('preserves amountIn and minAmountOut in swap', async () => {
    const sdk = buildSdk()
    const builtAmounts: bigint[] = []
    mockCoinBuilder(builtAmounts)

    const result = await sdk.Almm.swap({
      pair: id('3'),
      coinTypeA: COIN_A,
      coinTypeB: COIN_B,
      amountIn: UNSAFE_AMOUNT,
      minAmountOut: UNSAFE_AMOUNT_B,
      swapForY: true,
      to: OWNER,
    })

    expect(builtAmounts).toEqual([BigInt(UNSAFE_AMOUNT), BigInt(0)])
    expect(u64Argument(result, 'swap', 5)).toBe(UNSAFE_AMOUNT)
    expect(u64Argument(result, 'swap', 6)).toBe(UNSAFE_AMOUNT_B)
  })

  test('keeps safe number inputs backward compatible', async () => {
    const sdk = buildSdk()
    const builtAmounts: bigint[] = []
    mockCoinBuilder(builtAmounts)

    const result = await sdk.Almm.swap({
      pair: id('3'),
      coinTypeA: COIN_A,
      coinTypeB: COIN_B,
      amountIn: 123,
      minAmountOut: 45,
      swapForY: true,
      to: OWNER,
    })

    expect(builtAmounts).toEqual([BigInt(123), BigInt(0)])
    expect(u64Argument(result, 'swap', 5)).toBe('123')
    expect(u64Argument(result, 'swap', 6)).toBe('45')
  })

  test.each(['', '-1', '1.5', '18446744073709551616', Number.MAX_SAFE_INTEGER + 1, true])(
    'rejects invalid u64 amount %p before building a transaction',
    async (amount) => {
      const sdk = buildSdk()
      const invalidAmount = amount as unknown as U64Amount

      await expect(
        sdk.Almm.mintByStrategy({
          pair: id('3'),
          bin_step: 5,
          coinTypeA: COIN_A,
          coinTypeB: COIN_B,
          amountATotal: invalidAmount,
          amountBTotal: U64_MAX,
          fixCoinA: true,
          fixCoinB: true,
          strategy: 0,
          min_bin: -10,
          max_bin: 10,
          active_bin: 0,
          slippage: 50,
        })
      ).rejects.toMatchObject<Partial<ClmmpoolsError>>({
        errorCode: MathErrorCode.InvalidCoinAmount,
      })
    }
  )

  test('rejects strategy transactions when neither coin amount is fixed', async () => {
    const sdk = buildSdk()
    const common = {
      pair: id('3'),
      bin_step: 5,
      coinTypeA: COIN_A,
      coinTypeB: COIN_B,
      amountATotal: 123,
      amountBTotal: 456,
      fixCoinA: false,
      fixCoinB: false,
      strategy: 0,
      min_bin: -10,
      max_bin: 10,
      active_bin: 0,
      slippage: 50,
    }

    await expect(sdk.Almm.mintByStrategy(common)).rejects.toMatchObject<Partial<ClmmpoolsError>>({
      errorCode: TypesErrorCode.InvalidType,
    })

    const addLiquidityParams = {
      ...common,
      positionId: id('4'),
      receiver: OWNER,
      rewards_token: [] as string[],
    }
    await expect(sdk.Almm.addLiquidityByStrategy(addLiquidityParams)).rejects.toMatchObject<Partial<ClmmpoolsError>>({
      errorCode: TypesErrorCode.InvalidType,
    })

    await expect(
      sdk.Almm.addLiquidityByStrategy({
        ...addLiquidityParams,
        rewards_token: [COIN_A],
      })
    ).rejects.toMatchObject<Partial<ClmmpoolsError>>({
      errorCode: TypesErrorCode.InvalidType,
    })
  })
})
