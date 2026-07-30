import type { SuiClientTypes } from '@mysten/sui/client'
import type { SuiGrpcClient } from '@mysten/sui/grpc'
import { MagmaRpcError, toTransportError } from './errors'
import { paginate } from './pagination'
import type { PaginationPolicy } from './types'
import { validateCoinType, validatePageSize, validateSuiAddress } from './validation'

type AllCoinsCursor = { typeIndex: number; coinCursor: string | null }
const CURSOR_PREFIX = 'magma-all-coins:'

function coinTypeFromObjectType(type: string): string {
  const start = type.indexOf('<')
  const end = type.lastIndexOf('>')
  return start >= 0 && end > start ? type.slice(start + 1, end) : type
}

function encodeCursor(cursor: AllCoinsCursor): string {
  return `${CURSOR_PREFIX}${encodeURIComponent(JSON.stringify(cursor))}`
}

function decodeCursor(cursor?: string | null): AllCoinsCursor {
  if (!cursor) return { typeIndex: 0, coinCursor: null }
  if (!cursor.startsWith(CURSOR_PREFIX)) {
    throw new MagmaRpcError('INVALID_ARGUMENT', 'getAllCoins cursor is invalid')
  }
  try {
    const value = JSON.parse(decodeURIComponent(cursor.slice(CURSOR_PREFIX.length))) as AllCoinsCursor
    if (!Number.isInteger(value.typeIndex) || value.typeIndex < 0 || (value.coinCursor !== null && typeof value.coinCursor !== 'string')) {
      throw new Error('invalid cursor shape')
    }
    return value
  } catch (cause) {
    throw new MagmaRpcError('INVALID_ARGUMENT', 'getAllCoins cursor is invalid', { cause })
  }
}

export class RpcCoinAdapter {
  private readonly client: SuiGrpcClient

  private readonly paginationPolicy: PaginationPolicy

  constructor(client: SuiGrpcClient, paginationPolicy: PaginationPolicy) {
    this.client = client
    this.paginationPolicy = paginationPolicy
  }

  async getCoinMetadata(input: { coinType: string }): Promise<any> {
    try {
      const response = await this.client.getCoinMetadata({ coinType: validateCoinType(input.coinType) })
      const metadata = response.coinMetadata
      if (!metadata) return null
      return {
        ...metadata,
        id: (metadata as any).objectId ?? (metadata as any).id ?? null,
        iconUrl: (metadata as any).iconUrl ?? null,
      }
    } catch (cause) {
      if (cause instanceof MagmaRpcError) throw cause
      throw toTransportError('getCoinMetadata', cause)
    }
  }

  async getCoins(input: { owner: string; coinType: string; cursor?: string | null; limit?: number }): Promise<any> {
    const owner = validateSuiAddress(input.owner, 'owner')
    const coinType = validateCoinType(input.coinType)
    const limit = validatePageSize(input.limit, this.paginationPolicy.pageSize)
    try {
      const response = await this.client.listCoins({
        owner,
        coinType,
        cursor: input.cursor ?? undefined,
        limit,
      })
      return {
        data: response.objects.map((coin) => ({
          coinType,
          coinObjectId: coin.objectId,
          version: coin.version,
          digest: coin.digest,
          balance: coin.balance,
        })),
        nextCursor: response.cursor,
        hasNextPage: response.hasNextPage,
      }
    } catch (cause) {
      if (cause instanceof MagmaRpcError) throw cause
      throw toTransportError('getCoins', cause)
    }
  }

