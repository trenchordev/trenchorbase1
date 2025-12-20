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

    // FAST SCAN PARAMETERS - Conservative to avoid rate limits
    // Reduced chunk sizes for reliability
    let CHUNK_SIZE = infuraKey ? 200n : 25n; // Smaller chunks to prevent rate limit errors
    
    console.log(`\n🚀 ========== FAST TAX SCAN STARTING ==========`);
    console.log(`🎯 Campaign: ${name} (ID: ${campaignId})`);
    console.log(`🎯 Start Block: ${fromBlock}`);
    console.log(`🏁 End Block: ${toBlock}`);
    console.log(`📊 Total Blocks to Scan: ${totalBlocks}`);
    console.log(`📊 Chunk Size: ${CHUNK_SIZE}`);
    console.log(`⚡ RPC: ${infuraKey ? 'Infura (Premium)' : 'Public'}`);
    console.log(`================================================\n`);
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
        
        // Progressive delay - more delay if finding many logs
        const delayTime = logs.length > 10 ? 200 : logs.length > 5 ? 100 : 50;
        await new Promise(r => setTimeout(r, delayTime));

      } catch (err) {
        const errorMsg = err.message || String(err);
        
        if (errorMsg.includes('429') || errorMsg.includes('Too Many Requests')) {
          console.warn(`[Fast Scan] Rate limit hit, backing off for 3 seconds...`);
          await new Promise(r => setTimeout(r, 3000));
          // Don't advance currentFrom, retry same chunk
        } else if (errorMsg.includes('block range') || errorMsg.includes('limit')) {
          console.warn(`[Fast Scan] Chunk too large (${CHUNK_SIZE}), reducing size...`);
          CHUNK_SIZE = CHUNK_SIZE / 2n;
          if (CHUNK_SIZE < 5n) CHUNK_SIZE = 5n;
          console.warn(`[Fast Scan] New chunk size: ${CHUNK_SIZE}`);
          // Don't advance - will retry with smaller chunk
        } else {
          console.error(`❌ [Fast Scan] Error fetching logs: ${errorMsg}`);
          console.error(`⚠️ SKIPPING BLOCKS: ${currentFrom} to ${currentTo} (${currentTo - currentFrom} blocks)`);
          console.error(`🚨 THIS MEANS SOME TRANSACTIONS MAY BE MISSING!`);
          console.error(`💡 Suggestion: Check RPC status or retry scan`);
          currentFrom = currentTo; // Skip problematic chunk only as last resort
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

      // Get transaction receipt with retry
      let receipt;
      let receiptRetries = 0;
      const MAX_RECEIPT_RETRIES = 10; // Increased for reliability
      
      while (!receipt && receiptRetries < MAX_RECEIPT_RETRIES) {
        try {
          receipt = await client.getTransactionReceipt({ hash: txHash });
          
          if (!receipt || !receipt.from) {
            receiptRetries++;
            if (receiptRetries >= MAX_RECEIPT_RETRIES) {
              console.error(`❌ [Fast Scan] Failed to get receipt for ${txHash} after ${MAX_RECEIPT_RETRIES} retries`);
              skippedCount++;
              break;
            }
            console.warn(`⚠️ [Fast Scan] Invalid receipt for ${txHash}, retry ${receiptRetries}/${MAX_RECEIPT_RETRIES}`);
            await new Promise(r => setTimeout(r, 200 * receiptRetries));
            continue;
          }
          break; // Got valid receipt
        } catch (err) {
          receiptRetries++;
          const errMsg = err.message || String(err);
          
          if (errMsg.includes('429') || errMsg.includes('Too Many Requests')) {
            console.warn(`[Fast Scan] Rate limit on receipt fetch, waiting...`);
            await new Promise(r => setTimeout(r, 2000));
          } else if (receiptRetries >= MAX_RECEIPT_RETRIES) {
            console.error(`[Fast Scan] Error fetching receipt for ${txHash}: ${errMsg}`);
            skippedCount++;
            break;
          } else {
            await new Promise(r => setTimeout(r, 300 * receiptRetries));
          }
        }
      }
      
      if (!receipt || !receipt.from) continue;

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
    }

    console.log(`[Fast Scan] Phase 2 complete: ${validCount} valid, ${skippedCount} skipped`);

    // INCREMENTAL UPDATE - Add to existing leaderboard instead of replacing
    const redisKey = `tax-leaderboard:${campaignId}`;
    const metaKey = `tax-leaderboard-meta:${campaignId}`;

    console.log(`[Fast Scan] Incrementally updating leaderboard with ${userTaxPaid.size} users...`);

    // Update each user's score (add to existing or create new)
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

    // Get final leaderboard for response
    const leaderboardData = await redis.zrange(redisKey, 0, -1, { withScores: true, rev: true });
    const leaderboard = [];
    for (let i = 0; i < leaderboardData.length; i += 2) {
      leaderboard.push({
        address: leaderboardData[i],
        taxPaidVirtual: parseFloat(leaderboardData[i + 1]),
      });
    }

    // Calculate total tax from all users (not just new ones)
    const totalTaxPaid = leaderboard.reduce((sum, e) => sum + e.taxPaidVirtual, 0).toFixed(4);
    const totalUsers = leaderboard.length;
    const now = Date.now();

    await redis.hset(metaKey, {
      campaignId,
      name,
      targetToken: targetToken.toLowerCase(),
      taxWallet: taxWallet.toLowerCase(),
      lastUpdated: now.toString(),
      totalUsers: totalUsers.toString(),
      totalTaxPaid: totalTaxPaid,
      startBlock: fromBlock.toString(),
      endBlock: currentFrom.toString(),
      validTxCount: validCount.toString(),
      skippedTxCount: skippedCount.toString(),
      scanType: 'fast',
      lastScanIncremental: 'true',
    });

    await redis.set(`tax-campaign-config:${campaignId}`, {
      ...config,
      lastScanned: now,
      totalUsers: totalUsers,
      totalTax: totalTaxPaid,
    });

    const totalExecutionTime = Date.now() - startTime;
    const wasPartialScan = currentFrom < toBlock;
    const actualScannedBlocks = currentFrom - fromBlock;

    console.log(`\n🏁 ========== FAST SCAN COMPLETE ==========`);
    console.log(`✅ Requested Range: ${fromBlock} - ${toBlock} (${totalBlocks} blocks)`);
    console.log(`📦 Actually Scanned: ${fromBlock} - ${currentFrom} (${actualScannedBlocks} blocks)`);
    console.log(`📊 Coverage: ${Math.round((Number(actualScannedBlocks) / Number(totalBlocks)) * 100)}%`);
    console.log(`👥 Total Users: ${totalUsers}`);
    console.log(`💰 Total Tax: ${totalTaxPaid} VIRTUAL`);
    console.log(`✓ Valid Transactions: ${validCount}`);
    console.log(`⚡ Speed: ${Math.round(Number(actualScannedBlocks) / (totalExecutionTime / 1000))} blocks/sec`);
    console.log(`⏱️ Execution Time: ${totalExecutionTime}ms`);
    if (wasPartialScan) {
      console.log(`⚠️ PARTIAL SCAN: Stopped at block ${currentFrom} (${toBlock - currentFrom} blocks remaining)`);
    }
    console.log(`==========================================\n`);

    return NextResponse.json({
      success: true,
      scanType: 'fast',
      partial: wasPartialScan,
      warning: wasPartialScan ? 'Partial scan due to time limit. Run again to continue.' : null,
      stats: {
        totalUsers: totalUsers,
        totalTaxPaid,
        newUsersThisScan: userTaxPaid.size,
        validTxCount: validCount,
        skippedTxCount: skippedCount,
        processedTxCount: validCount + skippedCount,
        totalTxFound: taxTransferLogs.length,
        scannedBlocks: `${fromBlock} - ${currentFrom}`,
        requestedBlocks: `${fromBlock} - ${toBlock}`,
        actualBlocksScanned: Number(actualScannedBlocks),
        totalBlocksRequested: Number(totalBlocks),
        coveragePercentage: Math.round((Number(actualScannedBlocks) / Number(totalBlocks)) * 100),
        executionTime: `${totalExecutionTime}ms`,
        blocksPerSecond: Math.round(Number(currentFrom - fromBlock) / (totalExecutionTime / 1000)),
        isIncremental: true,
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
