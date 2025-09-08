import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import BN from 'bn.js'
import { get_price_x128_from_real_id, get_real_id_from_price_x128, get_swap_out, get_swap_in } from '@magmaprotocol/calc_almm'
import { initMagmaSDK } from './config'
import { adjustForSlippage, Percentage } from './math'
import { d } from './utils'

function buildTestAccount(): Ed25519Keypair {
  const mnemonics = 'change prison cube paddle nice basic dirt drum upper army middle panic'
  const testAccountObject = Ed25519Keypair.deriveKeypair(mnemonics)
  // console.log(' Address: ', testAccountObject.getPublicKey().toSuiAddress())

  return testAccountObject
}

async function run_test() {
  const sendKeypair = buildTestAccount()
  const magmaClmmSDK = initMagmaSDK({
    network: 'testnet',
    // fullNodeUrl: 'http://192.168.3.64:9000',
    simulationAccount: sendKeypair.getPublicKey().toSuiAddress(),
  })
  magmaClmmSDK.senderAddress = sendKeypair.getPublicKey().toSuiAddress()
  const account2 = '0xcc1017f624e7c1353432a116ecddf9490b335d351d17257eedd3206699ff4c0a'

  {
    // 1. Create lock
    const createLockPayload = await magmaClmmSDK.Lock.createLockTransactionPayload({
      amount: '1000000', // Decimal: 6
      lockDurationDays: 7,
      permanent: false,
    })
    const createLockTxn = await magmaClmmSDK.fullClient.sendTransaction(sendKeypair, createLockPayload)
    console.log('CreateLockTxn #####: ', createLockTxn)
  }

  const lockId = '0x7d91aab31e4510fb832fea3f9d875c6b374a9a9847622f6fef74cc13b6469c2e'
  const lockId2 = '0xf996458669e811f9f1b19a4016e481ce4c1a7e4074b940b857c905c527e99435'
  const poolId = '0x1a63b0cd9ddc99bb5767724cb778db54431b3a83ac1b4e14d49df72d83adbf74'

  {
    // 2. Query all locks of user
    const locksOfUser = await magmaClmmSDK.Lock.locksOfUser(sendKeypair.getPublicKey().toSuiAddress())
    console.log('LocksOfUser #####: ', locksOfUser)

    // 2.1 Query again
    const locksOfUser2 = await magmaClmmSDK.Lock.locksOfUser(account2)
    console.log('LocksOfUser2 #####: ', locksOfUser2)
  }

  {
    // LockInfo
    const lockInfo = await magmaClmmSDK.Lock.aLockInfo(lockId)
    console.log('summaryOfLock #####: ', lockInfo)

    // Summary of a lock
    const aLockSummary = await magmaClmmSDK.Lock.aLockSummary(lockId)
    console.log('summaryOfLock #####: ', aLockSummary)

    // All Lock summary
    const allLockSummary = await magmaClmmSDK.Lock.allLockSummary()
    console.log('summaryOfAllLock #####: ', allLockSummary)
  }

  {
    // 3. increase lock amount
    const increaseLockAmountPayload = await magmaClmmSDK.Lock.increaseLockAmountTransactionPayload({
      lockId,
      amount: '1000000',
    })
    const increaseAmountTxn = await magmaClmmSDK.fullClient.sendTransaction(sendKeypair, increaseLockAmountPayload)
    console.log('increaseAmountTxn #####: ', increaseAmountTxn)
  }

  {
    // 4. increase lock duration
    const increaseLockDurationPayload = await magmaClmmSDK.Lock.increaseUnlockTimePayload({
      lockId,
      newLockEndAt: Date.now() + 10 * 3600 * 24,
    })
    const increaseLockDurationTxn = await magmaClmmSDK.fullClient.sendTransaction(sendKeypair, increaseLockDurationPayload)
    console.log('increaseLockDurationPayload #####: ', increaseLockDurationTxn)
  }

  {
    // 5. merge
    const mergeLockPayload = await magmaClmmSDK.Lock.mergeLockTransactionPayload({
      fromLockId: lockId2,
      toLockId: lockId,
    })
    const mergeLockTxn = await magmaClmmSDK.fullClient.sendTransaction(sendKeypair, mergeLockPayload)
    console.log('mergeLockTxn #####: ', mergeLockTxn)
  }

  {
    // 6. transfer
    const transferLockPayload = await magmaClmmSDK.Lock.transferLockTransactionPayload({
      lockId: lockId2,
      to: account2,
    })
    const transferLockTxn = await magmaClmmSDK.fullClient.sendTransaction(sendKeypair, transferLockPayload)
    console.log('transferLockTxn #####: ', transferLockTxn)
  }

  {
    // 7. lock_permanent
    const lockPermanentPayload = await magmaClmmSDK.Lock.lockPermanentPayload({
      lockId,
    })
    const unlcokPermanentTxn = await magmaClmmSDK.fullClient.sendTransaction(sendKeypair, lockPermanentPayload)
    console.log('lockPermanentPayload #####: ', unlcokPermanentTxn)
  }

  {
    // 8. unlock_permament
    const unlockPermanentPayload = await magmaClmmSDK.Lock.unlockPermanentPayload({
      lockId,
    })
    const unlockPermanentTxn = await magmaClmmSDK.fullClient.sendTransaction(sendKeypair, unlockPermanentPayload)
    console.log('unlockPermanentPayload: #####', unlockPermanentTxn)
  }

  {
    // 9. lock vote pools
    const votePayload = await magmaClmmSDK.Lock.votePayload({
      lockId,
      pools: [poolId],
      weights: [1],
    })
    const voteTxn = await magmaClmmSDK.fullClient.sendTransaction(sendKeypair, votePayload)
    console.log('voteTxn #####: ', voteTxn)
  }

  const pool = await magmaClmmSDK.Pool.getPool(poolId)
  {
    // 10.1. claimVotingRewards: multi locks
    const claimVotingRewardsPayload1 = await magmaClmmSDK.Lock.claimVotingRewardsPoolsPayload({
      coinAType: pool.coinTypeA,
      coinBType: pool.coinTypeB,
      locks: [lockId],
    })
    const claimVotingRewardsTxn1 = await magmaClmmSDK.fullClient.sendTransaction(sendKeypair, claimVotingRewardsPayload1)
    console.log('claimVotingRewardsTxn #####: ', claimVotingRewardsTxn1)
  }

  {
    // 10.2. claimVotingRewards: one lock
    const claimVotingRewardsPayload = await magmaClmmSDK.Lock.claimVotingRewardsPayload({
      coinAType: pool.coinTypeA,
      coinBType: pool.coinTypeB,
      locks: lockId,
    })
    const claimVotingRewardsTxn = await magmaClmmSDK.fullClient.sendTransaction(sendKeypair, claimVotingRewardsPayload)
    console.log('claimVotingRewardsTxn #####: ', claimVotingRewardsTxn)
  }

  {
    // 11. claimAndLockRebases
    const claimAndLockRebasesPayload = await magmaClmmSDK.Lock.claimAndLockRebasesPayload({
      lockId,
    })
    const claimAndLockRebasesTxn = await magmaClmmSDK.fullClient.sendTransaction(sendKeypair, claimAndLockRebasesPayload)
    console.log('claimAndLockRebasesTxn #####: ', claimAndLockRebasesTxn)
  }

  {
    // 12. poke
    const pokePayload = await magmaClmmSDK.Lock.pokePayload({
      lockId,
    })
    const pokeTxn = await magmaClmmSDK.fullClient.sendTransaction(sendKeypair, pokePayload)
    console.log('pokeTxn #####: ', pokeTxn)
  }

  {
    // 13. Get all pools' votingPower: call pool_tally
    // Get PoolWeights:
    const poolWeights = await magmaClmmSDK.Lock.poolWeights([poolId])
    console.log('poolWeights: ', poolWeights)
  }

  {
    // 14. get reward token_list
    const votingFeeRewardTokens = await magmaClmmSDK.Lock.getVotingFeeRewardTokens(lockId)
    console.log('votintFeeRewardTokens #####: ', votingFeeRewardTokens)

    // 15. get pools VotingFeeRewardToken
    const votingBribeRewardTokens = await magmaClmmSDK.Lock.getVotingBribeRewardTokens(lockId)
    console.log('votingBribeRewardTokens #####: ', votingBribeRewardTokens)

    // 16. get pool's incentive token list
    const poolBribeRewardTokens = await magmaClmmSDK.Lock.getPoolBribeRewardTokens(poolId)
    console.log('poolBribeRewardTokens #####: ', poolBribeRewardTokens)

    const incentiveTokens: string[] = []
    poolBribeRewardTokens.forEach((value, key) => {
      incentiveTokens.push(...value)
    })
    // 17. Get pool's incentive token reward amount
    const poolIncentiveRewards = await magmaClmmSDK.Lock.getPoolIncentiveRewards(lockId, incentiveTokens)
    console.log('poolIncentiveRewards #####: ', poolIncentiveRewards)

    {
      // 18. claim voting incentive/bribe tokens
      const claimVotingBribePayload = await magmaClmmSDK.Lock.claimVotingBribe([lockId], incentiveTokens)
      const claimVotingBribeTxn = await magmaClmmSDK.fullClient.sendTransaction(sendKeypair, claimVotingBribePayload)
      console.log('claimVotingRewardsTxn #####: ', claimVotingBribeTxn)
    }
  }
}

