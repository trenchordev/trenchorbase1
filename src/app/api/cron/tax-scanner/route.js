/**
 * Tax Scanner Cron Worker
 * Vercel Cron tarafından düzenli olarak çağrılır (her 1 dakika)
 * Her çalışmada 5-10 blok tarar, timeout'a takılmaz
 */

import { NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { redis } from '@/lib/redis';
import { getActiveJobs, updateJobProgress, failJob, getNextScanRange } from '@/lib/taxScanJobManager';

export const maxDuration = 60; // Vercel Pro max duration
export const dynamic = 'force-dynamic';

const VIRTUAL_ADDRESS = '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * Verify cron secret for security
 */
function verifyCronSecret(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.warn('[Cron] CRON_SECRET not set, allowing request (dev mode)');
    return true;
  }

  if (authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  console.error('[Cron] Unauthorized request');
  return false;
}

/**
 * Main cron handler - called every minute
 */
export async function GET(request) {
  const startTime = Date.now();
  
  // Security check
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Cron] Tax scanner worker started');

  try {
    // Get RPC client
    let rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
    const infuraKey = process.env.INFURA_API_KEY || process.env.NEXT_PUBLIC_INFURA_API_KEY;

    if (infuraKey) {
      rpcUrl = `https://base-mainnet.infura.io/v3/${infuraKey}`;
    }

    const client = createPublicClient({
      chain: base,
      transport: http(rpcUrl, {
        batch: true,
        retryCount: 3,
        retryDelay: 1000,
      }),
    });

    // Get current network block
    const currentNetworkBlock = await client.getBlockNumber();
    console.log(`[Cron] Current network block: ${currentNetworkBlock}`);

    // Get all active jobs
    const activeJobs = await getActiveJobs();
    
    if (activeJobs.length === 0) {
      console.log('[Cron] No active jobs to process');
      return NextResponse.json({ 
        message: 'No active jobs',
        executionTime: Date.now() - startTime
      });
    }

    console.log(`[Cron] Processing ${activeJobs.length} active job(s)`);

    const results = [];

    // Process each job
    for (const job of activeJobs) {
      try {
        const jobStartTime = Date.now();
        
        // Get next scan range
        const scanRange = getNextScanRange(job, currentNetworkBlock);
        
        if (!scanRange) {
          console.log(`[Cron] Job ${job.campaignId} has no blocks to scan (completed or caught up)`);
          
          // Mark as completed if we've reached the end block
          if (BigInt(job.currentBlock) >= BigInt(job.endBlock)) {
            await updateJobProgress(job.campaignId, job.endBlock);
          }
          
          continue;
        }

        console.log(`[Cron] Job ${job.campaignId}: Scanning blocks ${scanRange.from} → ${scanRange.to}`);

        // Scan for tax transfers in this range
        const taxData = await scanBlockRangeForTax(
          client,
          job.targetToken,
          job.taxWallet,
          scanRange.from,
          scanRange.to
        );

        console.log(`[Cron] Job ${job.campaignId}: Scan complete - Found ${taxData.userTaxPaid.size} users, ${taxData.validCount} valid, ${taxData.skippedCount} skipped`);

        // Update leaderboard with new data
        if (taxData.userTaxPaid.size > 0) {
          console.log(`[Cron] Job ${job.campaignId}: Updating leaderboard...`);
          await updateLeaderboard(job.campaignId, taxData.userTaxPaid, job);
          console.log(`[Cron] Job ${job.campaignId}: Leaderboard updated!`);
        } else {
          console.log(`[Cron] Job ${job.campaignId}: No tax data to update`);
        }

        // Update job progress
        await updateJobProgress(job.campaignId, scanRange.to, {
          scannedBlocks: scanRange.blockCount,
          validTxCount: taxData.validCount,
          skippedTxCount: taxData.skippedCount,
        });

        const jobExecutionTime = Date.now() - jobStartTime;

        results.push({
          campaignId: job.campaignId,
          scannedBlocks: `${scanRange.from} → ${scanRange.to}`,
          blockCount: scanRange.blockCount,
          usersFound: taxData.userTaxPaid.size,
          validTxCount: taxData.validCount,
          executionTime: jobExecutionTime,
          progress: `${job.currentBlock} / ${job.endBlock}`,
        });

      } catch (error) {
        console.error(`[Cron] Error processing job ${job.campaignId}:`, error.message);
        console.error(`[Cron] Stack:`, error.stack);
        await failJob(job.campaignId, error.message);
        
        results.push({
          campaignId: job.campaignId,
          error: error.message,
          stack: error.stack,
        });
      }
    }

    const totalExecutionTime = Date.now() - startTime;
    
    console.log(`[Cron] Worker completed in ${totalExecutionTime}ms`);

    return NextResponse.json({
      success: true,
      processedJobs: results.length,
      results,
      currentBlock: currentNetworkBlock.toString(),
      executionTime: totalExecutionTime,
    });

  } catch (error) {
    console.error('[Cron] Fatal error:', error);
    return NextResponse.json({
      error: error.message,
      executionTime: Date.now() - startTime
    }, { status: 500 });
  }
}

