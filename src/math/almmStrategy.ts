import BN from 'bn.js'
import { ClmmpoolsError, AlmmStrategyCode } from '../errors/errors'
import { autoFillXByWeight, autoFillYByWeight, toAmountAskSide, toAmountBidSide, toAmountBothSide } from './almmWeightToAmounts'
import { BinDisplay } from '../types'

export enum StrategyType {
  Spot = 1,
  Curve = 2,
  BidAsk = 3,
}

export type BinLiquidity = {
  ActiveId: number
  StorageId: number
  Price: number
  CoinAType: number
  CoinBType: number
  CoinAAmount: number
  CoinBAmount: number
}

function toWeightDecendingOrder(
  minBinId: number,
  maxBinId: number
): {
  binId: number
  weight: number
}[] {
  const distributions = []
  for (let i = minBinId; i <= maxBinId; i++) {
    distributions.push({
      binId: i,
      weight: maxBinId - i + 1,
    })
  }
  return distributions
}

function toWeightAscendingOrder(
  minBinId: number,
  maxBinId: number
): {
  binId: number
  weight: number
}[] {
  const distributions = []
  for (let i = minBinId; i <= maxBinId; i++) {
    distributions.push({
      binId: i,
      weight: i - minBinId + 1,
    })
  }
  return distributions
}

function toWeightSpotBalanced(
  minBinId: number,
  maxBinId: number
): {
  binId: number
  weight: number
}[] {
  const distributions = []
  for (let i = minBinId; i <= maxBinId; i++) {
    distributions.push({
      binId: i,
      weight: 1,
    })
  }
  return distributions
}

const DEFAULT_MAX_WEIGHT = 2000000000000
const DEFAULT_MIN_WEIGHT = 200000000000

function toWeightCurve(
  minBinId: number,
  maxBinId: number,
  activeId: number
): {
  binId: number
  weight: number
}[] {
  if (activeId < minBinId || activeId > maxBinId) {
    throw new ClmmpoolsError('Invalid strategy params', AlmmStrategyCode.InvalidParams)
  }
  const maxWeight = DEFAULT_MAX_WEIGHT
  const minWeight = DEFAULT_MIN_WEIGHT

  const diffWeight = maxWeight - minWeight
  const diffMinWeight = activeId > minBinId ? Math.floor(diffWeight / (activeId - minBinId)) : 0
  const diffMaxWeight = maxBinId > activeId ? Math.floor(diffWeight / (maxBinId - activeId)) : 0

  const distributions = []
  for (let i = minBinId; i <= maxBinId; i++) {
    if (i < activeId) {
      distributions.push({
        binId: i,
        weight: maxWeight - (activeId - i) * diffMinWeight,
      })
    } else if (i > activeId) {
      distributions.push({
        binId: i,
        weight: maxWeight - (i - activeId) * diffMaxWeight,
      })
    } else {
      distributions.push({
        binId: i,
        weight: maxWeight,
      })
    }
  }
  return distributions
}

function toWeightBidAsk(
  minBinId: number,
  maxBinId: number,
  activeId: number
): {
  binId: number
  weight: number
}[] {
  if (activeId < minBinId || activeId > maxBinId) {
    throw new ClmmpoolsError('Invalid strategy params', AlmmStrategyCode.InvalidParams)
  }
  const maxWeight = DEFAULT_MAX_WEIGHT
  const minWeight = DEFAULT_MIN_WEIGHT

  const diffWeight = maxWeight - minWeight
  const diffMinWeight = activeId > minBinId ? Math.floor(diffWeight / (activeId - minBinId)) : 0
  const diffMaxWeight = maxBinId > activeId ? Math.floor(diffWeight / (maxBinId - activeId)) : 0

  const distributions = []
  for (let i = minBinId; i <= maxBinId; i++) {
    if (i < activeId) {
      distributions.push({
        binId: i,
        weight: minWeight + (activeId - i) * diffMinWeight,
      })
    } else if (i > activeId) {
      distributions.push({
        binId: i,
        weight: minWeight + (i - activeId) * diffMaxWeight,
      })
    } else {
      distributions.push({
        binId: i,
        weight: minWeight,
      })
    }
  }
  return distributions
}