async function test_panter() {
  const sendKeypair = Ed25519Keypair.fromSecretKey('suiprivkey1qqlls5cx27y28zrwc3rwhex2g832nfgax4teh2xmnnel9wqnqd4v2n5pqjz')

  const magmaClmmSDK = initMagmaSDK({
    network: 'mainnet',
    simulationAccount: sendKeypair.getPublicKey().toSuiAddress(),
  })
  magmaClmmSDK.senderAddress = sendKeypair.getPublicKey().toSuiAddress()

  // // 获取池子列表
  // const pools = await magmaClmmSDK.Almm.getPools()
  // console.log('####', pools)

  // 获取用户的positions
  const almmPositions = await magmaClmmSDK.Almm.getUserPositions('0xc96690822c4146863abcf370bd3ff651200ddddbd0c556e89d3fc4c35aaf48e3')
  // console.log(`positionDetail:`, almmPositions)
  // console.log(`positions length: ${almmPositions.length}`)

  const res2 = await magmaClmmSDK.Almm.getEarnedRewards([
    {
      pool_id: '0x540e56df0e57ac0d779a64d1f9f01fe9ac03d4758623105e05b4f9facc5d0f61',
      position_id: '0xdbc446534c4be4dc3df8a5ddf84b526a1f94366b2e6ef427bf85285a3e55161f',
      coin_a: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      coin_b: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS',
      rewards_token: ['0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'],
    },
  ])
  console.log('### ', res2)

  const pools = await magmaClmmSDK.Almm.getPoolInfo(['0x540e56df0e57ac0d779a64d1f9f01fe9ac03d4758623105e05b4f9facc5d0f61'])

  const bins = await magmaClmmSDK.Almm.fetchBins({
    pair: '0x540e56df0e57ac0d779a64d1f9f01fe9ac03d4758623105e05b4f9facc5d0f61',
    coinTypeA: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    coinTypeB: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS',
    offset: 0,
    limit: 500,
  })

  const params_str = JSON.stringify({ params: pools[0].params, bins, bin_step: pools[0].bin_step })
  const now_timestamp = Date.now()
  const swap_out = get_swap_out(params_str, BigInt(10000), true, BigInt(now_timestamp))
  console.log('swap_out: ', swap_out)
  // { amount_in_left: 10, amount_out: 110849443, fee: 10 }

  const swap_in = get_swap_in(params_str, BigInt(110849443), true, BigInt(now_timestamp))
  console.log('swap_in: ', swap_in)
  // { amount_in: 9999, amount_out_left: 0, fee: 10 }

  const res = await magmaClmmSDK.Almm.swap({
    pair: '0x540e56df0e57ac0d779a64d1f9f01fe9ac03d4758623105e05b4f9facc5d0f61',
    coinTypeA: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    coinTypeB: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS',

    amountIn: 9999,
    minAmountOut: 0,
    swapForY: true,
    to: 'YourAddress',
  })

  await magmaClmmSDK.Almm.addLiquidityByStrategy

  // Whether the swap direction is token a to token b
  const a2b = false
  // fix input token amount
  const coinAmount = new BN(50000000)
  // input token amount is token a
  const byAmountIn = true
  // slippage value
  const slippage = Percentage.fromDecimal(d(5))
  // Fetch pool data
  const pool = await magmaClmmSDK.Pool.getPool('0x0128aade80123e3f6c5c0eac1a2dee2512bbdc92c9c1b386b0fd66e6cddfaa72')
  // Estimated amountIn amountOut fee
  const res3: any = await magmaClmmSDK.Swap.preswap({
    pool,
    currentSqrtPrice: pool.current_sqrt_price,
    coinTypeA: pool.coinTypeA,
    coinTypeB: pool.coinTypeB,
    decimalsA: 9,
    decimalsB: 9,
    a2b,
    byAmountIn,
    amount: coinAmount.toString(),
  })

  const partner = '0x5df5e1d4f8d449622a5fdeaa03f9029e8eb6b0eddd25c5a67543ee5a520b7003'

  // build swap Payload
  const swapPayload = await magmaClmmSDK.Swap.createSwapTransactionPayload({
    pool_id: pool.poolAddress,
    coinTypeA: pool.coinTypeA,
    coinTypeB: pool.coinTypeB,
    a2b,
    by_amount_in: byAmountIn,
    amount: res3.amount.toString(),
    amount_limit: '1',
    swap_partner: partner,
  })

  const transferTxn = await magmaClmmSDK.fullClient.sendTransaction(sendKeypair, swapPayload)
  console.log('swap: ', transferTxn)
}

