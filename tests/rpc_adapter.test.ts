import { jest } from '@jest/globals'
import type { SuiGrpcClient } from '@mysten/sui/grpc'
import { Transaction } from '@mysten/sui/transactions'
import { createRpcModule, MagmaRpcError } from '../src/modules/rpcModule'

const ID = `0x${'1'.repeat(64)}`
const ID_2 = `0x${'2'.repeat(64)}`
const OWNER = `0x${'3'.repeat(64)}`
const COIN_TYPE = '0x2::sui::SUI'
const TX_DIGEST = '11111111111111111111111111111111'

function object(objectId = ID) {
  return {
    objectId,
    version: '1',
    digest: 'digest',
    type: `${ID_2}::test::Object`,
    owner: { $kind: 'AddressOwner', AddressOwner: OWNER },
    json: { id: objectId },
    objectBcs: undefined,
    display: null,
    previousTransaction: null,
  }
}

function client(methods: Record<string, unknown>): SuiGrpcClient {
  return methods as unknown as SuiGrpcClient
}

describe('RPC adapter safety and compatibility', () => {
  test('bounds all-page pagination and reports truncation', async () => {
    const listOwnedObjects = jest.fn(async () => ({
      objects: [object()],
      cursor: 'next',
      hasNextPage: true,
    }))
    const rpc = createRpcModule({
      client: client({ listOwnedObjects }),
      paginationPolicy: { maxPages: 1, maxItems: 10, pageSize: 1 },
    })

    const page = await rpc.getOwnedObjectsByPage(OWNER, { options: { showContent: true } }, 'all')

    expect(page.data).toHaveLength(1)
    expect(page.hasNextPage).toBe(true)
    expect(page.truncated).toBe(true)
    expect(listOwnedObjects).toHaveBeenCalledTimes(1)
  })

  test('paginates an explicit JSON-RPC event fallback and maps transport failures', async () => {
    const event = {
      id: { txDigest: 'digest', eventSeq: '0' },
      packageId: ID,
      transactionModule: 'factory',
      sender: OWNER,
      type: `${ID}::factory::Event`,
      parsedJson: { value: '1' },
      bcsEncoding: 'base64',
      bcs: '',
      timestampMs: null,
    }
    const pages = [
      { data: [event], nextCursor: event.id, hasNextPage: true },
      { data: [{ ...event, id: { ...event.id, eventSeq: '1' } }], nextCursor: null, hasNextPage: false },
    ]
    const queryEvents = jest.fn(async () => pages.shift())
    const rpc = createRpcModule({
      client: client({}),
      jsonRpcClient: { queryEvents } as any,
      paginationPolicy: { pageSize: 1 },
    })

    const result = await rpc.queryEventsByPage({ MoveEventType: event.type }, 'all')
    expect(result.data).toHaveLength(2)
    expect(queryEvents).toHaveBeenCalledTimes(2)

    const failed = createRpcModule({
      client: client({}),
      jsonRpcClient: {
        queryEvents: jest.fn(async () => {
          throw new Error('private upstream event error')
        }),
      } as any,
    })
    await expect(failed.queryEventsByPage({ MoveEventType: event.type })).rejects.toMatchObject({
      code: 'RPC_TRANSPORT_ERROR',
      message: 'queryEventsByPage failed because the Sui transport was unavailable',
    })
  })

  test('supports cancellation before a paginated transport request', async () => {
    const listOwnedObjects = jest.fn()
    const rpc = createRpcModule({ client: client({ listOwnedObjects }) })
    const controller = new AbortController()
    controller.abort()

    await expect(
      rpc.getOwnedObjectsByPage(OWNER, { options: { showContent: true } }, { all: true, signal: controller.signal })
    ).rejects.toMatchObject({ code: 'OPERATION_ABORTED' })
    expect(listOwnedObjects).not.toHaveBeenCalled()
  })

  test.each([
    ['http://169.254.169.254/latest', 'Private and loopback RPC endpoints are disabled'],
    ['http://rpc.example.com', 'RPC endpoint must use HTTPS'],
    ['not a url', 'valid absolute URL'],
  ])('rejects unsafe endpoint %s', (url, message) => {
    expect(() => createRpcModule({ url })).toThrow(message)
  })

  test('allows loopback HTTP only when local development is explicitly enabled', () => {
    expect(() =>
      createRpcModule({
        url: 'http://127.0.0.1:9000',
        endpointPolicy: { allowInsecureLocalhost: true },
      })
    ).not.toThrow()
    expect(() =>
      createRpcModule({
        url: 'http://169.254.169.254/latest',
        endpointPolicy: { allowInsecureLocalhost: true },
      })
    ).toThrow('Private and loopback RPC endpoints are disabled')
  })

  test('rejects invalid IDs and pagination limits before transport calls', async () => {
    const getObject = jest.fn()
    const listDynamicFields = jest.fn()
    const rpc = createRpcModule({ client: client({ getObject, listDynamicFields }) })

    await expect(rpc.getObject({ id: 'bad-id' })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
    await expect(rpc.getDynamicFields({ parentId: ID, limit: 0 })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
    expect(getObject).not.toHaveBeenCalled()
    expect(listDynamicFields).not.toHaveBeenCalled()
  })

  test('distinguishes object absence from transport failure without exposing raw details', async () => {
    const notFound = createRpcModule({
      client: client({
        getObject: jest.fn(async () => {
          throw new Error('object not found')
        }),
      }),
    })
    const response = await notFound.getObject({ id: ID })
    expect(response).toEqual({ error: { code: 'notExists', object_id: ID } })

    const unavailable = createRpcModule({
      client: client({
        getObject: jest.fn(async () => {
          throw new Error('token=secret internal timeout')
        }),
      }),
    })
    await expect(unavailable.getObject({ id: ID })).rejects.toMatchObject({
      code: 'RPC_TRANSPORT_ERROR',
      message: 'getObject failed because the Sui transport was unavailable',
    })
    await expect(unavailable.getObject({ id: ID })).rejects.not.toThrow('token=secret')
  })

  test('maps batch item failures to unknown instead of notExists or raw messages', async () => {
    const rpc = createRpcModule({
      client: client({
        getObjects: jest.fn(async () => ({ objects: [new Error('private upstream detail')] })),
      }),
    })

    await expect(rpc.batchGetObjects([ID])).resolves.toEqual([{ error: { code: 'unknown' } }])
  })

  test('does not fabricate hasPublicTransfer in legacy object metadata', async () => {
    const rpc = createRpcModule({
      client: client({ getObject: jest.fn(async () => ({ object: object() })) }),
    })

    const response = await rpc.getObject({ id: ID, options: { showContent: true } })
    expect(response.data.content).not.toHaveProperty('hasPublicTransfer')
  })

  test('validates dynamic-field integer ranges', async () => {
    const rpc = createRpcModule({ client: client({ getObject: jest.fn() }) })

    await expect(
      rpc.getDynamicFieldObject({
        parentId: ID,
        name: { type: 'u8', value: 256 },
      })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
  })

  test('returns stable simulation errors without raw node details', async () => {
    const executionError = {
      command: 0,
      kind: 'MoveAbort',
      abortCode: '42',
      location: `${ID}::fetcher_script`,
      message: 'sensitive Move abort details',
    }
    const simulateTransaction = jest.fn(async () => ({
      $kind: 'FailedTransaction',
      FailedTransaction: {
        status: { success: false, error: executionError },
        effects: { status: { success: false, error: executionError } },
        events: [],
      },
      commandResults: [],
    }))
    const rpc = createRpcModule({ client: client({ simulateTransaction }) })
    const result = await rpc.devInspectTransactionBlock({
      sender: OWNER,
      transactionBlock: { setSender: jest.fn() } as any,
    })

    expect(result.error).toEqual({ code: 'SIMULATION_FAILED', message: 'Transaction simulation failed' })
    expect(result.effects.status.success).toBe(false)
    expect(JSON.stringify(result)).not.toContain('sensitive Move abort details')
  })

  test('classifies failed simulations before attempting event decoding', async () => {
    const decode = jest.fn(async () => {
      throw new Error('decoder must not mask simulation failure')
    })
    const rpc = createRpcModule({
      client: client({
        simulateTransaction: jest.fn(async () => ({
          $kind: 'FailedTransaction',
          FailedTransaction: {
            status: { success: false, error: { command: 0, kind: 'MoveAbort' } },
            effects: { status: { success: false, error: { command: 0, kind: 'MoveAbort' } } },
            events: [
              {
                packageId: ID,
                module: 'fetcher_script',
                sender: OWNER,
                eventType: `${ID}::fetcher_script::UnexpectedEvent`,
                bcs: new Uint8Array([255]),
                json: null,
              },
            ],
          },
          commandResults: [],
        })),
      }),
      eventDecoder: { decode },
    })

    const result = await rpc.devInspectTransactionBlock({
      sender: OWNER,
      transactionBlock: { setSender: jest.fn() } as any,
    })

    expect(result.error?.code).toBe('SIMULATION_FAILED')
    expect(result.effects.status.success).toBe(false)
    expect(decode).not.toHaveBeenCalled()
  })

  test('maps successful simulation results with v2 effects status and decoded events', async () => {
    const event = {
      packageId: ID,
      module: 'fetcher_script',
      sender: OWNER,
      eventType: `${ID}::fetcher_script::FetchPositionFeesEvent`,
      bcs: new Uint8Array([1, 2, 3]),
      json: { ignored: true },
    }
    const commandResults = [{ returnValues: [] }]
    const simulateTransaction = jest.fn(async () => ({
      $kind: 'Transaction',
      Transaction: {
        status: { success: true, error: null },
        effects: {
          status: { success: true, error: null },
          gasUsed: { computationCost: '2', storageCost: '3', storageRebate: '1' },
        },
        events: [event],
      },
      commandResults,
    }))
    const decode = jest.fn(async () => ({ position_id: ID_2 }))
    const rpc = createRpcModule({
      client: client({ simulateTransaction }),
      eventDecoder: { decode },
    })

    const result = await rpc.devInspectTransactionBlock({
      sender: OWNER,
      transactionBlock: { setSender: jest.fn() } as any,
    })

    expect(result.error).toBeNull()
    expect(result.effects.status.success).toBe(true)
    expect(result.results).toBe(commandResults)
    expect(result.events[0]).toMatchObject({
      type: `${ID}::fetcher_script::FetchPositionFeesEvent`,
      parsedBcs: { position_id: ID_2 },
      parsedJson: { position_id: ID_2 },
    })
    expect(simulateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { effects: true, events: true, commandResults: true },
      })
    )
  })

  test('rejects malformed simulation results without a union branch', async () => {
    const rpc = createRpcModule({
      client: client({ simulateTransaction: jest.fn(async () => ({ $kind: 'Transaction' })) }),
    })

    await expect(
      rpc.devInspectTransactionBlock({
        sender: OWNER,
        transactionBlock: { setSender: jest.fn() } as any,
      })
    ).rejects.toThrow(/malformed/i)
  })

  test('rejects simulation results with a branch but missing discriminant', async () => {
    const rpc = createRpcModule({
      client: client({
        simulateTransaction: jest.fn(async () => ({
          Transaction: { effects: { status: { success: true, error: null } }, events: [] },
        })),
      }),
    })

    await expect(
      rpc.devInspectTransactionBlock({
        sender: OWNER,
        transactionBlock: { setSender: jest.fn() } as any,
      })
    ).rejects.toThrow(/malformed/i)
  })

  test('rejects malformed simulation results with both union branches', async () => {
    const rpc = createRpcModule({
      client: client({
        simulateTransaction: jest.fn(async () => ({
          $kind: 'Transaction',
          Transaction: { effects: { status: { success: true, error: null } }, events: [] },
          FailedTransaction: { effects: { status: { success: false, error: { command: 0 } } }, events: [] },
        })),
      }),
    })

    await expect(
      rpc.devInspectTransactionBlock({
        sender: OWNER,
        transactionBlock: { setSender: jest.fn() } as any,
      })
    ).rejects.toThrow(/malformed/i)
  })

  test('rejects transaction simulation branches whose status reports failure', async () => {
    const rpc = createRpcModule({
      client: client({
        simulateTransaction: jest.fn(async () => ({
          $kind: 'Transaction',
          Transaction: {
            status: { success: false, error: { command: 0, kind: 'MoveAbort' } },
            effects: { status: { success: false, error: { command: 0, kind: 'MoveAbort' } } },
            events: [],
          },
        })),
      }),
    })

    await expect(
      rpc.devInspectTransactionBlock({
        sender: OWNER,
        transactionBlock: { setSender: jest.fn() } as any,
      })
    ).rejects.toThrow(/malformed|simulation/i)
  })

  test('rejects transaction simulation branches missing required status', async () => {
    const rpc = createRpcModule({
      client: client({
        simulateTransaction: jest.fn(async () => ({
          $kind: 'Transaction',
          Transaction: {
            effects: { status: { success: true, error: null } },
            events: [],
          },
        })),
      }),
    })

    await expect(
      rpc.devInspectTransactionBlock({
        sender: OWNER,
        transactionBlock: { setSender: jest.fn() } as any,
      })
    ).rejects.toThrow(/malformed/i)
  })

  test.each([
    [
      'missing effects status',
      {
        $kind: 'Transaction',
        Transaction: {
          status: { success: true, error: null },
          effects: {},
          events: [],
        },
        commandResults: [],
      },
    ],
    [
      'a success status carrying an error',
      {
        $kind: 'Transaction',
        Transaction: {
          status: { success: true, error: { message: 'contradictory error' } },
          effects: { status: { success: true, error: null } },
          events: [],
        },
        commandResults: [],
      },
    ],
    [
      'a success effects status carrying an error',
      {
        $kind: 'Transaction',
        Transaction: {
          status: { success: true, error: null },
          effects: { status: { success: true, error: { message: 'contradictory error' } } },
          events: [],
        },
        commandResults: [],
      },
    ],
    [
      'missing command results',
      {
        $kind: 'Transaction',
        Transaction: {
          status: { success: true, error: null },
          effects: { status: { success: true, error: null } },
          events: [],
        },
      },
    ],
    [
      'non-array events',
      {
        $kind: 'Transaction',
        Transaction: {
          status: { success: true, error: null },
          effects: { status: { success: true, error: null } },
          events: {},
        },
        commandResults: [],
      },
    ],
    [
      'an unknown union discriminant',
      {
        $kind: 'Unknown',
        Transaction: {
          status: { success: true, error: null },
          effects: { status: { success: true, error: null } },
          events: [],
        },
        commandResults: [],
      },
    ],
    [
      'a discriminant that disagrees with its branch',
      {
        $kind: 'FailedTransaction',
        Transaction: {
          status: { success: true, error: null },
          effects: { status: { success: true, error: null } },
          events: [],
        },
        commandResults: [],
      },
    ],
    [
      'a Transaction discriminant carrying only a failed branch',
      {
        $kind: 'Transaction',
        FailedTransaction: {
          status: { success: false, error: { message: 'MoveAbort' } },
          effects: { status: { success: false, error: { message: 'MoveAbort' } } },
          events: [],
        },
        commandResults: [],
      },
    ],
    [
      'a failed status without an error',
      {
        $kind: 'FailedTransaction',
        FailedTransaction: {
          status: { success: false, error: null },
          effects: { status: { success: false, error: { message: 'MoveAbort' } } },
          events: [],
        },
        commandResults: [],
      },
    ],
    [
      'a failed effects status without an error',
      {
        $kind: 'FailedTransaction',
        FailedTransaction: {
          status: { success: false, error: { message: 'MoveAbort' } },
          effects: { status: { success: false, error: null } },
          events: [],
        },
        commandResults: [],
      },
    ],
  ])('rejects a malformed simulation response with %s', async (_label, response) => {
    const rpc = createRpcModule({
      client: client({
        simulateTransaction: jest.fn(async () => response),
      }),
    })

    await expect(
      rpc.devInspectTransactionBlock({
        sender: OWNER,
        transactionBlock: { setSender: jest.fn() } as any,
      })
    ).rejects.toMatchObject({
      code: 'OBJECT_QUERY_FAILED',
      message: 'Sui returned a malformed simulation response',
    })
  })

  test('rejects instead of returning success when event decoding fails', async () => {
    const rpc = createRpcModule({
      client: client({
        simulateTransaction: jest.fn(async () => ({
          $kind: 'Transaction',
          Transaction: {
            status: { success: true, error: null },
            effects: { status: { success: true, error: null } },
            events: [
              {
                packageId: ID,
                module: 'fetcher_script',
                sender: OWNER,
                eventType: `${ID}::fetcher_script::FetchPositionFeesEvent`,
                bcs: new Uint8Array([1]),
                json: null,
              },
            ],
          },
          commandResults: [],
        })),
      }),
      eventDecoder: {
        decode: jest.fn(async () => {
          throw new Error('decoder failed')
        }),
      },
    })

    await expect(
      rpc.devInspectTransactionBlock({
        sender: OWNER,
        transactionBlock: { setSender: jest.fn() } as any,
      })
    ).rejects.toMatchObject({ code: 'OBJECT_QUERY_FAILED' })
  })

  test('preserves a typed event decoder failure instead of relabeling it as transport failure', async () => {
    const decoderError = new MagmaRpcError('OBJECT_QUERY_FAILED', 'typed decoder failure')
    const rpc = createRpcModule({
      client: client({
        simulateTransaction: jest.fn(async () => ({
          $kind: 'Transaction',
          Transaction: {
            status: { success: true, error: null },
            effects: { status: { success: true, error: null } },
            events: [
              {
                packageId: ID,
                module: 'fetcher_script',
                sender: OWNER,
                eventType: `${ID}::fetcher_script::FetchPositionFeesEvent`,
                bcs: new Uint8Array([1]),
                json: null,
              },
            ],
          },
          commandResults: [],
        })),
      }),
      eventDecoder: {
        decode: jest.fn(async () => {
          throw decoderError
        }),
      },
    })

    await expect(
      rpc.devInspectTransactionBlock({
        sender: OWNER,
        transactionBlock: { setSender: jest.fn() } as any,
      })
    ).rejects.toBe(decoderError)
  })

  test('reports simulateTransaction transport rejection separately from execution failure', async () => {
    const rpc = createRpcModule({
      client: client({
        simulateTransaction: jest.fn(async () => {
          throw new Error('private upstream detail')
        }),
      }),
    })

    await expect(
      rpc.devInspectTransactionBlock({
        sender: OWNER,
        transactionBlock: { setSender: jest.fn() } as any,
      })
    ).rejects.toMatchObject({
      code: 'RPC_TRANSPORT_ERROR',
      message: 'simulateTransaction failed because the Sui transport was unavailable',
    })
  })

  test('sendSimulationTransaction preserves a failed simulation result without submitting it', async () => {
    const executionError = { command: 0, kind: 'MoveAbort' }
    const signAndExecuteTransaction = jest.fn()
    const rpc = createRpcModule({
      client: client({
        signAndExecuteTransaction,
        simulateTransaction: jest.fn(async () => ({
          $kind: 'FailedTransaction',
          FailedTransaction: {
            status: { success: false, error: executionError },
            effects: { status: { success: false, error: executionError } },
            events: [],
          },
          commandResults: [],
        })),
      }),
    })

    const result = await rpc.sendSimulationTransaction(new Transaction(), OWNER)

    expect(result.error?.code).toBe('SIMULATION_FAILED')
    expect(result.effects.status.success).toBe(false)
    expect(signAndExecuteTransaction).not.toHaveBeenCalled()
  })

  test('calculationTxGas uses a successful simulation and rejects failed simulations', async () => {
    const successRpc = createRpcModule({
      client: client({
        simulateTransaction: jest.fn(async () => ({
          $kind: 'Transaction',
          Transaction: {
            status: { success: true, error: null },
            effects: {
              status: { success: true, error: null },
              gasUsed: {
                computationCost: '7',
                storageCost: '5',
                storageRebate: '2',
              },
            },
            events: [],
          },
          commandResults: [],
        })),
      }),
    })
    const successTx = new Transaction()
    successTx.setSender(OWNER)

    await expect(successRpc.calculationTxGas(successTx)).resolves.toBe(10)

    const executionError = { command: 0, kind: 'MoveAbort' }
    const failedRpc = createRpcModule({
      client: client({
        simulateTransaction: jest.fn(async () => ({
          $kind: 'FailedTransaction',
          FailedTransaction: {
            status: { success: false, error: executionError },
            effects: { status: { success: false, error: executionError } },
            events: [],
          },
          commandResults: [],
        })),
      }),
    })
    const failedTx = new Transaction()
    failedTx.setSender(OWNER)

    await expect(failedRpc.calculationTxGas(failedTx)).rejects.toMatchObject({
      code: 'SIMULATION_FAILED',
    })
  })

  test('throws a typed transaction error instead of logging and returning undefined', async () => {
    const rpc = createRpcModule({
      client: client({
        signAndExecuteTransaction: jest.fn(async () => {
          throw new Error('private signer details')
        }),
      }),
    })

    await expect(rpc.sendTransaction({} as any, {} as any)).rejects.toMatchObject({
      code: 'TRANSACTION_EXECUTION_FAILED',
      message: 'transaction signing or execution failed',
    })
  })

  test('rejects a resolved failed transaction execution result', async () => {
    const rpc = createRpcModule({
      client: client({
        signAndExecuteTransaction: jest.fn(async () => ({
          $kind: 'FailedTransaction',
          FailedTransaction: {
            status: { success: false, error: { command: 0, kind: 'MoveAbort' } },
            effects: { status: { success: false, error: { command: 0, kind: 'MoveAbort' } } },
            events: [],
          },
        })),
      }),
    })

    await expect(rpc.sendTransaction({} as any, {} as any)).rejects.toMatchObject({
      code: 'TRANSACTION_EXECUTION_FAILED',
    })
    await expect(rpc.sendTransaction({} as any, {} as any)).rejects.toThrow(/execution failed/i)
  })

  test('rejects malformed transaction execution results', async () => {
    const rpc = createRpcModule({
      client: client({ signAndExecuteTransaction: jest.fn(async () => ({ $kind: 'Transaction' })) }),
    })

    await expect(rpc.sendTransaction({} as any, {} as any)).rejects.toMatchObject({
      code: 'TRANSACTION_EXECUTION_FAILED',
    })
  })

  test('rejects transaction execution results missing required status', async () => {
    const rpc = createRpcModule({
      client: client({
        signAndExecuteTransaction: jest.fn(async () => ({
          $kind: 'Transaction',
          Transaction: { effects: { status: { success: true, error: null } }, events: [] },
        })),
      }),
    })

    await expect(rpc.sendTransaction({} as any, {} as any)).rejects.toMatchObject({
      code: 'TRANSACTION_EXECUTION_FAILED',
    })
  })

  test.each([
    [
      'missing effects status',
      {
        $kind: 'Transaction',
        Transaction: {
          status: { success: true, error: null },
          effects: {},
          events: [],
        },
      },
    ],
    [
      'a success status carrying an error',
      {
        $kind: 'Transaction',
        Transaction: {
          status: { success: true, error: { message: 'contradictory error' } },
          effects: { status: { success: true, error: null } },
          events: [],
        },
      },
    ],
    [
      'a success effects status carrying an error',
      {
        $kind: 'Transaction',
        Transaction: {
          status: { success: true, error: null },
          effects: { status: { success: true, error: { message: 'contradictory error' } } },
          events: [],
        },
      },
    ],
  ])('rejects a malformed transaction execution response with %s', async (_label, response) => {
    const rpc = createRpcModule({
      client: client({
        signAndExecuteTransaction: jest.fn(async () => response),
      }),
    })

    await expect(rpc.sendTransaction({} as any, {} as any)).rejects.toMatchObject({
      code: 'TRANSACTION_EXECUTION_FAILED',
      message: 'Sui returned a malformed transaction execution response',
    })
  })

  test('validates transaction query unions while preserving confirmed failures', async () => {
    const transactionResponses = [
      {
        $kind: 'Transaction',
        Transaction: {
          status: { success: true, error: null },
          effects: { status: { success: true, error: null } },
          events: [],
        },
      },
      {
        $kind: 'FailedTransaction',
        FailedTransaction: {
          status: { success: false, error: { command: 0, kind: 'MoveAbort' } },
          effects: { status: { success: false, error: { command: 0, kind: 'MoveAbort' } } },
          events: [],
        },
      },
    ]
    const getTransaction = jest.fn(async () => transactionResponses.shift())
    const rpc = createRpcModule({ client: client({ getTransaction }) })
    const input = { digest: TX_DIGEST, options: { showEffects: true, showEvents: true } }

    await expect(rpc.getTransactionBlock(input)).resolves.toMatchObject({
      digest: TX_DIGEST,
      status: { success: true, error: null },
      effects: { status: { success: true, error: null } },
      events: [],
    })
    await expect(rpc.getTransactionBlock(input)).resolves.toMatchObject({
      digest: TX_DIGEST,
      status: { success: false },
      effects: { status: { success: false } },
      events: [],
    })
  })

  test.each([
    ['a missing union branch', { $kind: 'Transaction' }],
    [
      'a contradictory success status',
      {
        $kind: 'FailedTransaction',
        FailedTransaction: {
          status: { success: true, error: null },
          effects: { status: { success: true, error: null } },
          events: [],
        },
      },
    ],
    [
      'a missing requested effects status',
      {
        $kind: 'Transaction',
        Transaction: {
          status: { success: true, error: null },
          effects: {},
          events: [],
        },
      },
    ],
  ])('rejects malformed transaction query responses with %s', async (_label, response) => {
    const rpc = createRpcModule({
      client: client({ getTransaction: jest.fn(async () => response) }),
    })

    await expect(
      rpc.getTransactionBlock({
        digest: TX_DIGEST,
        options: { showEffects: true, showEvents: true },
      })
    ).rejects.toMatchObject({
      code: 'OBJECT_QUERY_FAILED',
      message: 'Sui returned a malformed transaction query response',
    })
  })

  test('maps both dynamic-field compatibility APIs using the v2 union identifiers', async () => {
    const response = {
      dynamicFields: [
        { $kind: 'DynamicObject', DynamicObject: {}, childId: ID },
        { $kind: 'DynamicField', DynamicField: {}, fieldId: ID_2 },
      ],
      cursor: 'next',
      hasNextPage: true,
    }
    const listDynamicFields = jest.fn(async () => response)
    const rpc = createRpcModule({ client: client({ listDynamicFields }) })

    await expect(rpc.getDynamicFieldsByPage(ID, { limit: 2 })).resolves.toMatchObject({
      data: [{ objectId: ID }, { objectId: ID_2 }],
      nextCursor: 'next',
      hasNextPage: true,
    })
    await expect(rpc.getDynamicFields({ parentId: ID, limit: 2 })).resolves.toMatchObject({
      data: [{ objectId: ID }, { objectId: ID_2 }],
      nextCursor: 'next',
      hasNextPage: true,
    })
  })

  test('maps coin metadata and paginated coin objects from gRPC responses', async () => {
    const getCoinMetadata = jest.fn(async () => ({
      coinMetadata: {
        objectId: ID,
        name: 'Sui',
        symbol: 'SUI',
        decimals: 9,
      },
    }))
    const listCoins = jest.fn(async () => ({
      objects: [{ objectId: ID_2, version: '7', digest: 'coin-digest', balance: '42' }],
      cursor: 'coin-next',
      hasNextPage: true,
    }))
    const rpc = createRpcModule({ client: client({ getCoinMetadata, listCoins }) })

    await expect(rpc.getCoinMetadata({ coinType: COIN_TYPE })).resolves.toMatchObject({
      id: ID,
      iconUrl: null,
      symbol: 'SUI',
      decimals: 9,
    })
    await expect(rpc.getCoins({ owner: OWNER, coinType: COIN_TYPE, limit: 1 })).resolves.toEqual({
      data: [
        {
          coinType: COIN_TYPE,
          coinObjectId: ID_2,
          version: '7',
          digest: 'coin-digest',
          balance: '42',
        },
      ],
      nextCursor: 'coin-next',
      hasNextPage: true,
    })
  })

  test('maps every balance and counts its coin objects without fabricating fields', async () => {
    const listBalances = jest.fn(async () => ({
      balances: [
        { coinType: COIN_TYPE, balance: '30' },
        { coinType: `${ID}::test::COIN`, balance: '12' },
      ],
      cursor: null,
      hasNextPage: false,
    }))
    const listCoins = jest.fn(async ({ coinType }: { coinType: string }) => ({
      objects: coinType === COIN_TYPE ? [{ objectId: ID }, { objectId: ID_2 }] : [{ objectId: ID }],
      cursor: null,
      hasNextPage: false,
    }))
    const rpc = createRpcModule({ client: client({ listBalances, listCoins }) })

    await expect(rpc.getAllBalances({ owner: OWNER })).resolves.toEqual([
      { coinType: COIN_TYPE, coinObjectCount: 2, totalBalance: '30' },
      { coinType: `${ID}::test::COIN`, coinObjectCount: 1, totalBalance: '12' },
    ])
  })

  test('binds native gRPC methods exposed through the full client proxy', async () => {
    const nativeClient = {
      marker: 'bound',
      getLatestCheckpointSequenceNumber() {
        return Promise.resolve(this.marker)
      },
    }
    const rpc = createRpcModule({ client: client(nativeClient) })

    await expect((rpc as any).getLatestCheckpointSequenceNumber()).resolves.toBe('bound')
  })

  test('getAllCoins uses coin APIs and returns a resumable cross-type cursor', async () => {
    const listOwnedObjects = jest.fn()
    const listBalances = jest.fn(async () => ({
      balances: [{ coinType: COIN_TYPE, balance: '30' }],
      cursor: null,
      hasNextPage: false,
    }))
    const coinPages = [
      {
        objects: [{ objectId: ID, version: '1', digest: 'a', type: `0x2::coin::Coin<${COIN_TYPE}>`, balance: '10' }],
        cursor: 'coin-next',
        hasNextPage: true,
      },
      {
        objects: [{ objectId: ID_2, version: '1', digest: 'b', type: `0x2::coin::Coin<${COIN_TYPE}>`, balance: '20' }],
        cursor: null,
        hasNextPage: false,
      },
    ]
    const listCoins = jest.fn(async () => coinPages.shift())
    const rpc = createRpcModule({ client: client({ listOwnedObjects, listBalances, listCoins }) })

    const first = await rpc.getAllCoins({ owner: OWNER, limit: 1 })
    const second = await rpc.getAllCoins({ owner: OWNER, limit: 1, cursor: first.nextCursor })

    expect(first.data[0].coinObjectId).toBe(ID)
    expect(first.hasNextPage).toBe(true)
    expect(second.data[0].coinObjectId).toBe(ID_2)
    expect(second.hasNextPage).toBe(false)
    expect(listOwnedObjects).not.toHaveBeenCalled()
  })

  test('computes coinObjectCount and omits unavailable lockedBalance', async () => {
    const coinPages = [
      { objects: [{ objectId: ID }], cursor: 'next', hasNextPage: true },
      { objects: [{ objectId: ID_2 }], cursor: null, hasNextPage: false },
    ]
    const listCoins = jest.fn(async () => coinPages.shift())
    const rpc = createRpcModule({
      client: client({
        getBalance: jest.fn(async () => ({ balance: { coinType: COIN_TYPE, balance: '30' } })),
        listCoins,
      }),
      paginationPolicy: { pageSize: 1 },
    })

    await expect(rpc.getBalance({ owner: OWNER, coinType: COIN_TYPE })).resolves.toEqual({
      coinType: COIN_TYPE,
      coinObjectCount: 2,
      totalBalance: '30',
    })
  })
})
