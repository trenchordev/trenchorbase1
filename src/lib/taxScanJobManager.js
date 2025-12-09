/**
 * Tax Scan Job Manager
 * Redis-based background job system for continuous tax scanning
 * Designed to work within Vercel's timeout limits
 */

import { redis } from './redis';

const JOB_PREFIX = 'tax-scan-job';
const ACTIVE_JOBS_SET = 'tax-scan-jobs:active';
const BLOCKS_PER_SCAN = 5; // Her cron çalışmasında kaç blok taranacak
const MAX_BLOCKS_PER_CAMPAIGN = 2940; // 98 dakika * 30 blok/dakika
const BASE_BLOCK_TIME = 2; // Base network: ~2 saniye/blok

/**
 * Create a new auto-scan job
 */
export async function createScanJob({
  campaignId,
  targetToken,
  taxWallet,
  name,
  startBlock,
  logoUrl,
}) {
  const endBlock = BigInt(startBlock) + BigInt(MAX_BLOCKS_PER_CAMPAIGN);
  
  const job = {
    campaignId,
    targetToken: targetToken.toLowerCase(),
    taxWallet: taxWallet.toLowerCase(),
    name: name || campaignId,
    logoUrl: logoUrl || '',
    startBlock: startBlock.toString(),
    currentBlock: startBlock.toString(),
    endBlock: endBlock.toString(),
    status: 'active',
    createdAt: Date.now(),
    lastScanAt: Date.now(),
    totalScanned: 0,
    errorCount: 0,
    lastError: null,
  };

  // Store job data
  await redis.set(`${JOB_PREFIX}:${campaignId}`, job);
  
  // Add to active jobs set
  await redis.sadd(ACTIVE_JOBS_SET, campaignId);

  console.log(`[Job Manager] Created job for ${campaignId}: ${startBlock} → ${endBlock}`);
  
  return job;
}

/**
 * Get all active scan jobs
 */
export async function getActiveJobs() {
  const campaignIds = await redis.smembers(ACTIVE_JOBS_SET);
  
  if (!campaignIds || campaignIds.length === 0) {
    return [];
  }

  const jobs = [];
  for (const id of campaignIds) {
    const job = await redis.get(`${JOB_PREFIX}:${id}`);
    if (job) {
      jobs.push(job);
    }
  }

  return jobs;
}

/**
 * Get specific job by campaignId
 */
export async function getJob(campaignId) {
  return await redis.get(`${JOB_PREFIX}:${campaignId}`);
}

/**
 * Update job progress
 */
export async function updateJobProgress(campaignId, currentBlock, stats = {}) {
  const job = await getJob(campaignId);
  if (!job) return null;

  const updatedJob = {
    ...job,
    currentBlock: currentBlock.toString(),
    lastScanAt: Date.now(),
    totalScanned: (parseInt(job.totalScanned) || 0) + (stats.scannedBlocks || 0),
    ...stats,
  };

  // Check if job is complete
  if (BigInt(currentBlock) >= BigInt(job.endBlock)) {
    updatedJob.status = 'completed';
    updatedJob.completedAt = Date.now();
    
    // Remove from active set
    await redis.srem(ACTIVE_JOBS_SET, campaignId);
    
    console.log(`[Job Manager] Job ${campaignId} COMPLETED at block ${currentBlock}`);
  }

  await redis.set(`${JOB_PREFIX}:${campaignId}`, updatedJob);
  
  return updatedJob;
}

/**
 * Mark job as failed
 */
export async function failJob(campaignId, error) {
  const job = await getJob(campaignId);
  if (!job) return null;

  const errorCount = (parseInt(job.errorCount) || 0) + 1;
  
  // After 10 consecutive errors, pause the job
  if (errorCount >= 10) {
    await redis.srem(ACTIVE_JOBS_SET, campaignId);
    
    await redis.set(`${JOB_PREFIX}:${campaignId}`, {
      ...job,
      status: 'failed',
      errorCount,
      lastError: error,
      failedAt: Date.now(),
    });
    
    console.error(`[Job Manager] Job ${campaignId} FAILED after 10 errors:`, error);
    return null;
  }

  // Increment error count but keep job active
  await redis.set(`${JOB_PREFIX}:${campaignId}`, {
    ...job,
    errorCount,
    lastError: error,
    lastErrorAt: Date.now(),
  });

  return job;
}

