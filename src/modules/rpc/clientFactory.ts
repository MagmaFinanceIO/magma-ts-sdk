import { SuiGrpcClient } from '@mysten/sui/grpc'
import { SuiJsonRpcClient, type SuiJsonRpcClientOptions } from '@mysten/sui/jsonRpc'
import { MagmaRpcError } from './errors'
import type { RpcModuleOptions } from './types'
import { validateEndpoint } from './validation'

export type CreatedRpcClients = {
  grpcClient: SuiGrpcClient
  jsonRpcClient?: SuiJsonRpcClient
}

export function createRpcClients(options: RpcModuleOptions): CreatedRpcClients {
  const network = options.network ?? 'mainnet'
  if (!options.client && !options.url) {
    throw new MagmaRpcError('INVALID_ARGUMENT', 'suiGrpcClient or fullRpcUrl is required')
  }

  const grpcClient =
    options.client ??
    new SuiGrpcClient({
      baseUrl: validateEndpoint(options.url!, options.endpointPolicy),
      network,
    })

  const jsonRpcClient =
    options.jsonRpcClient ??
    (options.jsonRpcUrl
      ? new SuiJsonRpcClient({
          url: validateEndpoint(options.jsonRpcUrl, options.endpointPolicy),
          network,
        } as SuiJsonRpcClientOptions)
      : undefined)

  return { grpcClient, jsonRpcClient }
}
