import { createPublicClient, http, parseAbiItem, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { redis } from '@/lib/redis';
import {
  getTrbLpJob,
  getNextScanRange,
  updateTrbLpJobProgress,
  failTrbLpJob,
  DEFAULT_CONFIRMATIONS,
} from '@/lib/trbLpScanJobManager';

export const TRB_ADDRESS = '0x2baaD38A80FfDd8D195d2B4eef0bC8E0f319c63a'.toLowerCase();
export const TRB_LP_LIKE_ADDRESS = '0x367C2522a452EFc180cc93855d98dBD8668488D4'.toLowerCase();
export const VIRTUAL_ADDRESS = '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b'.toLowerCase();

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);

function resolveRpcUrl() {
  let rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
  const infuraKey = process.env.INFURA_API_KEY || process.env.NEXT_PUBLIC_INFURA_API_KEY;
  if (infuraKey) rpcUrl = `https://base-mainnet.infura.io/v3/${infuraKey}`;
  return rpcUrl;
}

async function recordSeenLog(seenSetKey, id) {
  const added = await redis.sadd(seenSetKey, id);
  await redis.expire(seenSetKey, 60 * 60 * 24 * 7);
  return added === 1;
}

async function updateLeaderboard({
  buyTrbMap,
  sellTrbMap,
  buyVirtualMap,
  sellVirtualMap,
  txCountMap,
}) {
  const buyKey = 'trb-lp-leaderboard:buys';
  const sellKey = 'trb-lp-leaderboard:sells';
  const netKey = 'trb-lp-leaderboard:net';
  const buyVirtualKey = 'trb-lp-leaderboard:buys:virtual';
  const sellVirtualKey = 'trb-lp-leaderboard:sells:virtual';
  const netVirtualKey = 'trb-lp-leaderboard:net:virtual';
  const metaKey = 'trb-lp-leaderboard:meta';

  for (const [address, buyTrb] of buyTrbMap.entries()) {
    await redis.zincrby(buyKey, buyTrb, address);
    await redis.zincrby(netKey, buyTrb, address);
  }

  for (const [address, sellTrb] of sellTrbMap.entries()) {
    await redis.zincrby(sellKey, sellTrb, address);
    await redis.zincrby(netKey, -sellTrb, address);
  }

  for (const [address, buyVirtual] of buyVirtualMap.entries()) {
    await redis.zincrby(buyVirtualKey, buyVirtual, address);
    await redis.zincrby(netVirtualKey, buyVirtual, address);
  }

  for (const [address, sellVirtual] of sellVirtualMap.entries()) {
    await redis.zincrby(sellVirtualKey, sellVirtual, address);
    await redis.zincrby(netVirtualKey, -sellVirtual, address);
  }

  for (const [address, count] of txCountMap.entries()) {
    const key = `trb-lp-leaderboard:txcount:${address}`;
    await redis.incrby(key, count);
  }

  const now = Date.now();
  const meta = (await redis.hgetall(metaKey)) || {};
  const prevBuys = parseFloat(meta.totalBuysTrb || '0');
  const prevSells = parseFloat(meta.totalSellsTrb || '0');
  const prevBuysVirtual = parseFloat(meta.totalBuysVirtual || '0');
  const prevSellsVirtual = parseFloat(meta.totalSellsVirtual || '0');
  const addedBuys = Array.from(buyTrbMap.values()).reduce((a, v) => a + v, 0);
  const addedSells = Array.from(sellTrbMap.values()).reduce((a, v) => a + v, 0);
  const addedBuysVirtual = Array.from(buyVirtualMap.values()).reduce((a, v) => a + v, 0);
  const addedSellsVirtual = Array.from(sellVirtualMap.values()).reduce((a, v) => a + v, 0);

  await redis.hset(metaKey, {
    tokenAddress: TRB_ADDRESS,
    lpLikeAddress: TRB_LP_LIKE_ADDRESS,
    lastUpdated: now.toString(),
    totalBuysTrb: (prevBuys + addedBuys).toFixed(6),
    totalSellsTrb: (prevSells + addedSells).toFixed(6),
    totalBuysVirtual: (prevBuysVirtual + addedBuysVirtual).toFixed(6),
    totalSellsVirtual: (prevSellsVirtual + addedSellsVirtual).toFixed(6),
  });
}

