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

    if (configStartBlock && configEndBlock) {
      // Use explicit block range
      fromBlock = BigInt(configStartBlock);
      toBlock = BigInt(configEndBlock);
    } else if (configStartBlock) {
      // Start block given, scan to current
      fromBlock = BigInt(configStartBlock);
      toBlock = currentBlock;
    } else {
      // Use time window (default)
      const timeWindow = (timeWindowMinutes || 99) * 60;
      const estimatedBlocks = Math.ceil(timeWindow / 2); // Base: ~2 saniye/blok
      fromBlock = currentBlock - BigInt(estimatedBlocks);
      toBlock = currentBlock;
    }

    // Fetch VIRTUAL transfers to tax wallet
    const taxTransferLogs = [];
    const MAX_RETRIES = 5;

    // Start with very small chunk size to accommodate strict free tier limits
    let currentChunkSize = infuraKey ? 2000n : 10n;
    let currentFrom = fromBlock;

    console.log(`Starting scan from ${fromBlock} to ${toBlock} (Total: ${toBlock - fromBlock} blocks)`);

    while (currentFrom < toBlock) {
      let currentTo = currentFrom + currentChunkSize;
      if (currentTo > toBlock) currentTo = toBlock;

      let success = false;
      let retries = 0;

      while (!success && retries < MAX_RETRIES) {
        try {
          // Log only periodically to avoid spamming server logs
          if (retries > 0 || (Number(currentFrom) % 2000 === 0)) {
            console.log(`Scanning ${currentFrom} -> ${currentTo} (Size: ${currentTo - currentFrom})`);
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
            console.error(`Max retries reached for chunk ${currentFrom}-${currentTo}. Skipping.`);
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

    console.log(`Filtering ${taxTransferLogs.length} candidate transactions...`);

    for (const log of taxTransferLogs) {
      const txHash = log.transactionHash;
      const taxAmount = BigInt(log.data);

      let txSuccess = false;
      let txRetries = 0;

      while (!txSuccess && txRetries < 3) {
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

          txSuccess = true;
          processedTxs++;

          // Small delay every few txs
          if (processedTxs % 10 === 0) await new Promise(r => setTimeout(r, 20));

        } catch (err) {
          txRetries++;
          if (err.message.includes('429')) {
            await new Promise(r => setTimeout(r, 1000 * txRetries));
          } else {
            console.error(`Error processing tx ${txHash}: ${err.message}`);
            // If not a rate limit, maybe fail this tx
            if (txRetries >= 2) txSuccess = true; // Skip
          }
        }
      }
    }

    // Generate leaderboard
    const leaderboard = Array.from(userTaxPaid.entries())
      .map(([address, taxPaid]) => ({
        address,
        taxPaidRaw: taxPaid.toString(),
        taxPaidVirtual: Number(taxPaid) / 1e18,
      }))
      .sort((a, b) => Number(BigInt(b.taxPaidRaw) - BigInt(a.taxPaidRaw)));

    // Save to Redis
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
      endBlock: toBlock.toString(),
      validTxCount: validCount.toString(),
      skippedTxCount: skippedCount.toString(),
    });

    // Update campaign config with last scan info
    await redis.set(`tax-campaign-config:${campaignId}`, {
      ...config,
      lastScanned: now,
      totalUsers: leaderboard.length,
      totalTax: totalTaxPaid,
    });

    return NextResponse.json({
      success: true,
      stats: {
        totalUsers: leaderboard.length,
        totalTaxPaid,
        validTxCount: validCount,
        skippedTxCount: skippedCount,
        scannedBlocks: `${fromBlock} - ${toBlock}`,
        topPayers: leaderboard.slice(0, 10),
      }
    });

  } catch (error) {
    console.error('Tax scan error:', error);
    return NextResponse.json({
      error: error.message,
      details: error.stack
    }, { status: 500 });
  }
}