// only apply for balanced deposit
export function autoFillYByStrategy(
  activeId: number,
  binStep: number,
  amountX: BN,
  amountXInActiveBin: BN,
  amountYInActiveBin: BN,
  minBinId: number,
  maxBinId: number,
  strategyType: StrategyType
): BN {
  switch (strategyType) {
    case StrategyType.Spot: {
      const weights = toWeightSpotBalanced(minBinId, maxBinId)
      return autoFillYByWeight(activeId, binStep, amountX, amountXInActiveBin, amountYInActiveBin, weights)
    }
    case StrategyType.Curve: {
      const weights = toWeightCurve(minBinId, maxBinId, activeId)
      return autoFillYByWeight(activeId, binStep, amountX, amountXInActiveBin, amountYInActiveBin, weights)
    }
    case StrategyType.BidAsk: {
      const weights = toWeightBidAsk(minBinId, maxBinId, activeId)
      return autoFillYByWeight(activeId, binStep, amountX, amountXInActiveBin, amountYInActiveBin, weights)
    }
    default:
      throw new Error(`Unsupported strategy type: ${strategyType}`)
  }
}

// only apply for balanced deposit
export function autoFillXByStrategy(
  activeId: number,
  binStep: number,
  amountY: BN,
  amountXInActiveBin: BN,
  amountYInActiveBin: BN,
  minBinId: number,
  maxBinId: number,
  strategyType: StrategyType
): BN {
  switch (strategyType) {
    case StrategyType.Spot: {
      const weights = toWeightSpotBalanced(minBinId, maxBinId)
      return autoFillXByWeight(activeId, binStep, amountY, amountXInActiveBin, amountYInActiveBin, weights)
    }
    case StrategyType.Curve: {
      const weights = toWeightCurve(minBinId, maxBinId, activeId)
      return autoFillXByWeight(activeId, binStep, amountY, amountXInActiveBin, amountYInActiveBin, weights)
    }
    case StrategyType.BidAsk: {
      const weights = toWeightBidAsk(minBinId, maxBinId, activeId)
      return autoFillXByWeight(activeId, binStep, amountY, amountXInActiveBin, amountYInActiveBin, weights)
    }
    default:
      throw new Error(`Unsupported strategy type: ${strategyType}`)
  }
}

function assignLeftAmountX(activeId: number, binStep: number, maxBinId: number, amountX: BN, strategyType: StrategyType): BinDisplay[] {
  if (maxBinId < activeId) {
    return []
  }
  let weights: {
    binId: number
    weight: number
  }[] = []
  switch (strategyType) {
    case StrategyType.Spot: {
      weights = toWeightSpotBalanced(activeId, maxBinId)
      break
    }
    case StrategyType.Curve: {
      weights = toWeightDecendingOrder(activeId, maxBinId)
      break
    }
    case StrategyType.BidAsk: {
      weights = toWeightAscendingOrder(activeId, maxBinId)
      break
    }
  }
  const amounts = toAmountAskSide(activeId, binStep, amountX, weights)
  return amounts.map((bin) => {
    return {
      binId: bin.binId,
      amountX: bin.amount,
      amountY: new BN(0),
    }
  })
}

function assignLeftAmountY(activeId: number, minBinId: number, amountY: BN, strategyType: StrategyType): BinDisplay[] {
  if (minBinId > activeId) {
    return []
  }
  let weights: {
    binId: number
    weight: number
  }[] = []
  switch (strategyType) {
    case StrategyType.Spot: {
      weights = toWeightSpotBalanced(minBinId, activeId)
      break
    }
    case StrategyType.Curve: {
      weights = toWeightAscendingOrder(minBinId, activeId)
      break
    }
    case StrategyType.BidAsk: {
      weights = toWeightDecendingOrder(minBinId, activeId)
      break
    }
  }
  const amounts = toAmountBidSide(activeId, amountY, weights)
  return amounts.map((bin) => {
    return {
      binId: bin.binId,
      amountX: new BN(0),
      amountY: bin.amount,
    }
  })
}

