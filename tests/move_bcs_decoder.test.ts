import { jest } from '@jest/globals'
import { bcs } from '@mysten/sui/bcs'
import type { SuiClientTypes } from '@mysten/sui/client'
import type { SuiGrpcClient } from '@mysten/sui/grpc'
import { MoveBcsEventDecoder } from '../src/modules/rpc/moveBcsDecoder'

const PACKAGE_ID = `0x${'1'.repeat(64)}`
const POSITION_ID = `0x${'2'.repeat(64)}`
const OWNER = `0x${'3'.repeat(64)}`

const EventSchema = bcs.struct('FetchEvent', {
  position_id: bcs.Address,
  amount: bcs.u64(),
  ticks: bcs.vector(bcs.u32()),
  enabled: bcs.bool(),
})

function signature(type: number, extra: Record<string, unknown> = {}) {
  return { type, typeParameterInstantiation: [], ...extra }
}

function packageWithFetchEvent() {
  return {
    storageId: PACKAGE_ID,
    originalId: PACKAGE_ID,
    version: 1n,
    typeOrigins: [],
    linkage: [],
    modules: [{
      name: 'fetcher',
      contents: new Uint8Array(),
      functions: [],
      datatypes: [{
        typeName: `${PACKAGE_ID}::fetcher::FetchEvent`,
        definingId: PACKAGE_ID,
        module: 'fetcher',
        name: 'FetchEvent',
        abilities: [],
        typeParameters: [],
        kind: 1,
        variants: [],
        fields: [
          {
            name: 'position_id',
            position: 0,
            type: signature(10, {
              typeName: '0x2::object::ID',
            }),
          },
          { name: 'amount', position: 1, type: signature(6) },
          {
            name: 'ticks',
            position: 2,
            type: signature(9, {
              typeParameterInstantiation: [signature(5)],
            }),
          },
          { name: 'enabled', position: 3, type: signature(2) },
        ],
      }],
    }],
  }
}

function event(bcsBytes: Uint8Array): SuiClientTypes.Event {
  return {
    packageId: PACKAGE_ID,
    module: 'fetcher',
    sender: OWNER,
    eventType: `${PACKAGE_ID}::fetcher::FetchEvent`,
    bcs: bcsBytes,
    json: { amount: 'incorrect transport JSON' },
  }
}

describe('MoveBcsEventDecoder', () => {
  test('builds an on-chain descriptor schema and ignores transport JSON', async () => {
    const getPackage = jest.fn(() => ({
      response: Promise.resolve({
        package: {
          storageId: PACKAGE_ID,
          originalId: PACKAGE_ID,
          version: 1n,
          typeOrigins: [],
          linkage: [],
          modules: [{
            name: 'fetcher',
            contents: new Uint8Array(),
            functions: [],
            datatypes: [{
              typeName: `${PACKAGE_ID}::fetcher::FetchEvent`,
              definingId: PACKAGE_ID,
              module: 'fetcher',
              name: 'FetchEvent',
              abilities: [],
              typeParameters: [],
              kind: 1,
              variants: [],
              fields: [
                {
                  name: 'position_id',
                  position: 0,
                  type: signature(10, {
                    typeName: '0x2::object::ID',
                  }),
                },
                { name: 'amount', position: 1, type: signature(6) },
                {
                  name: 'ticks',
                  position: 2,
                  type: signature(9, {
                    typeParameterInstantiation: [signature(5)],
                  }),
                },
                { name: 'enabled', position: 3, type: signature(2) },
              ],
            }],
          }],
        },
      }),
    }))
    const decoder = new MoveBcsEventDecoder({
      movePackageService: { getPackage },
    } as unknown as SuiGrpcClient)
    const bytes = EventSchema.serialize({
      position_id: POSITION_ID,
      amount: '42',
      ticks: [1, 2, 3],
      enabled: true,
    }).toBytes()

    const first = await decoder.decode(event(bytes))
    const second = await decoder.decode(event(bytes))

    expect(first).toEqual({
      position_id: POSITION_ID,
      amount: '42',
      ticks: [1, 2, 3],
      enabled: true,
    })
    expect(second).toEqual(first)
    expect(first).not.toEqual(event(bytes).json)
    expect(getPackage).toHaveBeenCalledTimes(1)
  })

  test('rejects BCS bytes that do not match the on-chain descriptor', async () => {
    const getPackage = jest.fn(() => ({
      response: Promise.resolve({
        package: {
          modules: [{
            name: 'fetcher',
            functions: [],
            datatypes: [{
              typeName: `${PACKAGE_ID}::fetcher::FetchEvent`,
              module: 'fetcher',
              name: 'FetchEvent',
              abilities: [],
              typeParameters: [],
              kind: 1,
              variants: [],
              fields: [{ name: 'amount', position: 0, type: signature(6) }],
            }],
          }],
          typeOrigins: [],
          linkage: [],
        },
      }),
    }))
    const decoder = new MoveBcsEventDecoder({
      movePackageService: { getPackage },
    } as unknown as SuiGrpcClient)

    await expect(decoder.decode(event(new Uint8Array([1])))).rejects.toThrow()
  })

  test('retries package descriptor loading after a transient transport failure', async () => {
    let attempt = 0
    const getPackage = jest.fn(() => {
      attempt += 1
      return {
        response: attempt === 1
          ? Promise.reject(new Error('temporary transport failure'))
          : Promise.resolve({ package: packageWithFetchEvent() }),
      }
    })
    const decoder = new MoveBcsEventDecoder({
      movePackageService: { getPackage },
    } as unknown as SuiGrpcClient)
    const bytes = EventSchema.serialize({
      position_id: POSITION_ID,
      amount: '42',
      ticks: [1, 2, 3],
      enabled: true,
    }).toBytes()

    await expect(decoder.decode(event(bytes))).rejects.toMatchObject({ code: 'RPC_TRANSPORT_ERROR' })
    await expect(decoder.decode(event(bytes))).resolves.toMatchObject({
      position_id: POSITION_ID,
      amount: '42',
    })
    expect(getPackage).toHaveBeenCalledTimes(2)
  })
})
