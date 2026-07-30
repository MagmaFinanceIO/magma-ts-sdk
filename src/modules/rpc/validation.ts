import {
  isValidStructTag,
  isValidSuiAddress,
  isValidSuiObjectId,
  isValidTransactionDigest,
  normalizeSuiAddress,
  normalizeSuiObjectId,
} from '@mysten/sui/utils'
import { MagmaRpcError } from './errors'
import type { EndpointPolicy } from './types'

const MAX_PAGE_SIZE = 1_000

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host.startsWith('127.')
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (isLoopbackHostname(host)) return true
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return true

  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }

  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 0
  )
}

export function validateEndpoint(endpoint: string, policy: EndpointPolicy = {}): string {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch (cause) {
    throw new MagmaRpcError('INVALID_ENDPOINT', 'RPC endpoint must be a valid absolute URL', { cause })
  }

  if (url.username || url.password) {
    throw new MagmaRpcError('INVALID_ENDPOINT', 'RPC endpoint must not contain credentials')
  }

  const isPrivateOrLocal = isPrivateOrLocalHostname(url.hostname)
  const insecureLocalAllowed = policy.allowInsecureLocalhost === true && isLoopbackHostname(url.hostname)
  if (isPrivateOrLocal && !insecureLocalAllowed) {
    throw new MagmaRpcError('INVALID_ENDPOINT', 'Private and loopback RPC endpoints are disabled')
  }

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && insecureLocalAllowed)) {
    throw new MagmaRpcError('INVALID_ENDPOINT', 'RPC endpoint must use HTTPS')
  }

  if (policy.allowedHosts?.length) {
    const allowed = new Set(policy.allowedHosts.map((host) => host.toLowerCase()))
    if (!allowed.has(url.hostname.toLowerCase())) {
      throw new MagmaRpcError('INVALID_ENDPOINT', 'RPC endpoint hostname is not allowed')
    }
  }

  return url.toString()
}

export function validateSuiAddress(address: string, label = 'address'): string {
  if (typeof address !== 'string' || !isValidSuiAddress(address)) {
    throw new MagmaRpcError('INVALID_ARGUMENT', `${label} must be a valid Sui address`)
  }
  return normalizeSuiAddress(address)
}

export function validateSuiObjectId(objectId: string, label = 'objectId'): string {
  if (typeof objectId !== 'string' || !isValidSuiObjectId(objectId)) {
    throw new MagmaRpcError('INVALID_ARGUMENT', `${label} must be a valid Sui object ID`)
  }
  return normalizeSuiObjectId(objectId)
}

export function validateCoinType(coinType: string): string {
  if (typeof coinType !== 'string' || coinType.length > 1_024 || !isValidStructTag(coinType)) {
    throw new MagmaRpcError('INVALID_ARGUMENT', 'coinType must be a valid Sui struct tag')
  }
  return coinType
}

export function validateTransactionDigest(digest: string): string {
  if (typeof digest !== 'string' || !isValidTransactionDigest(digest)) {
    throw new MagmaRpcError('INVALID_ARGUMENT', 'digest must be a valid Sui transaction digest')
  }
  return digest
}

export function validatePageSize(limit: number | null | undefined, fallback: number): number {
  const value = limit ?? fallback
  if (!Number.isInteger(value) || value <= 0 || value > MAX_PAGE_SIZE) {
    throw new MagmaRpcError('INVALID_ARGUMENT', `pagination limit must be an integer between 1 and ${MAX_PAGE_SIZE}`)
  }
  return value
}

export function validatePositiveInteger(value: number, label: string, maximum: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new MagmaRpcError('INVALID_ARGUMENT', `${label} must be an integer between 1 and ${maximum}`)
  }
  return value
}