function mergeBinDisplay(to: BinDisplay[], from: BinDisplay[]): BinDisplay[] {
  const binMap = new Map<number, BinDisplay>()
  for (const bin of to) {
    binMap.set(bin.binId, bin)
  }
  for (const bin of from) {
    const existingBin = binMap.get(bin.binId)
    if (existingBin) {
      existingBin.amountX = existingBin.amountX.add(bin.amountX)
      existingBin.amountY = existingBin.amountY.add(bin.amountY)
    } else {
      binMap.set(bin.binId, bin)
    }
  }
  return Array.from(binMap.values()).sort((a, b) => {
    return a.binId - b.binId
  })
}

/**
 * Given a strategy type and amounts of X and Y, returns the distribution of liquidity.
 * @param activeId The bin id of the active bin.
 * @param binStep The step size of each bin.
 * @param minBinId The min bin id.
 * @param maxBinId The max bin id.
 * @param amountX The amount of X token to deposit.
 * @param amountY The amount of Y token to deposit.
 * @param amountXInActiveBin The amount of X token in the active bin.
 * @param amountYInActiveBin The amount of Y token in the active bin.
 * @param strategyType The strategy type.
 * @param mintX The mint info of X token. Get from ALMM instance.
 * @param mintY The mint info of Y token. Get from ALMM instance.
 * @param clock The clock info. Get from ALMM instance.
 * @returns The distribution of liquidity.
 */
