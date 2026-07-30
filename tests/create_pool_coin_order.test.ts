import { jest } from '@jest/globals'
import { Transaction } from '@mysten/sui/transactions'
import { ClmmpoolsError, PoolErrorCode } from '../src/errors/errors'
import { PoolModule } from '../src/modules/poolModule'
import type { MagmaClmmSDK } from '../src/sdk'
import type { CreatePoolAddLiquidityParams, CreatePoolParams } from '../src/types/clmm_type'

const id = (digit: string) => `0x${digit.repeat(64)}`
const LOWER_COIN_TYPE = `${id('2')}::lower::LOWER`
const HIGHER_COIN_TYPE = `${id('3')}::higher::HIGHER`

function buildPoolModule(): PoolModule {
  return new PoolModule({} as MagmaClmmSDK)
}

function buildParams(coinTypeA = LOWER_COIN_TYPE, coinTypeB = HIGHER_COIN_TYPE): CreatePoolAddLiquidityParams {
  return {
    coinTypeA,
    coinTypeB,
    tick_spacing: 2,
    initialize_sqrt_price: '123456789',
    uri: '',
    amount_a: '111',
    metadata_a: id('4'),
    metadata_b: id('5'),
    amount_b: '222',
    fix_amount_a: true,
    tick_lower: -100,
    tick_upper: 200,
    slippage: 0.01,
  }
}

type CreatePoolCall = (module: PoolModule, params: CreatePoolAddLiquidityParams) => Promise<Transaction>

const createPoolCalls: Array<[string, CreatePoolCall]> = [
  ['createPoolTransactionPayload', (module, params) => module.createPoolTransactionPayload(params)],
  ['creatPoolTransactionPayload', (module, params) => module.creatPoolTransactionPayload(params)],
]

describe('create-pool canonical coin order', () => {
  test.each(createPoolCalls)('%s rejects reversed coin order without mutating parameters', async (_name, call) => {
    const module = buildPoolModule()
    const params = buildParams()
    const originalParams = { ...params }

    await expect(call(module, params)).rejects.toMatchObject<Partial<ClmmpoolsError>>({
      errorCode: PoolErrorCode.InvalidCoinTypeSequence,
      details: {
        coinTypeA: LOWER_COIN_TYPE,
        coinTypeB: HIGHER_COIN_TYPE,
      },
    })
    expect(params).toEqual(originalParams)
  })

  test('creatPoolsTransactionPayload rejects reversed coin order without mutating parameters', async () => {
    const module = buildPoolModule()
    const params: CreatePoolParams = {
      coinTypeA: LOWER_COIN_TYPE,
      coinTypeB: HIGHER_COIN_TYPE,
      tick_spacing: 2,
      initialize_sqrt_price: '123456789',
      uri: '',
    }
    const originalParams = { ...params }

    await expect(module.creatPoolsTransactionPayload([params])).rejects.toMatchObject<Partial<ClmmpoolsError>>({
      errorCode: PoolErrorCode.InvalidCoinTypeSequence,
    })
    expect(params).toEqual(originalParams)
  })

  test('passes canonical order to the transaction builder unchanged', async () => {
    const module = buildPoolModule()
    const params = buildParams(HIGHER_COIN_TYPE, LOWER_COIN_TYPE)
    const originalParams = { ...params }
    const transaction = new Transaction()
    const builder = jest.spyOn(module as any, 'createPoolAndAddLiquidity').mockImplementation(async (..._args: unknown[]) => transaction)

    await expect(module.createPoolTransactionPayload(params)).resolves.toBe(transaction)
    expect(builder).toHaveBeenCalledWith(params)
    expect(params).toEqual(originalParams)
  })
})