  /**
   * Sui v2 has no all-coin-objects method. Resolve balance coin types first and
   * paginate listCoins with a resumable cross-type cursor.
   */
  async getAllCoins(input: { owner: string; cursor?: string | null; limit?: number }): Promise<any> {
    const owner = validateSuiAddress(input.owner, 'owner')
    const limit = validatePageSize(input.limit, this.paginationPolicy.pageSize)
    const balances = await paginate<any, string>(
      { all: true, maxItems: Math.min(this.paginationPolicy.maxItems, 1_000) },
      this.paginationPolicy,
      async (cursor, pageLimit, signal) => {
        try {
          const response = await this.client.listBalances({
            owner,
            cursor: cursor ?? undefined,
            limit: pageLimit,
            signal,
          })
          return { items: response.balances, cursor: response.cursor, hasNextPage: response.hasNextPage }
        } catch (cause) {
          throw toTransportError('getAllCoins.listBalances', cause)
        }
      }
    )
    if (balances.truncated) {
      throw new MagmaRpcError('PAGINATION_LIMIT_EXCEEDED', 'coin type count exceeds the configured safety limit')
    }

    const data: any[] = []
    let { typeIndex, coinCursor } = decodeCursor(input.cursor)
    while (typeIndex < balances.data.length && data.length < limit) {
      const { coinType } = balances.data[typeIndex]
      let response: SuiClientTypes.ListCoinsResponse
      try {
        response = await this.client.listCoins({
          owner,
          coinType,
          cursor: coinCursor ?? undefined,
          limit: limit - data.length,
        })
      } catch (cause) {
        throw toTransportError('getAllCoins.listCoins', cause)
      }
      data.push(
        ...response.objects.map((coin) => ({
          coinType: coinTypeFromObjectType(coin.type),
          coinObjectId: coin.objectId,
          version: coin.version,
          digest: coin.digest,
          balance: coin.balance,
        }))
      )
      if (response.hasNextPage) {
        coinCursor = response.cursor
        break
      }
      typeIndex += 1
      coinCursor = null
    }

    const hasNextPage = typeIndex < balances.data.length
    return {
      data,
      nextCursor: hasNextPage ? encodeCursor({ typeIndex, coinCursor }) : null,
      hasNextPage,
    }
  }

  private async countCoinObjects(owner: string, coinType: string): Promise<number> {
    const result = await paginate<any, string>('all', this.paginationPolicy, async (cursor, limit, signal) => {
      try {
        const response = await this.client.listCoins({
          owner,
          coinType,
          cursor: cursor ?? undefined,
          limit,
          signal,
        })
        return { items: response.objects, cursor: response.cursor, hasNextPage: response.hasNextPage }
      } catch (cause) {
        throw toTransportError('countCoinObjects', cause)
      }
    })
    if (result.truncated) {
      throw new MagmaRpcError('PAGINATION_LIMIT_EXCEEDED', 'coin object count exceeds the configured safety limit')
    }
    return result.data.length
  }

  async getBalance(input: { owner: string; coinType?: string }): Promise<any> {
    const owner = validateSuiAddress(input.owner, 'owner')
    try {
      const response = await this.client.getBalance({
        owner,
        coinType: input.coinType === undefined ? undefined : validateCoinType(input.coinType),
      })
      return {
        coinType: response.balance.coinType,
        coinObjectCount: await this.countCoinObjects(owner, response.balance.coinType),
        totalBalance: response.balance.balance,
      }
    } catch (cause) {
      if (cause instanceof MagmaRpcError) throw cause
      throw toTransportError('getBalance', cause)
    }
  }

  async getAllBalances(input: { owner: string }): Promise<any[]> {
    const owner = validateSuiAddress(input.owner, 'owner')
    const result = await paginate<any, string>('all', this.paginationPolicy, async (cursor, limit, signal) => {
      try {
        const response = await this.client.listBalances({ owner, cursor: cursor ?? undefined, limit, signal })
        return { items: response.balances, cursor: response.cursor, hasNextPage: response.hasNextPage }
      } catch (cause) {
        throw toTransportError('getAllBalances', cause)
      }
    })
    if (result.truncated) {
      throw new MagmaRpcError('PAGINATION_LIMIT_EXCEEDED', 'balance count exceeds the configured safety limit')
    }

    const balances: any[] = []
    for (const balance of result.data) {
      balances.push({
        coinType: balance.coinType,
        coinObjectCount: await this.countCoinObjects(owner, balance.coinType),
        totalBalance: balance.balance,
      })
    }
    return balances
  }
}
