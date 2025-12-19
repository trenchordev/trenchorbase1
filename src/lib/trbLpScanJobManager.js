/**
 * TRB LP-like Contract Scan Job Manager
 *
 * Tracks buy/sell-like transfers for TRB by scanning TRB Transfer events
 * where one side is the LP-like contract address.
 *
 * Designed for short serverless runtimes (Vercel Hobby) and external cron-job.org scheduling.
 */

import { redis } from './redis';

const JOB_KEY = 'trb-lp-scan-job:trb';

export const DEFAULT_BLOCKS_PER_SCAN = 200; // safe default for Hobby
export const DEFAULT_CONFIRMATIONS = 2;

export async function getTrbLpJob() {
  return await redis.get(JOB_KEY);
}

export async function createTrbLpJob({
  startBlock,
  endBlock,
  blocksPerScan,
}) {
  const start = BigInt(startBlock);
  const end = endBlock ? BigInt(endBlock) : null;

  const job = {
    id: 'trb',
    startBlock: start.toString(),
    currentBlock: start.toString(),
    endBlock: end ? end.toString() : null,
    blocksPerScan: (blocksPerScan || DEFAULT_BLOCKS_PER_SCAN).toString(),
    status: 'active',
    createdAt: Date.now(),
    lastScanAt: null,
    lastError: null,
    errorCount: 0,
  };

  await redis.set(JOB_KEY, job);
  return job;
}

export async function updateTrbLpJobProgress({
  currentBlock,
  stats,
}) {
  const job = await getTrbLpJob();
  if (!job) return null;

  const updated = {
    ...job,
    currentBlock: currentBlock.toString(),
    lastScanAt: Date.now(),
    lastError: null,
    ...(stats || {}),
  };

  if (job.endBlock && BigInt(currentBlock) >= BigInt(job.endBlock)) {
    updated.status = 'completed';
    updated.completedAt = Date.now();
  }

  await redis.set(JOB_KEY, updated);
  return updated;
}

export async function stopTrbLpJob() {
  const job = await getTrbLpJob();
  if (!job) return null;

  const updated = {
    ...job,
    status: 'stopped',
    stoppedAt: Date.now(),
  };

  await redis.set(JOB_KEY, updated);
  return updated;
}

export async function resumeTrbLpJob() {
  const job = await getTrbLpJob();
  if (!job) return null;

  if (job.status === 'completed') {
    return { ...job, error: 'Job already completed' };
  }

  const updated = {
    ...job,
    status: 'active',
    resumedAt: Date.now(),
    lastError: null,
    errorCount: 0,
  };

  await redis.set(JOB_KEY, updated);
  return updated;
}

export async function failTrbLpJob(errorMessage) {
  const job = await getTrbLpJob();
  if (!job) return null;

  const errorCount = (parseInt(job.errorCount || '0', 10) || 0) + 1;
  const updated = {
    ...job,
    status: errorCount >= 10 ? 'failed' : job.status,
    errorCount,
    lastError: errorMessage,
    lastErrorAt: Date.now(),
  };

  await redis.set(JOB_KEY, updated);
  return updated;
}

export function getNextScanRange(job, currentNetworkBlock, confirmations = DEFAULT_CONFIRMATIONS) {
  const jobCurrent = BigInt(job.currentBlock);
  const safeNetworkBlock = BigInt(currentNetworkBlock) - BigInt(confirmations);

  // Determine max block we are allowed to scan to
  let scanEnd = safeNetworkBlock;
  if (job.endBlock) {
    const endBlock = BigInt(job.endBlock);
    if (endBlock < scanEnd) scanEnd = endBlock;
  }

  if (jobCurrent > scanEnd) {
    return null;
  }

  const blocksPerScan = BigInt(parseInt(job.blocksPerScan || DEFAULT_BLOCKS_PER_SCAN.toString(), 10) || DEFAULT_BLOCKS_PER_SCAN);
  const toBlock = jobCurrent + blocksPerScan - 1n;

  return {
    fromBlock: jobCurrent,
    toBlock: toBlock > scanEnd ? scanEnd : toBlock,
  };
}
