import { bcs, type BcsType } from '@mysten/sui/bcs'
import type { SuiClientTypes } from '@mysten/sui/client'
import type { SuiGrpcClient } from '@mysten/sui/grpc'
import { parseStructTag } from '@mysten/sui/utils'
import { MagmaRpcError, toTransportError } from './errors'

type PackageCall = ReturnType<SuiGrpcClient['movePackageService']['getPackage']>
type PackageResponse = Awaited<PackageCall['response']>
type MovePackage = NonNullable<PackageResponse['package']>
type MoveModule = MovePackage['modules'][number]
type DatatypeDescriptor = MoveModule['datatypes'][number]
type OpenSignatureBody = NonNullable<DatatypeDescriptor['fields'][number]['type']>

const TYPE = {
  ADDRESS: 1,
  BOOL: 2,
  U8: 3,
  U16: 4,
  U32: 5,
  U64: 6,
  U128: 7,
  U256: 8,
  VECTOR: 9,
  DATATYPE: 10,
  TYPE_PARAMETER: 11,
} as const

const DATATYPE_KIND_ENUM = 2
const MAX_SCHEMA_DEPTH = 32
const MAX_PACKAGE_CACHE = 128

function isType(typeName: string, suffix: string): boolean {
  return typeName.toLowerCase().endsWith(suffix.toLowerCase())
}

function signatureKey(signature: OpenSignatureBody): string {
  const children = signature.typeParameterInstantiation.map(signatureKey)
  return `${signature.type}:${signature.typeName ?? ''}:${signature.typeParameter ?? ''}<${children.join(',')}>`
}

/**
 * Builds BCS schemas from the on-chain MovePackageService descriptors exposed by
 * the same gRPC endpoint used for simulation. Parsed event data therefore does
 * not depend on transport-specific JSON layouts.
 */
export class MoveBcsEventDecoder {
  private readonly client: SuiGrpcClient

  private readonly packageCache = new Map<string, Promise<MovePackage>>()

  private readonly schemaCache = new Map<string, Promise<BcsType<any>>>()

  constructor(client: SuiGrpcClient) {
    this.client = client
  }

  async decode(event: SuiClientTypes.Event): Promise<Record<string, unknown>> {
    if (!(event.bcs instanceof Uint8Array) || event.bcs.length === 0) {
      throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'simulation event did not include BCS bytes')
    }

    const tag = parseStructTag(event.eventType)
    if (tag.typeParams.length > 0) {
      throw new MagmaRpcError('UNSUPPORTED_OPERATION', 'generic simulation event types are not supported')
    }

