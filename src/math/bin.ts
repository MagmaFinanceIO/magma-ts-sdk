import Decimal from 'decimal.js'
import { get_price_x128_from_real_id, get_real_id_from_price_x128 } from '@magmaprotocol/calc_almm'

export class BinMath {
  static getPriceOfBinByBinId(binId: number, binStep: number, decimalsA: number, decimalsB: number): Decimal {
    const twoDec = new Decimal(2)
    const price = new Decimal(get_price_x128_from_real_id(binId, binStep))
    return price.div(twoDec.pow(128)).mul(Decimal.pow(10, decimalsA - decimalsB))
  }

  static getBinIdFromPrice(price: string, binStep: number, decimalsA: number, decimalsB: number) {
    const twoDec = new Decimal(2)
    const tenDec = new Decimal(10)
    const realid = get_real_id_from_price_x128(
      new Decimal(price)
        .mul(tenDec.pow(decimalsB - decimalsA))
        .mul(twoDec.pow(128))
        .toDecimalPlaces(0)
        .toString(),
      binStep
    )
    return realid
  }
}
