import { SuiGrpcClient } from '@mysten/sui/grpc'
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import type { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1'
import type {
  PaginatedEvents,
  SuiEventFilter,
  SuiJsonRpcClient,
  SuiObjectDataOptions,
  SuiObjectResponse,
  SuiObjectResponseQuery,
} from '@mysten/sui/jsonRpc'
import type { Transaction } from '@mysten/sui/transactions'
import type { DataPage, PaginationArgs, SuiObjectIdType } from '../types'
import { createRpcClients } from './rpc/clientFactory'
import { RpcCoinAdapter } from './rpc/coinAdapter'
import { deriveLegacyDynamicFieldId } from './rpc/dynamicFieldAdapter'
import { MagmaRpcError, isNotFoundError, toTransportError } from './rpc/errors'
import { MoveBcsEventDecoder } from './rpc/moveBcsDecoder'
import { objectInclude, toLegacyEvent, toLegacyObjectResponse } from './rpc/objectAdapter'
import { paginate, resolvePaginationPolicy } from './rpc/pagination'
import { toLegacySimulationResult } from './rpc/simulationAdapter'
import type {
  EventDecoder,
  LegacyDynamicFieldName,
  LegacySimulationResult,
  LegacyTransactionResult,
  PaginationPolicy,
  RpcModuleOptions,
} from './rpc/types'
import { validatePageSize, validateSuiAddress, validateSuiObjectId, validateTransactionDigest } from './rpc/validation'

export type { RpcModuleOptions, RpcNetwork } from './rpc/types'
export { MagmaRpcError } from './rpc/errors'

export type FullRpcClient = RpcModule & SuiGrpcClient

function requireTransactionResult(
  result: unknown,
  options: {
    code: 'OBJECT_QUERY_FAILED' | 'TRANSACTION_EXECUTION_FAILED'
    malformedMessage: string
    requireEffects: boolean
    requireEvents: boolean
  }
): any {
  const response = result as any
  const hasTransaction = response?.Transaction != null
  const hasFailedTransaction = response?.FailedTransaction != null
  const kind = typeof response?.$kind === 'string' ? response.$kind : undefined

  if (kind == null) {
    throw new MagmaRpcError(options.code, options.malformedMessage)
  }
  if (hasTransaction === hasFailedTransaction) {
    throw new MagmaRpcError(options.code, options.malformedMessage)
  }
  if (kind !== 'Transaction' && kind !== 'FailedTransaction') {
    throw new MagmaRpcError(options.code, options.malformedMessage)
  }
  if (kind === 'Transaction' && !hasTransaction) {
    throw new MagmaRpcError(options.code, options.malformedMessage)
  }
  if (kind === 'FailedTransaction' && !hasFailedTransaction) {
    throw new MagmaRpcError(options.code, options.malformedMessage)
  }

  const transaction = hasTransaction ? response.Transaction : response.FailedTransaction
  const expectedSuccess = !hasFailedTransaction
  const statusSucceeded = transaction?.status?.success
  if (typeof statusSucceeded !== 'boolean' || statusSucceeded !== expectedSuccess) {
    throw new MagmaRpcError(options.code, options.malformedMessage)
  }
  if ((statusSucceeded && transaction.status.error != null) || (!statusSucceeded && transaction.status.error == null)) {
    throw new MagmaRpcError(options.code, options.malformedMessage)
  }

  if (options.requireEffects || transaction.effects != null) {
    const effectsSucceeded = transaction?.effects?.status?.success
    if (typeof effectsSucceeded !== 'boolean' || effectsSucceeded !== statusSucceeded) {
      throw new MagmaRpcError(options.code, options.malformedMessage)
    }
    if ((effectsSucceeded && transaction.effects.status.error != null) || (!effectsSucceeded && transaction.effects.status.error == null)) {
      throw new MagmaRpcError(options.code, options.malformedMessage)
    }
  }

  if ((options.requireEvents || transaction.events != null) && !Array.isArray(transaction.events)) {
    throw new MagmaRpcError(options.code, options.malformedMessage)
  }

  return transaction
}

function requireSuccessfulTransactionResult(result: unknown): any {
  const transaction = requireTransactionResult(result, {
    code: 'TRANSACTION_EXECUTION_FAILED',
    malformedMessage: 'Sui returned a malformed transaction execution response',
    requireEffects: true,
    requireEvents: true,
  })
  const response = result as any
  const hasFailedTransaction = response?.FailedTransaction != null
  if (hasFailedTransaction) {
    throw new MagmaRpcError('TRANSACTION_EXECUTION_FAILED', 'transaction signing or execution failed')
  }

  return transaction
}

/**
 * Sui v2 gRPC-backed client with the pagination and compatibility helpers used by
 * the Magma modules. JSON-RPC is optional and is consulted only for APIs that do
 * not exist in gRPC (currently queryEventsByPage).
 */
export class RpcModule {
  public readonly _client: SuiGrpcClient

  public readonly _jsonRpcClient?: SuiJsonRpcClient

  private readonly paginationPolicy: PaginationPolicy

  private readonly coinAdapter: RpcCoinAdapter

  private readonly eventDecoder: EventDecoder

  constructor(options: RpcModuleOptions) {
    const clients = createRpcClients(options)
    this._client = clients.grpcClient
    this._jsonRpcClient = clients.jsonRpcClient
    this.paginationPolicy = resolvePaginationPolicy(options.paginationPolicy)
    this.coinAdapter = new RpcCoinAdapter(this._client, this.paginationPolicy)
    this.eventDecoder = options.eventDecoder ?? new MoveBcsEventDecoder(this._client)
  }

  get suiGrpcClient(): SuiGrpcClient {
    return this._client
  }

  /** @deprecated gRPC has no queryEvents API. Prefer an indexer or GraphQL integration. */
  async queryEventsByPage(query: SuiEventFilter, paginationArgs: PaginationArgs = 'all'): Promise<DataPage<any>> {
    if (!this._jsonRpcClient) {
      throw new MagmaRpcError('UNSUPPORTED_OPERATION', 'queryEventsByPage requires an explicit jsonRpcClient or jsonRpcUrl')
    }

    return paginate<any, any>(paginationArgs, this.paginationPolicy, async (cursor, limit) => {
      let response: PaginatedEvents
      try {
        response = await this._jsonRpcClient!.queryEvents({ query, cursor, limit })
      } catch (cause) {
        throw toTransportError('queryEventsByPage', cause)
      }
      return { items: response.data, cursor: response.nextCursor, hasNextPage: response.hasNextPage }
    })
  }

  async getOwnedObjectsByPage(
    owner: string,
    query: SuiObjectResponseQuery,
    paginationArgs: PaginationArgs = 'all'
  ): Promise<DataPage<SuiObjectResponse>> {
    const normalizedOwner = validateSuiAddress(owner, 'owner')
    const filter = query.filter as any
    const type = filter?.StructType ?? filter?.MatchAll?.find?.((item: any) => item.StructType)?.StructType

    return paginate<SuiObjectResponse, string>(paginationArgs, this.paginationPolicy, async (cursor, limit, signal) => {
      try {
        const response = await this._client.listOwnedObjects({
          owner: normalizedOwner,
          type,
          cursor: cursor ?? undefined,
          limit,
          include: objectInclude(query.options ?? undefined),
          signal,
        })
        return {
          items: response.objects.map((item) => toLegacyObjectResponse(item)),
          cursor: response.cursor,
          hasNextPage: response.hasNextPage,
        }
      } catch (cause) {
        throw toTransportError('getOwnedObjectsByPage', cause)
      }
    })
  }

  async getDynamicFieldsByPage(parentId: SuiObjectIdType, paginationArgs: PaginationArgs = 'all'): Promise<DataPage<any>> {
    const normalizedParentId = validateSuiObjectId(parentId, 'parentId')
    return paginate<any, string>(paginationArgs, this.paginationPolicy, async (cursor, limit, signal) => {
      try {
        const response = await this._client.listDynamicFields({
          parentId: normalizedParentId,
          cursor: cursor ?? undefined,
          limit,
          signal,
        })
        return {
          items: response.dynamicFields.map((item) => ({
            ...item,
            objectId: item.$kind === 'DynamicObject' ? item.childId : item.fieldId,
          })),
          cursor: response.cursor,
          hasNextPage: response.hasNextPage,
        }
      } catch (cause) {
        throw toTransportError('getDynamicFieldsByPage', cause)
      }
    })
  }

  async batchGetObjects(ids: SuiObjectIdType[], options?: SuiObjectDataOptions, limit = 50): Promise<SuiObjectResponse[]> {
    if (!Array.isArray(ids)) {
      throw new MagmaRpcError('INVALID_ARGUMENT', 'ids must be an array of Sui object IDs')
    }
    if (ids.length > this.paginationPolicy.maxItems) {
      throw new MagmaRpcError('PAGINATION_LIMIT_EXCEEDED', 'object batch exceeds the configured maxItems limit')
    }
    const batchSize = validatePageSize(limit, 50)
    const normalizedIds = ids.map((id) => validateSuiObjectId(id))
    const objectDataResponses: SuiObjectResponse[] = []
    for (let i = 0; i < normalizedIds.length; i += batchSize) {
      const batchIds = normalizedIds.slice(i, i + batchSize)
      try {
        const response = await this._client.getObjects({
          objectIds: batchIds,
          include: objectInclude(options),
        })
        response.objects.forEach((item, index) => {
          objectDataResponses.push(toLegacyObjectResponse(item, batchIds[index]))
        })
      } catch (cause) {
        throw toTransportError('batchGetObjects', cause)
      }
    }
    return objectDataResponses
  }

  async getObject(input: any): Promise<any> {
    if (input?.objectId) {
      return this._client.getObject({ ...input, objectId: validateSuiObjectId(input.objectId) })
    }
    const objectId = validateSuiObjectId(input?.id)
    try {
      const response = await this._client.getObject({
        objectId,
        include: objectInclude(input.options),
      })
      return toLegacyObjectResponse(response.object)
    } catch (cause) {
      if (isNotFoundError(cause)) {
        return { error: { code: 'notExists', object_id: objectId } }
      }
      throw toTransportError('getObject', cause)
    }
  }

  async multiGetObjects(input: { ids: string[]; options?: SuiObjectDataOptions }): Promise<SuiObjectResponse[]> {
    return this.batchGetObjects(input.ids, input.options)
  }

  /** @deprecated Use native listDynamicFields. */
  async getDynamicFields(input: { parentId: string; cursor?: string | null; limit?: number | null }): Promise<any> {
    const parentId = validateSuiObjectId(input.parentId, 'parentId')
    const limit = validatePageSize(input.limit, this.paginationPolicy.pageSize)
    try {
      const response = await this._client.listDynamicFields({
        parentId,
        cursor: input.cursor ?? undefined,
        limit,
      })
      return {
        data: response.dynamicFields.map((item) => ({
          ...item,
          objectId: item.$kind === 'DynamicObject' ? item.childId : item.fieldId,
        })),
        nextCursor: response.cursor,
        hasNextPage: response.hasNextPage,
      }
    } catch (cause) {
      throw toTransportError('getDynamicFields', cause)
    }
  }

  /** @deprecated Use native getDynamicField with a BCS-encoded name. */
  async getDynamicFieldObject(input: { parentId: string; name: LegacyDynamicFieldName }): Promise<SuiObjectResponse> {
    const fieldId = deriveLegacyDynamicFieldId(input.parentId, input.name)
    return this.getObject({ id: fieldId, options: { showContent: true, showType: true, showOwner: true } })
  }

  /** @deprecated Compatibility alias backed by Sui v2 simulateTransaction. */
  async devInspectTransactionBlock(input: { transactionBlock: Transaction; sender: string }): Promise<LegacySimulationResult> {
    input.transactionBlock.setSender(validateSuiAddress(input.sender, 'sender'))
    try {
      const result = await this._client.simulateTransaction({
        transaction: input.transactionBlock,
        include: { effects: true, events: true, commandResults: true },
      })
      return await toLegacySimulationResult(result, this.eventDecoder)
    } catch (cause) {
      if (cause instanceof MagmaRpcError) throw cause
      throw toTransportError('simulateTransaction', cause)
    }
  }

  async calculationTxGas(tx: Transaction): Promise<number> {
    const sender = (tx.getData() as any)?.sender
    if (!sender) {
      throw new MagmaRpcError('INVALID_ARGUMENT', 'transaction sender is required for gas calculation')
    }
    const devResult = await this.devInspectTransactionBlock({ transactionBlock: tx, sender })
    const effects = devResult.effects as any
    if (devResult.error || !effects?.gasUsed) {
      throw new MagmaRpcError('SIMULATION_FAILED', 'transaction simulation did not return gas usage')
    }
    const { gasUsed } = effects
    return Number(gasUsed.computationCost) + Number(gasUsed.storageCost) - Number(gasUsed.storageRebate)
  }

  async sendTransaction(keypair: Ed25519Keypair | Secp256k1Keypair, tx: Transaction): Promise<LegacyTransactionResult> {
    try {
      const result = await this._client.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        include: { effects: true, events: true },
      })
      const transaction = requireSuccessfulTransactionResult(result)
      return {
        ...transaction,
        effects: transaction?.effects,
        events: transaction?.events?.map(toLegacyEvent),
        balanceChanges: transaction?.balanceChanges,
      }
    } catch (cause) {
      if (cause instanceof MagmaRpcError) throw cause
      throw new MagmaRpcError('TRANSACTION_EXECUTION_FAILED', 'transaction signing or execution failed', { cause })
    }
  }

  async sendSimulationTransaction(tx: Transaction, simulationAccount: string): Promise<LegacySimulationResult> {
    return this.devInspectTransactionBlock({ transactionBlock: tx, sender: simulationAccount })
  }

  /** @deprecated Use native getTransaction. */
  async getTransactionBlock(input: any): Promise<any> {
    try {
      const result = await this._client.getTransaction({
        digest: validateTransactionDigest(input.digest),
        include: {
          effects: Boolean(input.options?.showEffects),
          events: Boolean(input.options?.showEvents),
          balanceChanges: Boolean(input.options?.showBalanceChanges),
          objectTypes: Boolean(input.options?.showObjectChanges),
          transaction: Boolean(input.options?.showInput),
        },
      })
      const transaction = requireTransactionResult(result, {
        code: 'OBJECT_QUERY_FAILED',
        malformedMessage: 'Sui returned a malformed transaction query response',
        requireEffects: Boolean(input.options?.showEffects),
        requireEvents: Boolean(input.options?.showEvents),
      })
      return {
        ...transaction,
        digest: input.digest,
        events: transaction?.events?.map(toLegacyEvent),
        effects: transaction?.effects,
        balanceChanges: transaction?.balanceChanges,
      }
    } catch (cause) {
      if (cause instanceof MagmaRpcError) throw cause
      throw toTransportError('getTransactionBlock', cause)
    }
  }

  async getCoinMetadata(input: { coinType: string }): Promise<any> {
    return this.coinAdapter.getCoinMetadata(input)
  }

  async getCoins(input: { owner: string; coinType: string; cursor?: string | null; limit?: number }): Promise<any> {
    return this.coinAdapter.getCoins(input)
  }

  /** @deprecated Prefer listBalances plus listCoins for the required coin type. */
  async getAllCoins(input: { owner: string; cursor?: string | null; limit?: number }): Promise<any> {
    return this.coinAdapter.getAllCoins(input)
  }

  async getBalance(input: { owner: string; coinType?: string }): Promise<any> {
    return this.coinAdapter.getBalance(input)
  }

  async getAllBalances(input: { owner: string }): Promise<any[]> {
    return this.coinAdapter.getAllBalances(input)
  }
}

/** Create a FullClient that exposes Magma helpers and all native SuiGrpcClient methods. */
export function createRpcModule(options: RpcModuleOptions): FullRpcClient {
  const rpcModule = new RpcModule(options)
  return new Proxy(rpcModule, {
    get(target, prop, receiver) {
      if (prop in target) {
        return Reflect.get(target, prop, receiver)
      }
      if (prop in target._client) {
        const value = Reflect.get(target._client, prop)
        return typeof value === 'function' ? value.bind(target._client) : value
      }
      return undefined
    },
  }) as FullRpcClient
}
