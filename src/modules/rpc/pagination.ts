import type { DataPage, PaginationArgs, PageQuery } from '../../types'
import { MagmaRpcError } from './errors'
import { validatePageSize, validatePositiveInteger } from './validation'
import { DEFAULT_PAGINATION_POLICY, type PaginationPolicy } from './types'

export type TransportPage<T, Cursor = any> = {
  items: T[]
  cursor: Cursor | null
  hasNextPage: boolean
}

export function resolvePaginationPolicy(overrides: Partial<PaginationPolicy> = {}): PaginationPolicy {
  return {
    maxPages: validatePositiveInteger(overrides.maxPages ?? DEFAULT_PAGINATION_POLICY.maxPages, 'paginationPolicy.maxPages', 1_000),
    maxItems: validatePositiveInteger(overrides.maxItems ?? DEFAULT_PAGINATION_POLICY.maxItems, 'paginationPolicy.maxItems', 1_000_000),
    pageSize: validatePageSize(overrides.pageSize, DEFAULT_PAGINATION_POLICY.pageSize),
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new MagmaRpcError('OPERATION_ABORTED', 'RPC pagination was aborted')
  }
}

export async function paginate<T, Cursor = any>(
  paginationArgs: PaginationArgs,
  policy: PaginationPolicy,
  fetchPage: (cursor: Cursor | null, limit: number, signal?: AbortSignal) => Promise<TransportPage<T, Cursor>>
): Promise<DataPage<T>> {
  const options: PageQuery = paginationArgs === 'all' ? { all: true } : paginationArgs
  const queryAll = paginationArgs === 'all' || options.all === true
  const pageSize = validatePageSize(options.limit, policy.pageSize)
  const maxPages = queryAll ? validatePositiveInteger(options.maxPages ?? policy.maxPages, 'maxPages', policy.maxPages) : 1
  const maxItems = queryAll ? validatePositiveInteger(options.maxItems ?? policy.maxItems, 'maxItems', policy.maxItems) : pageSize

  const data: T[] = []
  let cursor = (options.cursor ?? null) as Cursor | null
  let hasNextPage = true
  let pages = 0

  while (hasNextPage && pages < maxPages && data.length < maxItems) {
    throwIfAborted(options.signal)
    const remaining = maxItems - data.length
    const response = await fetchPage(cursor, Math.min(pageSize, remaining), options.signal)
    data.push(...response.items)
    pages += 1
    cursor = response.cursor
    hasNextPage = response.hasNextPage
    if (!queryAll) break
  }

  const truncated = queryAll && hasNextPage && (pages >= maxPages || data.length >= maxItems)
  return {
    data,
    nextCursor: cursor,
    hasNextPage,
    truncated: truncated || undefined,
  }
}