/**
 * Scan a block range for tax payments
 */
async function scanBlockRangeForTax(client, targetToken, taxWallet, fromBlock, toBlock) {
  const taxTransferLogs = [];
  
  try {
    console.log(`[Scan] Fetching VIRTUAL transfers from block ${fromBlock} to ${toBlock} to wallet ${taxWallet}`);
    
    // Fetch VIRTUAL token transfers to tax wallet
    const logs = await client.request({
      method: 'eth_getLogs',
      params: [{
        address: VIRTUAL_ADDRESS,
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${toBlock.toString(16)}`,
        topics: [
          TRANSFER_TOPIC,
          null,
          `0x000000000000000000000000${taxWallet.slice(2)}`,
        ],
      }],
    });

    console.log(`[Scan] Found ${logs.length} VIRTUAL transfer logs`);
    taxTransferLogs.push(...logs);

  } catch (error) {
    console.error(`[Scan] RPC Error fetching logs ${fromBlock}-${toBlock}:`, error.message);
    throw error;
  }

  // Filter by target token interaction
  const userTaxPaid = new Map();
  let validCount = 0;
  let skippedCount = 0;

  console.log(`[Scan] Processing ${taxTransferLogs.length} transactions for target token ${targetToken}`);

  for (const log of taxTransferLogs) {
    const txHash = log.transactionHash;
    const taxAmount = BigInt(log.data);

    try {
      const receipt = await client.getTransactionReceipt({ hash: txHash });
      const userAddress = receipt.from.toLowerCase();

      // Check if transaction contains target token transfer
      let hasTargetTokenInteraction = false;

      for (const txLog of receipt.logs) {
        if (txLog.topics[0] !== TRANSFER_TOPIC) continue;

        const tokenAddress = txLog.address.toLowerCase();

        if (tokenAddress === targetToken.toLowerCase()) {
          hasTargetTokenInteraction = true;
          break;
        }
      }

      if (hasTargetTokenInteraction) {
        const currentTax = userTaxPaid.get(userAddress) || 0n;
        userTaxPaid.set(userAddress, currentTax + taxAmount);
        validCount++;
      } else {
        skippedCount++;
      }

      // Small delay to prevent rate limiting
      if (validCount % 10 === 0) {
        await new Promise(r => setTimeout(r, 50));
      }

    } catch (err) {
      console.error(`[Scan] Error processing tx ${txHash}:`, err.message);
      // Continue with other transactions
    }
  }

  return {
    userTaxPaid,
    validCount,
    skippedCount,
  };
}

/**
 * Update leaderboard with new tax data (incremental)
 */
async function updateLeaderboard(campaignId, userTaxPaid, job) {
  const redisKey = `tax-leaderboard:${campaignId}`;
  const metaKey = `tax-leaderboard-meta:${campaignId}`;

  // Incrementally add/update scores in Redis sorted set
  for (const [address, taxPaid] of userTaxPaid.entries()) {
    const taxPaidVirtual = Number(taxPaid) / 1e18;
    
    // Get existing score
    const existingScore = await redis.zscore(redisKey, address);
    
    // Add to existing or create new
    const newScore = existingScore ? parseFloat(existingScore) + taxPaidVirtual : taxPaidVirtual;
    
    await redis.zadd(redisKey, {
      score: newScore,
      member: address,
    });
  }

  // Update metadata
  const leaderboardSize = await redis.zcard(redisKey);
  
  // Calculate total by summing all scores
  let totalTaxPaid = 0;
  const allEntries = await redis.zrange(redisKey, 0, -1, { withScores: true });
  
  if (allEntries && allEntries.length > 0) {
    for (let i = 0; i < allEntries.length; i += 2) {
      const score = parseFloat(allEntries[i + 1]);
      totalTaxPaid += score;
    }
  }

  await redis.hset(metaKey, {
    campaignId,
    name: job.name,
    targetToken: job.targetToken,
    taxWallet: job.taxWallet,
    logoUrl: job.logoUrl,
    lastUpdated: Date.now().toString(),
    totalUsers: leaderboardSize.toString(),
    totalTaxPaid: totalTaxPaid.toFixed(4),
    currentBlock: job.currentBlock,
    endBlock: job.endBlock,
    status: job.status,
  });
}