/**
 * Manually stop a job
 */
export async function stopJob(campaignId) {
  const job = await getJob(campaignId);
  if (!job) return null;

  await redis.srem(ACTIVE_JOBS_SET, campaignId);
  
  await redis.set(`${JOB_PREFIX}:${campaignId}`, {
    ...job,
    status: 'stopped',
    stoppedAt: Date.now(),
  });

  console.log(`[Job Manager] Job ${campaignId} manually stopped`);
  
  return job;
}

/**
 * Resume a stopped job
 */
export async function resumeJob(campaignId) {
  const job = await getJob(campaignId);
  if (!job) return null;

  // Only resume if not completed
  if (BigInt(job.currentBlock) >= BigInt(job.endBlock)) {
    return { error: 'Job already completed' };
  }

  await redis.sadd(ACTIVE_JOBS_SET, campaignId);
  
  await redis.set(`${JOB_PREFIX}:${campaignId}`, {
    ...job,
    status: 'active',
    resumedAt: Date.now(),
    errorCount: 0, // Reset error count on resume
  });

  console.log(`[Job Manager] Job ${campaignId} resumed`);
  
  return job;
}

/**
 * Delete a job completely
 */
export async function deleteJob(campaignId) {
  await redis.srem(ACTIVE_JOBS_SET, campaignId);
  await redis.del(`${JOB_PREFIX}:${campaignId}`);
  
  console.log(`[Job Manager] Job ${campaignId} deleted`);
}

/**
 * Get job statistics
 */
export async function getJobStats(campaignId) {
  const job = await getJob(campaignId);
  if (!job) return null;

  const totalBlocks = BigInt(job.endBlock) - BigInt(job.startBlock);
  const scannedBlocks = BigInt(job.currentBlock) - BigInt(job.startBlock);
  const remainingBlocks = BigInt(job.endBlock) - BigInt(job.currentBlock);
  
  const progressPercent = totalBlocks > 0n 
    ? Number((scannedBlocks * 100n) / totalBlocks) 
    : 0;

  const estimatedRemainingMinutes = Number(remainingBlocks) * BASE_BLOCK_TIME / 60;

  return {
    ...job,
    stats: {
      totalBlocks: totalBlocks.toString(),
      scannedBlocks: scannedBlocks.toString(),
      remainingBlocks: remainingBlocks.toString(),
      progressPercent: progressPercent.toFixed(2),
      estimatedRemainingMinutes: estimatedRemainingMinutes.toFixed(1),
    }
  };
}

/**
 * Get next blocks to scan for a job (with safety limits)
 */
export function getNextScanRange(job, currentNetworkBlock) {
  const jobCurrentBlock = BigInt(job.currentBlock);
  const jobEndBlock = BigInt(job.endBlock);
  const networkBlock = BigInt(currentNetworkBlock);

  // Calculate next scan range
  let scanFrom = jobCurrentBlock;
  let scanTo = jobCurrentBlock + BigInt(BLOCKS_PER_SCAN);

  // Don't scan beyond job end block
  if (scanTo > jobEndBlock) {
    scanTo = jobEndBlock;
  }

  // Don't scan beyond current network block (avoid future blocks)
  if (scanTo > networkBlock) {
    scanTo = networkBlock;
  }

  // If we're already at or past the end, return null
  if (scanFrom >= jobEndBlock || scanFrom >= networkBlock) {
    return null;
  }

  return {
    from: scanFrom,
    to: scanTo,
    blockCount: Number(scanTo - scanFrom),
  };
}