function toTrbNumber(valueWei) {
  // formatUnits avoids BigInt->Number overflow from direct division.
  const s = formatUnits(valueWei, 18);
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function toVirtualNumber(valueWei) {
  const s = formatUnits(valueWei, 18);
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Executes a single scan chunk based on the current job state.
 * Returns a summary and updates Redis (leaderboards + job progress).
 */
export async function runTrbLpScanOnce({
  timeBudgetMs = 9000,
  confirmations = DEFAULT_CONFIRMATIONS,
} = {}) {
  const startedAt = Date.now();

  try {
    const job = await getTrbLpJob();
    if (!job) {
      return { ok: false, reason: 'no_job', message: 'No active TRB LP scan job configured' };
    }

    if (job.status !== 'active') {
      return {
        ok: true,
        reason: 'not_active',
        message: `Job not active (status=${job.status})`,
        job,
      };
    }

    const client = createPublicClient({
      chain: base,
      transport: http(resolveRpcUrl(), { batch: true, retryCount: 2, retryDelay: 500 }),
    });

    const currentNetworkBlock = await client.getBlockNumber();
    const range = getNextScanRange(job, currentNetworkBlock, confirmations);

    if (!range) {
      return {
        ok: true,
        reason: 'no_range',
        message: 'No blocks to scan yet',
        job,
        currentNetworkBlock: currentNetworkBlock.toString(),
      };
    }

    const { fromBlock, toBlock } = range;

    const [trbLogs, virtualLogs] = await Promise.all([
      client.getLogs({
        address: TRB_ADDRESS,
        event: TRANSFER_EVENT,
        fromBlock,
        toBlock,
      }),
      client.getLogs({
        address: VIRTUAL_ADDRESS,
        event: TRANSFER_EVENT,
        fromBlock,
        toBlock,
      }),
    ]);

    const seenSetKey = `trb-lp:seen:${new Date().toISOString().slice(0, 10)}`;

    const buyTrbMap = new Map();
    const sellTrbMap = new Map();
    const buyVirtualMap = new Map();
    const sellVirtualMap = new Map();
    const txCountMap = new Map();

    let processed = 0;
    let skippedDuplicate = 0;
    let lastProcessedBlock = null;

    const txMap = new Map();
    const addToTxMap = (log, token) => {
      const from = (log.args?.from || '').toLowerCase();
      const to = (log.args?.to || '').toLowerCase();
      const valueWei = BigInt(log.args?.value || 0n);
      if (valueWei === 0n) return;

      const involvesLp = from === TRB_LP_LIKE_ADDRESS || to === TRB_LP_LIKE_ADDRESS;
      if (!involvesLp) return;

      const txHash = log.transactionHash;
      if (!txHash) return;
      const entry = txMap.get(txHash) || {
        trb: [],
        virtual: [],
        blockNumber: log.blockNumber ?? null,
      };

      entry[token].push({ from, to, valueWei });
      entry.blockNumber = log.blockNumber ?? entry.blockNumber;
      txMap.set(txHash, entry);
    };

    for (const log of trbLogs) addToTxMap(log, 'trb');
    for (const log of virtualLogs) addToTxMap(log, 'virtual');

    for (const [txHash, entry] of txMap.entries()) {
      if (Date.now() - startedAt > timeBudgetMs) break;

      const isNewTx = await recordSeenLog(seenSetKey, txHash);
      if (!isNewTx) {
        skippedDuplicate++;
        continue;
      }

      const trbOut = entry.trb.filter((t) => t.from === TRB_LP_LIKE_ADDRESS && t.to !== TRB_LP_LIKE_ADDRESS);
      const trbIn = entry.trb.filter((t) => t.to === TRB_LP_LIKE_ADDRESS && t.from !== TRB_LP_LIKE_ADDRESS);
      if (trbOut.length === 0 && trbIn.length === 0) continue;

      const virtualIn = entry.virtual.filter((t) => t.to === TRB_LP_LIKE_ADDRESS && t.from !== TRB_LP_LIKE_ADDRESS);
      const virtualOut = entry.virtual.filter((t) => t.from === TRB_LP_LIKE_ADDRESS && t.to !== TRB_LP_LIKE_ADDRESS);

      const sumWei = (arr) => arr.reduce((a, t) => a + t.valueWei, 0n);
      const trbOutWei = sumWei(trbOut);
      const trbInWei = sumWei(trbIn);
      const virtualInWei = sumWei(virtualIn);
      const virtualOutWei = sumWei(virtualOut);

      // Decide direction; require consistent opposite-side flow to avoid liquidity/mint/burn noise.
      const direction = trbOutWei > trbInWei ? 'buy' : trbInWei > trbOutWei ? 'sell' : null;
      if (!direction) continue;
      if (direction === 'buy' && virtualInWei === 0n) continue;
      if (direction === 'sell' && virtualOutWei === 0n) continue;

      const pickMax = (arr) =>
        arr.reduce((best, t) => (best && best.valueWei >= t.valueWei ? best : t), null);

      const mainTrb = direction === 'buy' ? pickMax(trbOut) : pickMax(trbIn);
      if (!mainTrb) continue;

      const trader = direction === 'buy' ? mainTrb.to : mainTrb.from;
      if (!trader || trader === '0x0000000000000000000000000000000000000000') continue;

      const amountTrb = toTrbNumber(direction === 'buy' ? trbOutWei : trbInWei);
      const amountVirtual = toVirtualNumber(direction === 'buy' ? virtualInWei : virtualOutWei);
      if (amountTrb <= 0 || amountVirtual <= 0) continue;

      if (direction === 'buy') {
        buyTrbMap.set(trader, (buyTrbMap.get(trader) || 0) + amountTrb);
        buyVirtualMap.set(trader, (buyVirtualMap.get(trader) || 0) + amountVirtual);
      } else {
        sellTrbMap.set(trader, (sellTrbMap.get(trader) || 0) + amountTrb);
        sellVirtualMap.set(trader, (sellVirtualMap.get(trader) || 0) + amountVirtual);
      }

      txCountMap.set(trader, (txCountMap.get(trader) || 0) + 1);
      processed++;
      lastProcessedBlock = entry.blockNumber ?? lastProcessedBlock;
    }

    if (
      buyTrbMap.size > 0 ||
      sellTrbMap.size > 0 ||
      buyVirtualMap.size > 0 ||
      sellVirtualMap.size > 0
    ) {
      await updateLeaderboard({
        buyTrbMap,
        sellTrbMap,
        buyVirtualMap,
        sellVirtualMap,
        txCountMap,
      });
    }

    // Persist aggregate counters for UI (safe even when no trades)
    try {
      const metaKey = 'trb-lp-leaderboard:meta';
      const meta = (await redis.hgetall(metaKey)) || {};
      const prevTransfers = parseInt(meta.totalTransfers || '0', 10) || 0;
      await redis.hset(metaKey, {
        totalTransfers: (prevTransfers + processed).toString(),
        lastProcessedTransfers: processed.toString(),
      });
    } catch (e) {
      console.warn('[TRB] Failed updating meta counters:', e?.message || e);
    }

    // If we stopped early, only advance up to the last processed block.
    const effectiveToBlock = lastProcessedBlock ? BigInt(lastProcessedBlock) : toBlock;
    const nextBlock = effectiveToBlock + 1n;

    const updatedJob = await updateTrbLpJobProgress({
      currentBlock: nextBlock,
      stats: {
        lastRangeFrom: fromBlock.toString(),
        lastRangeTo: effectiveToBlock.toString(),
        lastPlannedTo: toBlock.toString(),
        lastProcessedTransfers: processed.toString(),
        lastSkippedDuplicate: skippedDuplicate.toString(),
      },
    });

    await redis.hset('trb-lp-leaderboard:meta', {
      currentBlock: nextBlock.toString(),
      startBlock: job.startBlock,
      endBlock: job.endBlock || '',
      lastScannedFrom: fromBlock.toString(),
      lastScannedTo: effectiveToBlock.toString(),
    });

    return {
      ok: true,
      scanned: {
        fromBlock: fromBlock.toString(),
        toBlock: effectiveToBlock.toString(),
        plannedToBlock: toBlock.toString(),
        logCount: trbLogs.length + virtualLogs.length,
        processedTransfers: processed,
        skippedDuplicate,
        stoppedEarly: effectiveToBlock !== toBlock,
      },
      currentNetworkBlock: currentNetworkBlock.toString(),
      job: updatedJob,
    };
  } catch (err) {
    await failTrbLpJob(err?.message || 'Unknown error');
    throw err;
  }
}
