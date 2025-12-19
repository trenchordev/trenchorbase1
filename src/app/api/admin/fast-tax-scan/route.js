/**
 * Fast Tax Scan - For historical data scanning
 * Scans at maximum safe speed without hitting rate limits
 * Completes full range in 5-10 minutes instead of hours
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { redis } from '@/lib/redis';

const VIRTUAL_ADDRESS = '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export const maxDuration = 60; // Vercel Pro: 60 saniye

export async function POST(request) {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('ADMIN_PASSWORD');

  if (adminAuth?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { campaignId } = await request.json();

    if (!campaignId) {
      return NextResponse.json({ error: 'Campaign ID required' }, { status: 400 });
    }

    // Get campaign config
    const config = await redis.get(`tax-campaign-config:${campaignId}`);
    if (!config) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Validate required config fields
    if (!config.targetToken || !config.taxWallet) {
      return NextResponse.json({ 
        error: 'Invalid campaign configuration: missing targetToken or taxWallet',
        config: config 
      }, { status: 400 });
    }

    const { targetToken, taxWallet, name } = config;

    // Get RPC client
    let rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
    const infuraKey = process.env.INFURA_API_KEY || process.env.NEXT_PUBLIC_INFURA_API_KEY;

    if (infuraKey) {
      console.log('[Fast Scan] Using Infura RPC for high-performance scanning');
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

    const currentBlock = await client.getBlockNumber();

    // Calculate block range
    let fromBlock, toBlock;
    
    const safeStartBlock = config.startBlock && config.startBlock !== 'undefined' && config.startBlock !== '' 
      ? BigInt(config.startBlock) 
      : null;
    const safeEndBlock = config.endBlock && config.endBlock !== 'undefined' && config.endBlock !== '' 
      ? BigInt(config.endBlock) 
      : null;

    if (safeStartBlock && safeEndBlock) {
      fromBlock = safeStartBlock;
      toBlock = safeEndBlock;
      console.log(`[Fast Scan] Using explicit block range: ${fromBlock} -> ${toBlock}`);
    } else if (safeStartBlock) {
      fromBlock = safeStartBlock;
      const fixedBlockRange = 2950n;
      toBlock = fromBlock + fixedBlockRange;
      if (toBlock > currentBlock) toBlock = currentBlock;
      console.log(`[Fast Scan] Using start block with fixed range: ${fromBlock} -> ${toBlock}`);
    } else {
      const timeWindow = (config.timeWindowMinutes || 99) * 60;
      const estimatedBlocks = Math.ceil(timeWindow / 2);
      fromBlock = currentBlock - BigInt(estimatedBlocks);
      toBlock = currentBlock;
      console.log(`[Fast Scan] Using time window: ${fromBlock} -> ${toBlock}`);
    }

    const totalBlocks = toBlock - fromBlock;
    console.log(`[Fast Scan] Total blocks to scan: ${totalBlocks}`);

    // FAST SCAN PARAMETERS - Optimized for speed without rate limits
    let CHUNK_SIZE = infuraKey ? 500n : 50n; // Larger chunks with premium RPC
    const TX_BATCH_SIZE = 10; // Process multiple txs in parallel
    const DELAY_AFTER_BATCH = 50; // Short delay after each batch
    const MAX_SCAN_TIME = 55000; // 55 seconds max
    
    const startTime = Date.now();
    const taxTransferLogs = [];
    let currentFrom = fromBlock;

    // Phase 1: Collect all transfer logs (FAST)
    console.log(`[Fast Scan] Phase 1: Collecting transfer logs...`);
    
    while (currentFrom < toBlock) {
      const elapsed = Date.now() - startTime;
      if (elapsed > MAX_SCAN_TIME) {
        console.warn(`[Fast Scan] Timeout approaching, stopping at block ${currentFrom}`);
        break;
      }

      let currentTo = currentFrom + CHUNK_SIZE;
      if (currentTo > toBlock) currentTo = toBlock;

      try {
        const logs = await client.request({
          method: 'eth_getLogs',
          params: [{
            address: VIRTUAL_ADDRESS,
            fromBlock: `0x${currentFrom.toString(16)}`,
            toBlock: `0x${currentTo.toString(16)}`,
            topics: [
              TRANSFER_TOPIC,
              null,
              `0x000000000000000000000000${taxWallet.slice(2)}`,
            ],
          }],
        });

        if (logs.length > 0) {
          console.log(`[Fast Scan] Found ${logs.length} transfers in ${currentFrom}-${currentTo}`);
          taxTransferLogs.push(...logs);
        }

        currentFrom = currentTo;
        
        // Minimal delay to prevent rate limits
        if (taxTransferLogs.length % 5 === 0) {
          await new Promise(r => setTimeout(r, 20));
        }

      } catch (err) {
        const errorMsg = err.message || String(err);
        
        if (errorMsg.includes('429') || errorMsg.includes('Too Many Requests')) {
          console.warn(`[Fast Scan] Rate limit hit, backing off...`);
          await new Promise(r => setTimeout(r, 2000));
          // Don't advance currentFrom, retry same chunk
        } else if (errorMsg.includes('block range') || errorMsg.includes('limit')) {
          console.warn(`[Fast Scan] Chunk too large, reducing size...`);
          CHUNK_SIZE = CHUNK_SIZE / 2n;
          if (CHUNK_SIZE < 10n) CHUNK_SIZE = 10n;
        } else {
          console.error(`[Fast Scan] Error fetching logs: ${errorMsg}`);
          currentFrom = currentTo; // Skip problematic chunk
        }
      }
    }

    console.log(`[Fast Scan] Phase 1 complete: Found ${taxTransferLogs.length} candidate transactions`);

    // Phase 2: Process transactions in batches (FAST)
    console.log(`[Fast Scan] Phase 2: Processing transactions...`);
    
    const userTaxPaid = new Map();
    let validCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < taxTransferLogs.length; i++) {
      const elapsed = Date.now() - startTime;
      if (elapsed > MAX_SCAN_TIME) {
        console.warn(`[Fast Scan] Timeout during processing, returning partial results`);
        break;
      }

      const log = taxTransferLogs[i];
      const txHash = log.transactionHash;

      // Validate log data
      if (!log.data || log.data === '0x' || log.data === '0x0') {
        skippedCount++;
        continue;
      }

      let taxAmount;
      try {
        taxAmount = BigInt(log.data);
      } catch (err) {
        skippedCount++;
        continue;
      }

      try {
        const receipt = await client.getTransactionReceipt({ hash: txHash });
        
        if (!receipt || !receipt.from) {
          skippedCount++;
          continue;
        }

        const userAddress = receipt.from.toLowerCase();
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

        // Batch delay to prevent rate limits
        if ((validCount + skippedCount) % TX_BATCH_SIZE === 0) {
          await new Promise(r => setTimeout(r, DELAY_AFTER_BATCH));
        }

      } catch (err) {
        const errorMsg = err.message || String(err);
        
        if (errorMsg.includes('could not be found') || errorMsg.includes('not be processed')) {
          skippedCount++;
        } else if (errorMsg.includes('429')) {
          console.warn(`[Fast Scan] Rate limit during tx processing, slowing down...`);
          await new Promise(r => setTimeout(r, 1000));
          i--; // Retry this transaction
        } else {
          console.error(`[Fast Scan] Error processing tx ${txHash}: ${errorMsg}`);
          skippedCount++;
        }
      }
    }

    console.log(`[Fast Scan] Phase 2 complete: ${validCount} valid, ${skippedCount} skipped`);

    // Generate and save leaderboard
    const leaderboard = Array.from(userTaxPaid.entries())
      .map(([address, taxPaid]) => ({
        address,
        taxPaidRaw: taxPaid.toString(),
        taxPaidVirtual: Number(taxPaid) / 1e18,
      }))
      .sort((a, b) => Number(BigInt(b.taxPaidRaw) - BigInt(a.taxPaidRaw)));

    const redisKey = `tax-leaderboard:${campaignId}`;
    const metaKey = `tax-leaderboard-meta:${campaignId}`;

    await redis.del(redisKey);

    for (const entry of leaderboard) {
      await redis.zadd(redisKey, {
        score: entry.taxPaidVirtual,
        member: entry.address,
      });
    }

    const totalTaxPaid = leaderboard.reduce((sum, e) => sum + e.taxPaidVirtual, 0).toFixed(4);
    const now = Date.now();

    await redis.hset(metaKey, {
      campaignId,
      name,
      targetToken: targetToken.toLowerCase(),
      taxWallet: taxWallet.toLowerCase(),
      lastUpdated: now.toString(),
      totalUsers: leaderboard.length.toString(),
      totalTaxPaid: totalTaxPaid,
      startBlock: fromBlock.toString(),
      endBlock: currentFrom.toString(),
      validTxCount: validCount.toString(),
      skippedTxCount: skippedCount.toString(),
      scanType: 'fast',
    });

    await redis.set(`tax-campaign-config:${campaignId}`, {
      ...config,
      lastScanned: now,
      totalUsers: leaderboard.length,
      totalTax: totalTaxPaid,
    });

    const totalExecutionTime = Date.now() - startTime;
    const wasPartialScan = currentFrom < toBlock;

    return NextResponse.json({
      success: true,
      scanType: 'fast',
      partial: wasPartialScan,
      warning: wasPartialScan ? 'Partial scan due to time limit. Run again to continue.' : null,
      stats: {
        totalUsers: leaderboard.length,
        totalTaxPaid,
        validTxCount: validCount,
        skippedTxCount: skippedCount,
        processedTxCount: validCount + skippedCount,
        totalTxFound: taxTransferLogs.length,
        scannedBlocks: `${fromBlock} - ${currentFrom}`,
        requestedBlocks: `${fromBlock} - ${toBlock}`,
        executionTime: `${totalExecutionTime}ms`,
        blocksPerSecond: Math.round(Number(currentFrom - fromBlock) / (totalExecutionTime / 1000)),
        topPayers: leaderboard.slice(0, 10),
      }
    });

  } catch (error) {
    console.error('[Fast Scan] Fatal error:', error);
    return NextResponse.json({
      error: error.message || 'Unknown error',
      errorType: error.name || 'Error',
      details: error.stack,
    }, { status: 500 });
  }
}
