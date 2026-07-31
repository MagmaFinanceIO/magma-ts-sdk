import type { SuiClientTypes } from '@mysten/sui/client'
import type { SuiObjectDataOptions, SuiObjectResponse } from '@mysten/sui/jsonRpc'
import { MagmaRpcError, isNotFoundError } from './errors'
import type { LegacyEvent } from './types'

export function objectInclude(options?: SuiObjectDataOptions): SuiClientTypes.ObjectInclude {
  return {
    content: Boolean(options?.showBcs),
    json: Boolean(options?.showContent),
    display: Boolean(options?.showDisplay),
    previousTransaction: Boolean(options?.showPreviousTransaction),
  }
}

function assertCoreObject(object: SuiClientTypes.Object): void {
  if (!object.objectId || !object.type || !object.version || !object.digest || !object.owner) {
    throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'Sui returned an invalid object response')
  }
}

export function toLegacyObjectResponse(object: SuiClientTypes.Object | Error, requestedObjectId = ''): SuiObjectResponse {
  if (object instanceof Error) {
    return {
      error: isNotFoundError(object) ? { code: 'notExists', object_id: requestedObjectId } : { code: 'unknown' },
    }
  }

  assertCoreObject(object)
  const data = object as any
  const display =
    data.display === undefined
      ? undefined
      : {
          data: data.display?.output ?? null,
          error: data.display?.errors ? 'Display rendering failed' : null,
        }

  return {
    data: {
      objectId: data.objectId,
      version: data.version,
      digest: data.digest,
      type: data.type,
      owner: data.owner,
      previousTransaction: data.previousTransaction,
      display,
      content:
        data.json === undefined || data.json === null
          ? undefined
          : {
              dataType: 'moveObject',
              type: data.type,
              fields: data.json,
            },
      bcs:
        data.objectBcs === undefined
          ? undefined
          : {
              dataType: 'moveObject',
              type: data.type,
              version: data.version,
              bcsBytes: Buffer.from(data.objectBcs).toString('base64'),
            },
    },
  } as SuiObjectResponse
}

/** @deprecated Migrate consumers to the native Sui v2 Event shape and BCS parsing. */
export function toLegacyEvent(event: SuiClientTypes.Event, parsedBcs: Record<string, unknown> | null = null): LegacyEvent {
  if (!event.eventType || !(event.bcs instanceof Uint8Array)) {
    throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'Sui returned an invalid event response')
  }
  return {
    ...event,
    type: event.eventType,
    parsedBcs,
    parsedJson: parsedBcs ?? event.json,
  }
}