async function pool_gauge() {
  const magmaClmmSDK = initMagmaSDK({
    network: 'mainnet',
    // fullNodeUrl: 'http://192.168.3.64:9000',
    simulationAccount: '',
  })
  const res = await magmaClmmSDK.Gauge.getPoolGaguers()
  console.log('poolGauges: ', res)

  const pools = [
    '0x3c8d067cb266071bee84e60ca249257e9966ef5be42bd8cafb2c2f59402bc4c5',
    '0x8faa061cbec3a3208255f1c4d00f97fc6e542807d259d931d3af4a02ccdbe3fe',
  ]
  const pool_coins = await magmaClmmSDK.Gauge.getPoolCoins(pools)
  console.log('####### pool_coins: ', pool_coins)

  const lockSummary = await magmaClmmSDK.Lock.aLockSummary('0x5ea39a59319987bdb7c9310dd51e33a435039a3b8844093f415da2650cc7fcee')
  console.log('######## aLockSummary: ', lockSummary)

  const lockInfo = await magmaClmmSDK.Lock.aLockInfo('0x5ea39a59319987bdb7c9310dd51e33a435039a3b8844093f415da2650cc7fcee')
  console.log('######## aLockInfo: ', lockInfo)

  const res2 = await magmaClmmSDK.Lock.getLockVotingStats('0x5ea39a59319987bdb7c9310dd51e33a435039a3b8844093f415da2650cc7fcee')
  console.log('###### res: ', res2)
}

// test_panter()
// run_test()

// pool_gauge()

test_panter()
