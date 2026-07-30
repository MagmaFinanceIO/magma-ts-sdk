export type RpcErrorCode =
  | 'INVALID_ARGUMENT'
  | 'INVALID_ENDPOINT'
  | 'PAGINATION_LIMIT_EXCEEDED'
  | 'OPERATION_ABORTED'
  | 'RPC_TRANSPORT_ERROR'
  | 'OBJECT_QUERY_FAILED'
  | 'TRANSACTION_EXECUTION_FAILED'
  | 'SIMULATION_FAILED'
  | 'UNSUPPORTED_OPERATION'

/** Stable SDK error that does not expose raw transport details in its public message. */
export class MagmaRpcError extends Error {
  readonly code: RpcErrorCode

  constructor(code: RpcErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'MagmaRpcError'
    this.code = code
  }
}

export function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /not[ -]?found|does not exist|could not find/i.test(error.message)
}

export function toTransportError(operation: string, cause: unknown): MagmaRpcError {
  return new MagmaRpcError('RPC_TRANSPORT_ERROR', `${operation} failed because the Sui transport was unavailable`, { cause })
}
