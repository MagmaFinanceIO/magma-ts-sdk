import type { SuiClientTypes } from '@mysten/sui/client'
import { MagmaRpcError } from './errors'
import { toLegacyEvent } from './objectAdapter'
import type { EventDecoder, LegacySimulationResult } from './types'

type SimulationVariant = {
  transaction: any
  failed: boolean
}

function assertSimulationVariant(result: SuiClientTypes.SimulateTransactionResult<any>): SimulationVariant {
  const response = result as any
  const hasTransaction = response.Transaction != null
  const hasFailedTransaction = response.FailedTransaction != null
  const kind = typeof response.$kind === 'string' ? response.$kind : undefined

  if (kind == null) {
    throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'Sui returned a malformed simulation response')
  }
  if (hasTransaction === hasFailedTransaction) {
    throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'Sui returned a malformed simulation response')
  }
  if (kind !== 'Transaction' && kind !== 'FailedTransaction') {
    throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'Sui returned a malformed simulation response')
  }
  if (kind === 'Transaction' && !hasTransaction) {
    throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'Sui returned a malformed simulation response')
  }
  if (kind === 'FailedTransaction' && !hasFailedTransaction) {
    throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'Sui returned a malformed simulation response')
  }

  const transaction = hasTransaction ? response.Transaction : response.FailedTransaction
  const expectedSuccess = !hasFailedTransaction
  const statusSucceeded = transaction?.status?.success
  if (typeof statusSucceeded !== 'boolean' || statusSucceeded !== expectedSuccess) {
    throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'Sui returned a malformed simulation response')
  }
  if ((statusSucceeded && transaction.status.error != null) || (!statusSucceeded && transaction.status.error == null)) {
    throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'Sui returned a malformed simulation response')
  }
  const effectsSucceeded = transaction?.effects?.status?.success
  if (typeof effectsSucceeded !== 'boolean' || effectsSucceeded !== statusSucceeded) {
    throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'Sui returned a malformed simulation response')
  }
  if ((effectsSucceeded && transaction.effects.status.error != null) || (!effectsSucceeded && transaction.effects.status.error == null)) {
    throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'Sui returned a malformed simulation response')
  }
  if (!Array.isArray(transaction.events) || !Array.isArray(response.commandResults)) {
    throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'Sui returned a malformed simulation response')
  }

  return { transaction, failed: hasFailedTransaction }
}

function sanitizeFailedEffects(effects: any): any {
  return {
    ...effects,
    status: {
      ...effects.status,
      error: null,
    },
  }
}

export async function toLegacySimulationResult(
  result: SuiClientTypes.SimulateTransactionResult<any>,
  decoder: EventDecoder
): Promise<LegacySimulationResult> {
  const { transaction, failed } = assertSimulationVariant(result)
  const events = failed
    ? transaction.events.map((event: SuiClientTypes.Event) => toLegacyEvent(event))
    : await Promise.all(
        transaction.events.map(async (event: SuiClientTypes.Event) => {
          let parsedBcs: Record<string, unknown>
          try {
            parsedBcs = await decoder.decode(event)
          } catch (cause) {
            if (cause instanceof MagmaRpcError) throw cause
            throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'simulation event decoding failed', { cause })
          }
          return toLegacyEvent(event, parsedBcs)
        })
      )
  return {
    effects: failed ? sanitizeFailedEffects(transaction?.effects) : transaction?.effects,
    events,
    results: result.commandResults,
    error: failed
      ? {
          code: 'SIMULATION_FAILED',
          message: 'Transaction simulation failed',
        }
      : null,
  }
}
