import type { SuiClientTypes } from '@mysten/sui/client'
import type { SuiGrpcClient } from '@mysten/sui/grpc'
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc'

export type RpcNetwork = 'mainnet' | 'testnet'

export type EndpointPolicy = {
  /** Optional hostname allowlist for backend deployments. */
  allowedHosts?: string[]
  /** Allow http://localhost or loopback endpoints for local development. */
  allowInsecureLocalhost?: boolean
}

export type PaginationPolicy = {
  /** Maximum pages fetched by APIs called with paginationArgs='all'. */
  maxPages: number
  /** Maximum items accumulated by APIs called with paginationArgs='all'. */
  maxItems: number
  /** Page size requested from Sui APIs. */
  pageSize: number
}

export const DEFAULT_PAGINATION_POLICY: PaginationPolicy = {
  maxPages: 100,
  maxItems: 10_000,
  pageSize: 100,
}

export type EventDecoder = {
  decode(event: SuiClientTypes.Event): Promise<Record<string, unknown>>
}

export type RpcModuleOptions = {
  /** Existing gRPC client supplied by the application. */
  client?: SuiGrpcClient
  /** gRPC fullnode URL. Required when client is not supplied. */
  url?: string
  network?: RpcNetwork
  /** Optional JSON-RPC fallback used only by APIs that gRPC does not expose, such as queryEvents. */
  jsonRpcClient?: SuiJsonRpcClient
  jsonRpcUrl?: string
  endpointPolicy?: EndpointPolicy
  paginationPolicy?: Partial<PaginationPolicy>
  /** Optional decoder override for testing or preloaded Move schemas. */
  eventDecoder?: EventDecoder
}

export type LegacyDynamicFieldName = {
  type: string
  value: unknown
}

export type LegacyEvent = {
  packageId: string
  module: string
  sender: string
  type: string
  /** BCS-decoded Move event fields. */
  parsedBcs: Record<string, unknown> | null
  /** @deprecated Compatibility alias. Simulation events use the BCS-decoded value. */
  parsedJson: Record<string, unknown> | null
  bcs: Uint8Array
  /** Native Sui v2 event type. */
  eventType: string
  /** Native Sui v2 JSON representation. */
  json: Record<string, unknown> | null
}

export type LegacySimulationResult = {
  effects?: any
  events: LegacyEvent[]
  results?: any
  error: { code: 'SIMULATION_FAILED'; message: string } | null
}

export type LegacyTransactionResult = {
  digest?: string
  effects?: any
  events?: LegacyEvent[]
  balanceChanges?: any
  [key: string]: unknown
}
