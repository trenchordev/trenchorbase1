import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { redis } from '@/lib/redis';

const VIRTUAL_ADDRESS = '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export const maxDuration = 60; // Vercel Pro: 60 saniye, Hobby: 10 saniye

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

    const { targetToken, taxWallet, timeWindowMinutes, startBlock: configStartBlock, endBlock: configEndBlock, name } = config;

    // Prioritize Infura if available for better performance
    let rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
    const infuraKey = process.env.INFURA_API_KEY || process.env.NEXT_PUBLIC_INFURA_API_KEY;

    if (infuraKey) {
      console.log('Using Infura RPC for high-performance scanning');
      rpcUrl = `https://base-mainnet.infura.io/v3/${infuraKey}`;
    }

    const client = createPublicClient({
      chain: base,
      transport: http(rpcUrl, {
        batch: true, // Enable batching for better throughput
        retryCount: 3,
        retryDelay: 1000,
      }),
    });


    // Calculate block range
    const currentBlock = await client.getBlockNumber();
    let fromBlock, toBlock;

    // Safely parse block numbers with validation
    const safeStartBlock = configStartBlock && configStartBlock !== 'undefined' && configStartBlock !== '' 
      ? BigInt(configStartBlock) 
      : null;
    const safeEndBlock = configEndBlock && configEndBlock !== 'undefined' && configEndBlock !== '' 
      ? BigInt(configEndBlock) 
      : null;

    if (safeStartBlock && safeEndBlock) {
      // Use explicit block range - FIXED RANGE
      fromBlock = safeStartBlock;
      toBlock = safeEndBlock;
      console.log(`✅ Using explicit block range: ${fromBlock} -> ${toBlock} (Total: ${toBlock - fromBlock} blocks)`);
    } else if (safeStartBlock) {
      // Start block given but no end block - use fixed 2950 block range for consistency
      fromBlock = safeStartBlock;
      const fixedBlockRange = 2950n; // 98 minutes worth of blocks on Base
      toBlock = fromBlock + fixedBlockRange;
      
      // Don't scan beyond current block
      if (toBlock > currentBlock) {
        toBlock = currentBlock;
      }
      
      console.log(`✅ Using start block with fixed range: ${fromBlock} -> ${toBlock} (Total: ${toBlock - fromBlock} blocks)`);
      console.log(`⚠️ Note: endBlock not specified, using fixed 2950 block range for consistent results`);
    } else {
      // Use time window (default) - will change on each scan
      const timeWindow = (timeWindowMinutes || 99) * 60;
      const estimatedBlocks = Math.ceil(timeWindow / 2); // Base: ~2 saniye/blok
      fromBlock = currentBlock - BigInt(estimatedBlocks);
      toBlock = currentBlock;
      console.log(`⚠️ Using dynamic time window: ${fromBlock} -> ${toBlock} (${estimatedBlocks} blocks)`);
      console.log(`⚠️ Warning: Results will change on each scan! Specify startBlock and endBlock for consistent results.`);
    }

    // Fetch VIRTUAL transfers to tax wallet
    const taxTransferLogs = [];
    const MAX_RETRIES = 5;
    const totalBlocks = toBlock - fromBlock;

    // Adaptive chunk sizing based on total blocks and RPC provider
    let currentChunkSize;
    if (totalBlocks > 10000n) {
      // Very large range - use tiny chunks and warn user
      console.warn(`⚠️ Large block range detected (${totalBlocks} blocks). This may timeout. Consider using AUTO-SCAN instead.`);
      currentChunkSize = infuraKey ? 500n : 5n;
    } else if (totalBlocks > 5000n) {
      currentChunkSize = infuraKey ? 1000n : 10n;
    } else {
      currentChunkSize = infuraKey ? 2000n : 20n;
    }
    
    let currentFrom = fromBlock;
    const MAX_PROCESSING_TIME = 50000; // 50 seconds max (leave 10s buffer for response)
    const startTime = Date.now();

    console.log(`🔍 ========== MANUEL TAX SCAN STARTING ==========`);
    console.log(`🎯 Campaign: ${name} (ID: ${campaignId})`);
    console.log(`🎯 Start Block: ${fromBlock}`);
    console.log(`🏁 End Block: ${toBlock}`);
    console.log(`📊 Total Blocks to Scan: ${totalBlocks}`);
    console.log(`📊 Chunk Size: ${currentChunkSize}`);
    console.log(`⚡ RPC: ${infuraKey ? 'Infura (Premium)' : 'Public'}`);
    console.log(`================================================\n`);

    console.log(`Starting scan from ${fromBlock} to ${toBlock} (Total: ${totalBlocks} blocks, Chunk: ${currentChunkSize})`);

    while (currentFrom < toBlock) {
      // Check timeout to prevent 504 errors
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > MAX_PROCESSING_TIME) {
        console.warn(`⏱️ Approaching timeout limit (${elapsedTime}ms). Stopping scan at block ${currentFrom}.`);
        console.warn(`Processed ${taxTransferLogs.length} transactions so far. Use AUTO-SCAN for large ranges.`);
        break; // Stop scanning but return partial results
      }

      let currentTo = currentFrom + currentChunkSize;
      if (currentTo > toBlock) currentTo = toBlock;

      let success = false;
      let retries = 0;

      while (!success && retries < MAX_RETRIES) {
        try {
          // Log only periodically to avoid spamming server logs
          if (retries > 0 || (Number(currentFrom) % 2000 === 0)) {
            console.log(`Scanning ${currentFrom} -> ${currentTo} (Size: ${currentTo - currentFrom}, Time: ${elapsedTime}ms)`);
          }

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
            console.log(`Found ${logs.length} transfers in blocks ${currentFrom}-${currentTo}`);
            taxTransferLogs.push(...logs);
          }

          currentFrom = currentTo;
          success = true;

          // Optimistic: Increase chunk size slowly if successful, max 2000
          if (currentChunkSize < 2000n) {
            currentChunkSize = currentChunkSize + 50n;
          }

          // Small delay to prevent rate limits
          await new Promise(r => setTimeout(r, 100));

        } catch (err) {
          retries++;
          const errorMessage = err.message || JSON.stringify(err);

          // Alchemy specific: "block range should work" or generic limit errors
          const isBlockRangeError = errorMessage.includes('block range') || errorMessage.includes('limit') || errorMessage.includes('10 block range');

          if (isBlockRangeError) {
            const newSize = currentChunkSize / 5n;
            const safeSize = newSize > 1n ? newSize : 1n;
            console.warn(`Block range limit hit. Reducing size ${currentChunkSize} -> ${safeSize}`);
            currentChunkSize = safeSize;

            // Recalculate range for next attempt (same 'from', smaller 'to')
            currentTo = currentFrom + currentChunkSize;
            if (currentTo > toBlock) currentTo = toBlock;

            // Don't count sizing down as a retry failure (unless we are at size 1)
            if (currentChunkSize > 1n) retries--;

          } else if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
            const waitTime = 2000 * retries;
            console.warn(`Rate limit hit (429). Waiting ${waitTime / 1000}s...`);
            await new Promise(r => setTimeout(r, waitTime));
          } else {
            console.error(`Error fetching logs ${currentFrom}-${currentTo}:`, errorMessage);
            await new Promise(r => setTimeout(r, 1000));
          }

          if (retries >= MAX_RETRIES) {
            console.error(`❌ MAX RETRIES REACHED for chunk ${currentFrom}-${currentTo}`);
            console.error(`⚠️ SKIPPING BLOCKS: ${currentFrom} to ${currentTo} (${currentTo - currentFrom} blocks)`);
            console.error(`🚨 THIS MEANS SOME TRANSACTIONS MAY BE MISSING!`);
            console.error(`💡 Suggestion: Try FAST SCAN for better chunk handling`);
            currentFrom = currentTo; // Skip to avoid infinite loop
            success = true;
          }
        }
      }
    }

    // Filter by target token interaction
    const userTaxPaid = new Map();
    let validCount = 0;
    let skippedCount = 0;
    let processedTxs = 0;

    const totalTxs = taxTransferLogs.length;
    console.log(`Filtering ${totalTxs} candidate transactions...`);
    
    // NO LIMIT - Process all transactions found
    // Incremental updates mean we can process as many as possible in 50s
    // and continue in next scan if timeout occurs
    const txsToProcess = totalTxs;

    for (let i = 0; i < txsToProcess; i++) {
      const log = taxTransferLogs[i];
      const txHash = log.transactionHash;
      
      // Check timeout during tx processing too
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > MAX_PROCESSING_TIME) {
        console.warn(`⏱️ Timeout during tx processing at ${processedTxs}/${txsToProcess}. Returning partial results.`);
        break;
      }
      
      // Safely parse tax amount with validation
      if (!log.data || log.data === '0x' || log.data === '0x0') {
        console.warn(`Skipping tx ${txHash}: Invalid or empty data`);
        skippedCount++;
        continue;
      }
      
      let taxAmount;
      try {
        taxAmount = BigInt(log.data);
      } catch (err) {
        console.error(`Failed to parse BigInt from log.data: ${log.data}`, err);
        skippedCount++;
        continue;
      }

      let txSuccess = false;
      let txRetries = 0;
      const MAX_TX_RETRIES = 2; // Reduce retries to save time

      while (!txSuccess && txRetries < MAX_TX_RETRIES) {
        try {
          const receipt = await client.getTransactionReceipt({ hash: txHash });
          
          if (!receipt || !receipt.from) {
            console.warn(`Invalid receipt for tx ${txHash}`);
            skippedCount++;
            txSuccess = true; // Skip this tx
            break;
          }

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

          txSuccess = true;
          processedTxs++;

          // Progressive delay to avoid rate limits (more aggressive)
          if (processedTxs % 5 === 0) await new Promise(r => setTimeout(r, 100));

        } catch (err) {
          txRetries++;
          const errorMsg = err.message || String(err);
          
          // Handle different error types
          if (errorMsg.includes('429') || errorMsg.includes('Too Many Requests')) {
            // Rate limit - wait longer
            const waitTime = 2000 * txRetries;
            console.warn(`Rate limit on tx ${txHash}, waiting ${waitTime}ms...`);
            await new Promise(r => setTimeout(r, waitTime));
          } else if (errorMsg.includes('could not be found') || errorMsg.includes('not be processed')) {
            // TX not found - likely too new or invalid, skip it
            console.warn(`TX ${txHash} not found (may be pending or invalid), skipping`);
            skippedCount++;
            txSuccess = true; // Skip this tx
          } else if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
            // Timeout - retry with delay
            console.warn(`Timeout on tx ${txHash}, retry ${txRetries}/${MAX_TX_RETRIES}`);
            await new Promise(r => setTimeout(r, 1000 * txRetries));
          } else {
            // Other errors
            console.error(`Error processing tx ${txHash}: ${errorMsg}`);
            if (txRetries >= MAX_TX_RETRIES - 1) {
              skippedCount++;
              txSuccess = true; // Skip after retries
            }
          }
        }
      }
    }

    // INCREMENTAL UPDATE - Add to existing leaderboard
    const redisKey = `tax-leaderboard:${campaignId}`;
    const metaKey = `tax-leaderboard-meta:${campaignId}`;

    console.log(`[Manual Scan] Incrementally updating leaderboard with ${userTaxPaid.size} users...`);

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

    // Calculate total from all users
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
      endBlock: currentFrom.toString(), // Use actual scanned end block, not requested
      validTxCount: validCount.toString(),
      skippedTxCount: skippedCount.toString(),
      lastScanIncremental: 'true',
    });

    // Update campaign config with last scan info
    await redis.set(`tax-campaign-config:${campaignId}`, {
      ...config,
      lastScanned: now,
      totalUsers: totalUsers,
      totalTax: totalTaxPaid,
    });

    const totalExecutionTime = Date.now() - startTime;
    const wasPartialScan = processedTxs < totalTxs || (currentFrom < toBlock);
    const actualScannedBlocks = currentFrom - fromBlock;

    console.log(`\n🏁 ========== MANUEL SCAN COMPLETE ==========`);
    console.log(`✅ Requested Range: ${fromBlock} - ${toBlock} (${totalBlocks} blocks)`);
    console.log(`📦 Actually Scanned: ${fromBlock} - ${currentFrom} (${actualScannedBlocks} blocks)`);
    console.log(`📊 Coverage: ${Math.round((Number(actualScannedBlocks) / Number(totalBlocks)) * 100)}%`);
    console.log(`👥 Total Users: ${totalUsers}`);
    console.log(`💰 Total Tax: ${totalTaxPaid} VIRTUAL`);
    console.log(`✓ Valid Transactions: ${validCount}`);
    console.log(`⏱️ Execution Time: ${totalExecutionTime}ms`);
    if (wasPartialScan) {
      console.log(`⚠️ PARTIAL SCAN: Stopped at block ${currentFrom} (${toBlock - currentFrom} blocks remaining)`);
    }
    console.log(`============================================\n`);

    return NextResponse.json({
      success: true,
      partial: wasPartialScan,
      warning: wasPartialScan ? 'Partial scan completed due to time constraints. Use AUTO-SCAN for complete results.' : null,
      stats: {
        totalUsers: totalUsers,
        totalTaxPaid,
        newUsersThisScan: userTaxPaid.size,
        validTxCount: validCount,
        skippedTxCount: skippedCount,
        processedTxCount: processedTxs,
        totalTxFound: totalTxs,
        scannedBlocks: `${fromBlock} - ${currentFrom}`,
        requestedBlocks: `${fromBlock} - ${toBlock}`,
        actualBlocksScanned: Number(actualScannedBlocks),
        totalBlocksRequested: Number(totalBlocks),
        coveragePercentage: Math.round((Number(actualScannedBlocks) / Number(totalBlocks)) * 100),
        executionTime: `${totalExecutionTime}ms`,
        isIncremental: true,
        topPayers: leaderboard.slice(0, 10),
      }
    });

  } catch (error) {
    console.error('[Tax Scan] Fatal error:', error);
    console.error('[Tax Scan] Error name:', error.name);
    console.error('[Tax Scan] Error message:', error.message);
    console.error('[Tax Scan] Stack trace:', error.stack);
    
    // Provide more detailed error response
    return NextResponse.json({
      error: error.message || 'Unknown error',
      errorType: error.name || 'Error',
      details: error.stack,
      hint: error.message?.includes('BigInt') 
        ? 'Block number validation failed. Check campaign configuration.' 
        : 'An unexpected error occurred during tax scanning.'
    }, { status: 500 });
  }
}
