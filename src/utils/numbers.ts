import Decimal from 'decimal.js'

export function d(value?: Decimal.Value): Decimal.Instance {
  if (Decimal.isDecimal(value)) {
    return value as Decimal
  }

  return new Decimal(value === undefined ? 0 : value)
}

export function decimalsMultiplier(decimals?: Decimal.Value): Decimal.Instance {
  return d(10).pow(d(decimals).abs())
}

export function toDecimalsAmount(amount: number | string, decimals: number | string, rounding = Decimal.ROUND_DOWN): string {
  return d(amount)
    .mul(decimalsMultiplier(d(decimals)))
    .toFixed(0, rounding)
    .toString()
}

export function asUintN(int: bigint, bits = 32): string {
  return BigInt.asUintN(bits, BigInt(int)).toString()
}

export function asIntN(int: bigint, bits = 32): number {
  return Number(BigInt.asIntN(bits, BigInt(int)))
}

export function fromDecimalsAmount(amount: number | string, decimals: number | string): string {
  return d(amount)
    .div(decimalsMultiplier(d(decimals)))
    .toString()
}

const fixDEAdd = (num: string, precision: number, autoFix = true): string => {
  if (num === '0') {
    if (!precision || !autoFix) return '0'
    return '0.'.padEnd(precision + 2, '0')
  }

  const number = Number.parseFloat(num)
  const negative = number < 0
  const unsigned = negative ? num.slice(1) : num
  let result = unsigned

  if (unsigned.toLowerCase().includes('e')) {
    const parts = unsigned.match(/(\d+?)(?:\.(\d*))?e([+-])(\d+)/i)
    if (!parts) return num

    const left = parts[1] || '0'
    const right = parts[2] || ''
    const direction = parts[3]
    const exponent = Number.parseInt(parts[4], 10)
    let digits = ''
    let remainder = right.substring(exponent)
    if (remainder) remainder = `.${remainder}`

    if (direction !== '-') {
      for (let i = 0; i < exponent; i += 1) digits += right[i] || '0'
      result = left + digits + remainder
    } else {
      let integer = '0'
      for (let i = 0; i < exponent; i += 1) {
        digits = (left[left.length - i - 1] || '0') + digits
      }
      if (left.length > exponent) integer = left.substring(0, left.length - exponent)
      result = `${integer}.${digits}${right}`
    }
  }

  if (precision && autoFix) {
    let fixed = `${result.split('.')[0]}.`
    const fraction = result.split('.')[1] || ''
    for (let i = 0; i < precision; i += 1) fixed += fraction[i] || '0'
    result = fixed
  }

  return `${negative ? '-' : ''}${result}`
}

export function convertScientificToDecimal(numStr?: string, precision = 9): string {
  if (numStr === undefined) return ''

  const normalized = numStr.toLowerCase()
  if (!normalized.includes('e')) return numStr
  if (normalized.includes('+')) return fixDEAdd(normalized, precision)

  const [base, exponentString] = normalized.split('e')
  let integerPart = base
  const exponent = Math.abs(Number.parseInt(exponentString, 10))
  let zeros = ''
  let integerLength = integerPart.length

  if (base.includes('.')) {
    const [whole, fraction] = base.split('.')
    integerPart = whole + fraction
    integerLength = whole.length
  }
  for (let i = 0; i < exponent - integerLength; i += 1) zeros += '0'
  return `0.${zeros}${integerPart}`.slice(0, precision + 2)
}
