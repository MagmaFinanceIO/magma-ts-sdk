import { jest } from '@jest/globals'
import type { SuiGrpcClient } from '@mysten/sui/grpc'
import { PositionModule } from '../src/modules/positionModule'
import { createRpcModule } from '../src/modules/rpcModule'
import { MagmaClmmSDK } from '../src/sdk'

const PACKAGE_ID = `0x${'1'.repeat(64)}`
const POSITION_ID = `0x${'2'.repeat(64)}`
const OWNER = `0x${'3'.repeat(64)}`
const POOL_ID = `0x${'4'.repeat(64)}`

function buildV2PositionObject() {
  return {
    objectId: POSITION_ID,
    version: '1',
    digest: 'digest',
    type: `${PACKAGE_ID}::position::Position`,
    owner: { $kind: 'AddressOwner', AddressOwner: OWNER },
    json: {
      id: POSITION_ID,
      coin_type_a: '0x2::sui::SUI',
      coin_type_b: '0x2::coin::COIN',
      liquidity: '1000',
      tick_lower_index: { bits: '10' },
      tick_upper_index: { bits: '20' },
      index: '7',
      pool: POOL_ID,
      name: 'Magma Position',
    },
    content: undefined,
    previousTransaction: null,
    objectBcs: undefined,
    display: null,
  }
}

function buildFakeGrpcClient(overrides: Record<string, unknown> = {}): SuiGrpcClient {
  return {
    listOwnedObjects: jest.fn(async () => ({
      objects: [buildV2PositionObject()],
      hasNextPage: false,
      cursor: null,
    })),
    ...overrides,
  } as unknown as SuiGrpcClient
}

describe('Sui SDK v2 gRPC migration', () => {
  test('constructs the SDK with only an injected gRPC client without mutating caller data', () => {
    const grpcClient = buildFakeGrpcClient({ marker: '0x1' })
    const emptyPackage = { package_id: '', published_at: '' }
    const callerOptions = {
      network: 'mainnet' as const,
      suiGrpcClient: grpcClient,
      simulationAccount: { address: OWNER },
      magma_config: emptyPackage,
      ve33: emptyPackage,
      clmm_pool: { ...emptyPackage, package_id: '0x1' },
      almm_pool: emptyPackage,
      distribution: emptyPackage,
      integrate: emptyPackage,
      deepbook: emptyPackage,
      deepbook_endpoint_v2: emptyPackage,
      aggregatorUrl: '',
    }
    const sdk = new MagmaClmmSDK(callerOptions)

    expect(sdk.fullClient.suiGrpcClient).toBe(grpcClient)
    expect(sdk.fullClient._jsonRpcClient).toBeUndefined()
    expect(callerOptions.clmm_pool.package_id).toBe('0x1')
    expect((grpcClient as any).marker).toBe('0x1')
    expect(sdk.sdkOptions).not.toBe(callerOptions)
    expect(sdk.sdkOptions.clmm_pool).not.toBe(callerOptions.clmm_pool)
    expect(sdk.sdkOptions.clmm_pool.package_id).toBe(`0x${'0'.repeat(63)}1`)
  })

  test('reads and maps CLMM positions through an injected gRPC client without JSON-RPC', async () => {
    const grpcClient = buildFakeGrpcClient()
    const fullClient = createRpcModule({ client: grpcClient, network: 'mainnet' })
    const sdk = {
      sdkOptions: { clmm_pool: { package_id: PACKAGE_ID } },
      fullClient,
      updateCache: jest.fn(),
      getCache: jest.fn(),
    }
    const positionModule = new PositionModule(sdk as any)

    const positions = await positionModule.getPositionList(OWNER)

    expect(fullClient._jsonRpcClient).toBeUndefined()
    expect(grpcClient.listOwnedObjects).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: OWNER,
        type: `${PACKAGE_ID}::position::Position`,
        include: expect.objectContaining({ json: true }),
      })
    )
    expect(positions).toHaveLength(1)
    expect(positions[0]).toMatchObject({
      pos_object_id: POSITION_ID,
      owner: OWNER,
      pool: POOL_ID,
      liquidity: '1000',
      coin_type_a: '0x2::sui::SUI',
      coin_type_b: '0x2::coin::COIN',
      tick_lower_index: 10,
      tick_upper_index: 20,
    })
  })

  test('maps representative Position/ALMM/Gauge/Lock/Swap/Reward v2 events at the compatibility boundary', async () => {
    const eventModules = ['fetcher', 'almm', 'gauge', 'lock', 'swap', 'rewarder']
    const simulateTransaction = jest.fn(async () => ({
      $kind: 'Transaction',
      Transaction: {
        status: { success: true, error: null },
        effects: {
          status: { success: true, error: null },
          gasUsed: { computationCost: '2', storageCost: '3', storageRebate: '1' },
        },
        events: eventModules.map((module) => ({
          packageId: PACKAGE_ID,
          module,
          sender: OWNER,
          eventType: `${PACKAGE_ID}::${module}::CompatibilityEvent`,
          bcs: new Uint8Array([1, 2]),
          json: { module, position_id: POSITION_ID },
        })),
      },
      commandResults: [],
    }))
    const decode = jest.fn(async (event: any) => event.json)
    const fullClient = createRpcModule({
      client: buildFakeGrpcClient({ simulateTransaction }),
      network: 'mainnet',
      eventDecoder: { decode },
    })
    const transaction = { setSender: jest.fn() }

    const result = await fullClient.devInspectTransactionBlock({
      transactionBlock: transaction as any,
      sender: OWNER,
    })

    expect(transaction.setSender).toHaveBeenCalledWith(OWNER)
    expect(result.error).toBeNull()
    expect(decode).toHaveBeenCalledTimes(eventModules.length)
    expect(result.events).toHaveLength(eventModules.length)
    result.events.forEach((event, index) => {
      expect(event).toMatchObject({
        type: `${PACKAGE_ID}::${eventModules[index]}::CompatibilityEvent`,
        parsedBcs: { module: eventModules[index], position_id: POSITION_ID },
        parsedJson: { module: eventModules[index], position_id: POSITION_ID },
      })
    })
  })

  test('fails clearly when an event query is used without an explicit fallback', async () => {
    const fullClient = createRpcModule({ client: buildFakeGrpcClient(), network: 'mainnet' })

    await expect(fullClient.queryEventsByPage({ MoveEventType: '0x1::event::Event' })).rejects.toThrow(
      'requires an explicit jsonRpcClient or jsonRpcUrl'
    )
  })
})