    const descriptor = await this.getDatatype(event.packageId || tag.address, tag.module, tag.name)
    const schema = await this.buildDatatype(descriptor, [], 0)
    const decoded = schema.parse(event.bcs)
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
      throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'decoded simulation event was not a Move struct')
    }
    return decoded as Record<string, unknown>
  }

  private async getPackage(packageId: string): Promise<MovePackage> {
    let pending = this.packageCache.get(packageId)
    if (!pending) {
      if (this.packageCache.size >= MAX_PACKAGE_CACHE) {
        throw new MagmaRpcError('PAGINATION_LIMIT_EXCEEDED', 'Move package schema cache limit exceeded')
      }
      pending = (async () => {
        try {
          const response = await this.client.movePackageService.getPackage({ packageId }).response
          if (!response.package) {
            throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'Move package descriptor was missing')
          }
          return response.package
        } catch (cause) {
          if (cause instanceof MagmaRpcError) throw cause
          throw toTransportError('getMovePackage', cause)
        }
      })()
      this.packageCache.set(packageId, pending)
    }
    try {
      return await pending
    } catch (cause) {
      if (this.packageCache.get(packageId) === pending) {
        this.packageCache.delete(packageId)
      }
      throw cause
    }
  }

  private async getDatatype(packageId: string, moduleName: string, name: string): Promise<DatatypeDescriptor> {
    const movePackage = await this.getPackage(packageId)
    const module = movePackage.modules.find((item) => item.name === moduleName)
    const datatype = module?.datatypes.find((item) => item.name === name)
    if (!datatype) {
      throw new MagmaRpcError('OBJECT_QUERY_FAILED', `Move datatype descriptor was not found for ${moduleName}::${name}`)
    }
    return datatype
  }

  private async getDatatypeByTypeName(typeName: string): Promise<DatatypeDescriptor> {
    const tag = parseStructTag(typeName)
    return this.getDatatype(tag.address, tag.module, tag.name)
  }

  private async buildDatatype(descriptor: DatatypeDescriptor, typeArguments: BcsType<any>[], depth: number): Promise<BcsType<any>> {
    if (depth > MAX_SCHEMA_DEPTH) {
      throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'Move event schema exceeded the maximum nesting depth')
    }
    const typeName = descriptor.typeName ?? `${descriptor.module}::${descriptor.name}`
    const cacheKey = `${typeName}<${typeArguments.map((item) => item.name).join(',')}>`
    let pending = this.schemaCache.get(cacheKey)
    if (!pending) {
      pending = (async () => {
        const orderedFields = [...descriptor.fields].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        if (descriptor.kind === DATATYPE_KIND_ENUM) {
          const variants: Record<string, BcsType<any> | null> = {}
          for (const variant of [...descriptor.variants].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
            if (!variant.name) continue
            if (variant.fields.length === 0) {
              variants[variant.name] = null
              continue
            }
            const fields: Record<string, BcsType<any>> = {}
            for (const field of [...variant.fields].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
              if (!field.name || !field.type) {
                throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'Move enum field descriptor was incomplete')
              }
              fields[field.name] = await this.buildSignature(field.type, typeArguments, depth + 1)
            }
            variants[variant.name] = bcs.struct(`${typeName}::${variant.name}`, fields)
          }
          return bcs.enum(typeName, variants)
        }

        const fields: Record<string, BcsType<any>> = {}
        for (const field of orderedFields) {
          if (!field.name || !field.type) {
            throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'Move struct field descriptor was incomplete')
          }
          fields[field.name] = await this.buildSignature(field.type, typeArguments, depth + 1)
        }
        return bcs.struct(typeName, fields)
      })()
      this.schemaCache.set(cacheKey, pending)
    }
    try {
      return await pending
    } catch (cause) {
      if (this.schemaCache.get(cacheKey) === pending) {
        this.schemaCache.delete(cacheKey)
      }
      throw cause
    }
  }

  private async buildSignature(signature: OpenSignatureBody, typeArguments: BcsType<any>[], depth: number): Promise<BcsType<any>> {
    if (depth > MAX_SCHEMA_DEPTH) {
      throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'Move event schema exceeded the maximum nesting depth')
    }
    switch (signature.type) {
      case TYPE.ADDRESS:
        return bcs.Address
      case TYPE.BOOL:
        return bcs.bool()
      case TYPE.U8:
        return bcs.u8()
      case TYPE.U16:
        return bcs.u16()
      case TYPE.U32:
        return bcs.u32()
      case TYPE.U64:
        return bcs.u64()
      case TYPE.U128:
        return bcs.u128()
      case TYPE.U256:
        return bcs.u256()
      case TYPE.VECTOR: {
        const element = signature.typeParameterInstantiation[0]
        if (!element) throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'Move vector descriptor was incomplete')
        return bcs.vector(await this.buildSignature(element, typeArguments, depth + 1))
      }
      case TYPE.TYPE_PARAMETER: {
        const typeArgument = typeArguments[signature.typeParameter ?? -1]
        if (!typeArgument) throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'Move type parameter could not be resolved')
        return typeArgument
      }
      case TYPE.DATATYPE: {
        if (!signature.typeName) {
          throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'Move datatype signature did not include a type name')
        }
        const nestedArguments = await Promise.all(
          signature.typeParameterInstantiation.map((item) => this.buildSignature(item, typeArguments, depth + 1))
        )
        if (isType(signature.typeName, '::object::ID')) return bcs.Address
        if (isType(signature.typeName, '::string::String') || isType(signature.typeName, '::ascii::String')) {
          return bcs.string()
        }
        if (isType(signature.typeName, '::option::Option')) {
          if (nestedArguments.length !== 1) {
            throw new MagmaRpcError('OBJECT_QUERY_FAILED', 'Move Option descriptor was incomplete')
          }
          return bcs.option(nestedArguments[0])
        }
        const descriptor = await this.getDatatypeByTypeName(signature.typeName)
        return this.buildDatatype(descriptor, nestedArguments, depth + 1)
      }
      default:
        throw new MagmaRpcError('UNSUPPORTED_OPERATION', `unsupported Move event signature: ${signatureKey(signature)}`)
    }
  }
}
