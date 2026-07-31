import { bcs } from '@mysten/sui/bcs'
import { deriveDynamicFieldID } from '@mysten/sui/utils'
import { MagmaRpcError } from './errors'
import type { LegacyDynamicFieldName } from './types'
import { validateSuiAddress, validateSuiObjectId } from './validation'

function unsignedInteger(value: unknown, bits: number): bigint {
  let parsed: bigint
  try {
    parsed = BigInt(value as string | number | bigint)
  } catch (cause) {
    throw new MagmaRpcError('INVALID_ARGUMENT', `dynamic field value must be a valid u${bits}`, { cause })
  }
  const maximum = (1n << BigInt(bits)) - 1n
  if (parsed < 0n || parsed > maximum) {
    throw new MagmaRpcError('INVALID_ARGUMENT', `dynamic field value is outside the u${bits} range`)
  }
  return parsed
}

export function serializeDynamicFieldName(name: LegacyDynamicFieldName): Uint8Array {
  switch (name.type) {
    case 'address':
      return bcs.Address.serialize(validateSuiAddress(name.value as string, 'dynamic field address')).toBytes()
    case '0x2::object::ID':
      return bcs.Address.serialize(validateSuiObjectId(name.value as string, 'dynamic field object ID')).toBytes()
    case 'u8':
      return bcs
        .u8()
        .serialize(Number(unsignedInteger(name.value, 8)))
        .toBytes()
    case 'u16':
      return bcs
        .u16()
        .serialize(Number(unsignedInteger(name.value, 16)))
        .toBytes()
    case 'u32':
      return bcs
        .u32()
        .serialize(Number(unsignedInteger(name.value, 32)))
        .toBytes()
    case 'u64':
      return bcs.u64().serialize(unsignedInteger(name.value, 64)).toBytes()
    case 'u128':
      return bcs.u128().serialize(unsignedInteger(name.value, 128)).toBytes()
    case 'u256':
      return bcs.u256().serialize(unsignedInteger(name.value, 256)).toBytes()
    case '0x1::type_name::TypeName': {
      const value = name.value as { name?: unknown }
      if (!value || typeof value.name !== 'string' || value.name.length === 0 || value.name.length > 1_024) {
        throw new MagmaRpcError('INVALID_ARGUMENT', 'dynamic field TypeName must contain a non-empty name')
      }
      return bcs.struct('TypeName', { name: bcs.string() }).serialize({ name: value.name }).toBytes()
    }
    default:
      throw new MagmaRpcError('INVALID_ARGUMENT', `unsupported dynamic field name type: ${name.type}`)
  }
}

export function deriveLegacyDynamicFieldId(parentId: string, name: LegacyDynamicFieldName): string {
  return deriveDynamicFieldID(validateSuiObjectId(parentId, 'dynamic field parentId'), name.type, serializeDynamicFieldName(name))
}