export function toAmountsBothSideByStrategy(
  activeId: number,
  binStep: number,
  minBinId: number,
  maxBinId: number,
  amountX: BN,
  amountY: BN,
  amountXInActiveBin: BN,
  amountYInActiveBin: BN,
  strategyType: StrategyType
): BinDisplay[] {
  const isSingleSideX = amountY.isZero()

  let res: BinDisplay[] = []
  switch (strategyType) {
    // case StrategyType.Spot: {
    //   if (activeId < minBinId || activeId > maxBinId) {
    //     const weights = toWeightSpotBalanced(minBinId, maxBinId)
    //     return toAmountBothSide(activeId, binStep, amountX, amountY, amountXInActiveBin, amountYInActiveBin, weights)
    //   }
    //   const amountsInBin = []
    //   if (!isSingleSideX) {
    //     if (minBinId <= activeId) {
    //       const weights = toWeightSpotBalanced(minBinId, activeId)
    //       const amounts = toAmountBidSide(activeId, amountY, weights)

    //       for (const bin of amounts) {
    //         amountsInBin.push({
    //           binId: bin.binId,
    //           amountX: new BN(0),
    //           amountY: bin.amount,
    //         })
    //       }
    //     }
    //     if (activeId < maxBinId) {
    //       const weights = toWeightSpotBalanced(activeId + 1, maxBinId)
    //       const amounts = toAmountAskSide(activeId, binStep, amountX, weights)
    //       for (const bin of amounts) {
    //         amountsInBin.push({
    //           binId: bin.binId,
    //           amountX: bin.amount,
    //           amountY: new BN(0),
    //         })
    //       }
    //     }
    //   } else {
    //     if (minBinId < activeId) {
    //       const weights = toWeightSpotBalanced(minBinId, activeId - 1)
    //       const amountsIntoBidSide = toAmountBidSide(activeId, amountY, weights)
    //       for (const bin of amountsIntoBidSide) {
    //         amountsInBin.push({
    //           binId: bin.binId,
    //           amountX: new BN(0),
    //           amountY: bin.amount,
    //         })
    //       }
    //     }
    //     if (activeId <= maxBinId) {
    //       const weights = toWeightSpotBalanced(activeId, maxBinId)
    //       const amountsIntoAskSide = toAmountAskSide(activeId, binStep, amountX, weights)
    //       for (const bin of amountsIntoAskSide) {
    //         amountsInBin.push({
    //           binId: bin.binId,
    //           amountX: bin.amount,
    //           amountY: new BN(0),
    //         })
    //       }
    //     }
    //   }
    //   return amountsInBin
    // }
    // case StrategyType.Curve: {
    //   // ask side
    //   if (activeId < minBinId) {
    //     const weights = toWeightDecendingOrder(minBinId, maxBinId)
    //     return toAmountBothSide(activeId, binStep, amountX, amountY, amountXInActiveBin, amountYInActiveBin, weights)
    //   }
    //   // bid side
    //   if (activeId > maxBinId) {
    //     const weights = toWeightAscendingOrder(minBinId, maxBinId)
    //     return toAmountBothSide(activeId, binStep, amountX, amountY, amountXInActiveBin, amountYInActiveBin, weights)
    //   }
    //   const amountsInBin = []
    //   if (!isSingleSideX) {
    //     if (minBinId <= activeId) {
    //       const weights = toWeightAscendingOrder(minBinId, activeId)
    //       const amounts = toAmountBidSide(activeId, amountY, weights)

    //       for (const bin of amounts) {
    //         amountsInBin.push({
    //           binId: bin.binId,
    //           amountX: new BN(0),
    //           amountY: bin.amount,
    //         })
    //       }
    //     }
    //     if (activeId < maxBinId) {
    //       const weights = toWeightDecendingOrder(activeId + 1, maxBinId)
    //       const amounts = toAmountAskSide(activeId, binStep, amountX, weights)
    //       for (const bin of amounts) {
    //         amountsInBin.push({
    //           binId: bin.binId,
    //           amountX: bin.amount,
    //           amountY: new BN(0),
    //         })
    //       }
    //     }
    //   } else {
    //     if (minBinId < activeId) {
    //       const weights = toWeightAscendingOrder(minBinId, activeId - 1)
    //       const amountsIntoBidSide = toAmountBidSide(activeId, amountY, weights)
    //       for (const bin of amountsIntoBidSide) {
    //         amountsInBin.push({
    //           binId: bin.binId,
    //           amountX: new BN(0),
    //           amountY: bin.amount,
    //         })
    //       }
    //     }
    //     if (activeId <= maxBinId) {
    //       const weights = toWeightDecendingOrder(activeId, maxBinId)
    //       const amountsIntoAskSide = toAmountAskSide(activeId, binStep, amountX, weights)
    //       for (const bin of amountsIntoAskSide) {
    //         amountsInBin.push({
    //           binId: bin.binId,
    //           amountX: bin.amount,
    //           amountY: new BN(0),
    //         })
    //       }
    //     }
    //   }
    //   return amountsInBin
    // }
    // case StrategyType.BidAsk: {
    //   // ask side
    //   if (activeId < minBinId) {
    //     const weights = toWeightAscendingOrder(minBinId, maxBinId)
    //     return toAmountBothSide(activeId, binStep, amountX, amountY, amountXInActiveBin, amountYInActiveBin, weights)
    //   }
    //   // bid side
    //   if (activeId > maxBinId) {
    //     const weights = toWeightDecendingOrder(minBinId, maxBinId)
    //     return toAmountBothSide(activeId, binStep, amountX, amountY, amountXInActiveBin, amountYInActiveBin, weights)
    //   }
    //   const amountsInBin = []
    //   if (!isSingleSideX) {
    //     if (minBinId <= activeId) {
    //       const weights = toWeightDecendingOrder(minBinId, activeId)
    //       const amounts = toAmountBidSide(activeId, amountY, weights)

    //       for (const bin of amounts) {
    //         amountsInBin.push({
    //           binId: bin.binId,
    //           amountX: new BN(0),
    //           amountY: bin.amount,
    //         })
    //       }
    //     }
    //     if (activeId < maxBinId) {
    //       const weights = toWeightAscendingOrder(activeId + 1, maxBinId)
    //       const amounts = toAmountAskSide(activeId, binStep, amountX, weights)
    //       for (const bin of amounts) {
    //         amountsInBin.push({
    //           binId: bin.binId,
    //           amountX: bin.amount,
    //           amountY: new BN(0),
    //         })
    //       }
    //     }
    //   } else {
    //     if (minBinId < activeId) {
    //       const weights = toWeightDecendingOrder(minBinId, activeId - 1)
    //       const amountsIntoBidSide = toAmountBidSide(activeId, amountY, weights)
    //       for (const bin of amountsIntoBidSide) {
    //         amountsInBin.push({
    //           binId: bin.binId,
    //           amountX: new BN(0),
    //           amountY: bin.amount,
    //         })
    //       }
    //     }
    //     if (activeId <= maxBinId) {
    //       const weights = toWeightAscendingOrder(activeId, maxBinId)
    //       const amountsIntoAskSide = toAmountAskSide(activeId, binStep, amountX, weights)
    //       for (const bin of amountsIntoAskSide) {
    //         amountsInBin.push({
    //           binId: bin.binId,
    //           amountX: bin.amount,
    //           amountY: new BN(0),
    //         })
    //       }
    //     }
    //   }
    //   return amountsInBin
    // }
    case StrategyType.Spot: {
      const weights = toWeightSpotBalanced(minBinId, maxBinId)
      res = toAmountBothSide(activeId, binStep, amountX, amountY, amountXInActiveBin, amountYInActiveBin, weights)
      break
    }
    case StrategyType.Curve: {
      if (activeId < minBinId) {
        const weights = toWeightDecendingOrder(minBinId, maxBinId)
        res = toAmountBothSide(activeId, binStep, amountX, amountY, amountXInActiveBin, amountYInActiveBin, weights)
      } else if (activeId > maxBinId) {
        const weights = toWeightAscendingOrder(minBinId, maxBinId)
        res = toAmountBothSide(activeId, binStep, amountX, amountY, amountXInActiveBin, amountYInActiveBin, weights)
      } else {
        const weights = toWeightCurve(minBinId, maxBinId, activeId)
        res = toAmountBothSide(activeId, binStep, amountX, amountY, amountXInActiveBin, amountYInActiveBin, weights)
      }

      break
    }
    case StrategyType.BidAsk: {
      if (activeId < minBinId) {
        const weights = toWeightAscendingOrder(minBinId, maxBinId)
        res = toAmountBothSide(activeId, binStep, amountX, amountY, amountXInActiveBin, amountYInActiveBin, weights)
      } else if (activeId > maxBinId) {
        const weights = toWeightDecendingOrder(minBinId, maxBinId)
        res = toAmountBothSide(activeId, binStep, amountX, amountY, amountXInActiveBin, amountYInActiveBin, weights)
      } else {
        const weights = toWeightBidAsk(minBinId, maxBinId, activeId)
        res = toAmountBothSide(activeId, binStep, amountX, amountY, amountXInActiveBin, amountYInActiveBin, weights)
      }

      break
    }

    default:
      throw new Error(`Unsupported strategy type: ${strategyType}`)
  }

  let amountXLeft = amountX
  let amountYLeft = amountY
  res.forEach((bin) => {
    amountXLeft = amountXLeft.sub(bin.amountX)
    amountYLeft = amountYLeft.sub(bin.amountY)
  })

  if (amountXLeft.gt(new BN(0))) {
    const xAssigned = assignLeftAmountX(activeId, binStep, maxBinId, amountXLeft, strategyType)
    res = mergeBinDisplay(res, xAssigned)
  }
  if (amountYLeft.gt(new BN(0))) {
    const yAssigned = assignLeftAmountY(activeId, minBinId, amountYLeft, strategyType)
    res = mergeBinDisplay(res, yAssigned)
  }

  return res
}
