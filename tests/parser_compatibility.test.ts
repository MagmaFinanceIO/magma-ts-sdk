import type { SuiObjectResponse } from '@mysten/sui/jsonRpc'
import { buildPool, buildPosition } from '../src/utils/common'

const PACKAGE_ID = `0x${'1'.repeat(64)}`
const OBJECT_ID = `0x${'2'.repeat(64)}`
const OWNER = `0x${'3'.repeat(64)}`
const POOL_ID = `0x${'4'.repeat(64)}`
const POSITION_HANDLE = `0x${'5'.repeat(64)}`
const TICK_HANDLE = `0x${'6'.repeat(64)}`
const COIN_A = '0x2::sui::SUI'
const COIN_B = '0x2::coin::COIN'
const PARSED_COIN_B = `0x${'0'.repeat(63)}2::coin::COIN`

function response(type: string, fields: Record<string, unknown>): SuiObjectResponse {
  return {
    data: {
      objectId: OBJECT_ID,
      version: '1',
      digest: 'digest',
      type,
      owner: { AddressOwner: OWNER },
      content: { dataType: 'moveObject', type, fields } as any,
    },
  }
}

const flatPosition = {
  id: OBJECT_ID,
  coin_type_a: COIN_A,
  coin_type_b: COIN_B,
  liquidity: '1000',
  tick_lower_index: { bits: '10' },
  tick_upper_index: { bits: '20' },
  index: '7',
  pool: POOL_ID,
  name: 'Magma Position',
}

const nestedPosition = {
  id: { fields: { id: { id: OBJECT_ID } } },
  coin_type_a: { fields: { name: COIN_A } },
  coin_type_b: { fields: { name: COIN_B } },
  liquidity: '1000',
  tick_lower_index: { fields: { bits: '10' } },
  tick_upper_index: { fields: { bits: '20' } },
  index: '7',
  pool: POOL_ID,
  name: 'Magma Position',
}

describe.each([
  ['Sui v2 flat JSON', flatPosition],
  ['legacy nested Move JSON', nestedPosition],
])('position parser: %s', (_name, fields) => {
  test('produces the same protocol position', () => {
    const position = buildPosition(response(`${PACKAGE_ID}::position::Position`, fields))
    expect(position).toMatchObject({
      pos_object_id: OBJECT_ID,
      owner: OWNER,
      coin_type_a: COIN_A,
      coin_type_b: COIN_B,
      liquidity: '1000',
      tick_lower_index: 10,
      tick_upper_index: 20,
      index: '7',
      pool: POOL_ID,
    })
  })
})

function poolFields(nested: boolean): Record<string, unknown> {
  const positions = nested
    ? { fields: { id: { id: POSITION_HANDLE }, size: '2' } }
    : { id: POSITION_HANDLE, size: '2' }
  const ticks = nested
    ? { fields: { id: { id: TICK_HANDLE }, size: '3' } }
    : { id: TICK_HANDLE, size: '3' }
  const rewarderManager = { rewarders: [], last_updated_time: '0' }
  return {
    coin_a: '100',
    coin_b: '200',
    current_sqrt_price: '18446744073709551616',
    current_tick_index: nested ? { fields: { bits: '5' } } : { bits: '5' },
    fee_growth_global_a: '0',
    fee_growth_global_b: '0',
    fee_protocol_coin_a: '0',
    fee_protocol_coin_b: '0',
    fee_rate: '3000',
    is_pause: false,
    liquidity: '1000',
    position_manager: nested ? { fields: { positions } } : { positions },
    rewarder_manager: nested ? { fields: rewarderManager } : rewarderManager,
    tick_spacing: '2',
    tick_manager: nested ? { fields: { ticks } } : { ticks },
    url: 'https://example.com/pool',
    index: '9',
  }
}

describe.each([
  ['Sui v2 flat JSON', poolFields(false)],
  ['legacy nested Move JSON', poolFields(true)],
])('pool parser: %s', (_name, fields) => {
  test('produces the same protocol pool', () => {
    const pool = buildPool(response(`${PACKAGE_ID}::pool::Pool<${COIN_A}, ${COIN_B}>`, fields))
    expect(pool).toMatchObject({
      poolAddress: OBJECT_ID,
      coinTypeA: COIN_A,
      coinTypeB: PARSED_COIN_B,
      coinAmountA: '100',
      coinAmountB: '200',
      current_tick_index: 5,
      liquidity: '1000',
      position_manager: { positions_handle: POSITION_HANDLE, size: '2' },
      ticks_handle: TICK_HANDLE,
      tickSpacing: '2',
      index: 9,
    })
  })
})
