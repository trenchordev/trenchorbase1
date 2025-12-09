/**
 * Tax-based Leaderboard Generator
 * 
 * Filters tax payments to a specific TAX_WALLET that are related to buying a TARGET_TOKEN_ADDRESS.
 * Only counts tax if the transaction contains a Transfer event from the TARGET_TOKEN_ADDRESS.
 * 
 * Usage:
 *   node scripts/taxLeaderboard.js [campaignId]
 * 
 * If campaignId is provided, reads config from Redis (tax-campaign-config:campaignId).
 * Otherwise, falls back to environment variables.
 * 
 * Required Environment Variables:
 *   - NEXT_PUBLIC_RPC_URL or default Base RPC
 *   - UPSTASH_REDIS_REST_URL
 *   - UPSTASH_REDIS_REST_TOKEN
 *   - TAX_WALLET (if not using Redis config)
 *   - TARGET_TOKEN (if not using Redis config)
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { Redis } from '@upstash/redis';

// ========== CONSTANTS ==========
const VIRTUAL_ADDRESS = '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b'.toLowerCase();
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

const client = createPublicClient({
  chain: base,
  transport: http(rpcUrl),
});

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ========== CONFIGURATION LOADER ==========
async function loadConfig() {
  const campaignId = process.argv[2];

  if (campaignId) {
    console.log(`📋 Loading config for campaign: ${campaignId}`);
    const config = await redis.get(`tax-campaign-config:${campaignId}`);

    if (!config) {
      throw new Error(`Campaign config not found: ${campaignId}`);
    }

    const timeWindow = (config.timeWindowMinutes || 99) * 60;
    const startTimestamp = config.startTimestamp
      ? parseInt(config.startTimestamp)
      : Math.floor(Date.now() / 1000) - timeWindow;

    // End timestamp should be start + window, but not in the future
    const now = Math.floor(Date.now() / 1000);
    const endTimestamp = Math.min(now, startTimestamp + timeWindow);

    return {
      campaignId,
      taxWallet: config.taxWallet.toLowerCase(),
      targetToken: config.targetToken.toLowerCase(),
      startTimestamp,
      endTimestamp,
      name: config.name,
      startBlockConfig: config.startBlock ? BigInt(config.startBlock) : null,
      endBlockConfig: config.endBlock ? BigInt(config.endBlock) : null,
    };
  } else {
    // Fallback to environment variables
    console.log('📋 Using environment variables (no campaign ID provided)');
    const taxWallet = process.env.TAX_WALLET?.toLowerCase();
    const targetToken = process.env.TARGET_TOKEN?.toLowerCase();

    if (!taxWallet || !targetToken) {
      throw new Error('Missing required env vars: TAX_WALLET and TARGET_TOKEN (or provide campaignId)');
    }

    return {
      campaignId: 'default',
      taxWallet,
      targetToken,
      startTimestamp: Math.floor(Date.now() / 1000) - (99 * 60),
      endTimestamp: Math.floor(Date.now() / 1000),
      name: 'Default Campaign'
    };
  }
}

// ========== MAIN LOGIC ==========
async function generateTaxLeaderboard() {
  console.log('🚀 Starting tax-based leaderboard generation...');

  // Load configuration
  const config = await loadConfig();
  const { campaignId, taxWallet, targetToken, startTimestamp, endTimestamp, name } = config;

  // Step 1: Get current block
  const currentBlock = await client.getBlockNumber();
  console.log(`📦 Current Block: ${currentBlock}`);

  let fromBlock, toBlock;

  if (config.startBlockConfig) {
    fromBlock = config.startBlockConfig;
    toBlock = config.endBlockConfig || currentBlock;
    console.log(`🔹 Configuration: Explicit Block Range`);
  } else {
    // Fallback: If no start block, scan last 10,000 blocks (~5.5 hours)
    console.log('⚠️ No start block configured. Defaulting to last 10,000 blocks.');
    const DEFAULT_LOOKBACK = 10000n;
    fromBlock = currentBlock - DEFAULT_LOOKBACK;
    toBlock = currentBlock;
  }

  // Sanity checks
  if (toBlock > currentBlock) toBlock = currentBlock;
  if (fromBlock > toBlock) fromBlock = toBlock - 1000n;

  console.log(`🔍 Scanning blocks: ${fromBlock} -> ${toBlock} (Delta: ${toBlock - fromBlock} blocks)\n`);
  console.log(`🛠️  Filter Config:`);
  console.log(`    Address: ${VIRTUAL_ADDRESS}`);
  console.log(`    Topic0: ${TRANSFER_TOPIC}`);
  console.log(`    Topic2: 0x000000000000000000000000${taxWallet.slice(2)}`);

  // Step 2: Fetch all VIRTUAL Transfer logs to TAX_WALLET
  console.log('🔎 Step 1: Fetching VIRTUAL token transfers to TAX_WALLET...');

  const taxTransferLogs = [];
  let currentFrom = fromBlock;
  let currentChunkSize = 10n; // Start small for safety (Alchemy Free Tier)
  const MAX_RETRIES = 5;

  while (currentFrom < toBlock) {
    let currentTo = currentFrom + currentChunkSize;
    if (currentTo > toBlock) currentTo = toBlock;

    let success = false;
    let retries = 0;

    while (!success && retries < MAX_RETRIES) {
      try {
        // Log periodically
        if (retries > 0 || (Number(currentFrom) % 100 === 0)) {
          console.log(`  🔄 Scanning ${currentFrom} -> ${currentTo} (Chunk: ${currentTo - currentFrom})`);
        }

        const logs = await client.request({
          method: 'eth_getLogs',
          params: [{
            address: VIRTUAL_ADDRESS,
            fromBlock: `0x${currentFrom.toString(16)}`,
            toBlock: `0x${currentTo.toString(16)}`,
            topics: [
              TRANSFER_TOPIC,
              null, // from (any)
              `0x000000000000000000000000${taxWallet.slice(2)}`, // to = taxWallet
            ],
          }],
        });

        if (logs.length > 0) {
          console.log(`    ✅ Chunk ${currentFrom}-${currentTo}: Found ${logs.length} transfers`);
          taxTransferLogs.push(...logs);
        }

        currentFrom = currentTo;
        success = true;

        if (currentChunkSize < 50n) currentChunkSize += 10n;

        await new Promise(r => setTimeout(r, 50));

      } catch (err) {
        retries++;
        const errorMessage = err.message || JSON.stringify(err);

        const newSize = currentChunkSize / 2n;
        if (newSize >= 1n && newSize < currentChunkSize) {
          console.warn(`    ⚠️  Error. Reducing chunk size: ${currentChunkSize} -> ${newSize}. Msg: ${errorMessage.slice(0, 100)}...`);
          currentChunkSize = newSize;
          currentTo = currentFrom + currentChunkSize;
          if (currentTo > toBlock) currentTo = toBlock;
        } else {
          console.warn(`    ⚠️  Retrying (Attempt ${retries}/${MAX_RETRIES})...`);
          if (errorMessage.includes('429')) await new Promise(r => setTimeout(r, 2000 * retries));
          else await new Promise(r => setTimeout(r, 1000));
        }

        if (retries >= MAX_RETRIES) {
          console.error(`    🚨 Max retries reached for chunk. Skipping...`);
          currentFrom = currentTo;
          success = true;
        }
      }
    }
  }

  console.log(`\n📊 Total tax transfers found: ${taxTransferLogs.length}\n`);

  // Step 3: Filter transactions that contain TARGET_TOKEN interaction
  console.log('🔎 Step 2: Filtering transactions with TARGET_TOKEN interaction...');

  const userTaxPaid = new Map(); // user address -> total tax paid
  let validTaxCount = 0;
  let skippedCount = 0;

  for (const log of taxTransferLogs) {
    const txHash = log.transactionHash;
    const taxAmount = BigInt(log.data);

    try {
      // Fetch transaction receipt
      const receipt = await client.getTransactionReceipt({ hash: txHash });
      const userAddress = receipt.from.toLowerCase();

      // Check if any log in this transaction is a Transfer from TARGET_TOKEN
      let hasTargetTokenInteraction = false;

      for (const txLog of receipt.logs) {
        if (txLog.topics[0] !== TRANSFER_TOPIC) continue;

        const tokenAddress = txLog.address.toLowerCase();

        if (tokenAddress === targetToken) {
          // Found a transfer event from the target token in this transaction
          hasTargetTokenInteraction = true;
          break;
        }
      }

      if (hasTargetTokenInteraction) {
        // Valid tax payment related to TARGET_TOKEN
        const currentTax = userTaxPaid.get(userAddress) || 0n;
        userTaxPaid.set(userAddress, currentTax + taxAmount);
        validTaxCount++;
      } else {
        // Tax payment not related to TARGET_TOKEN (belongs to another project)
        skippedCount++;
      }
    } catch (err) {
      console.error(`  ⚠️  Error processing tx ${txHash}:`, err.message);
    }
  }

  console.log(`\n✅ Valid tax payments (related to ${targetToken}): ${validTaxCount}`);
  console.log(`⏭️  Skipped (unrelated projects): ${skippedCount}\n`);

  // Step 4: Sort by tax paid and generate leaderboard
  console.log('📈 Step 3: Generating leaderboard...\n');

  const leaderboard = Array.from(userTaxPaid.entries())
    .map(([address, taxPaid]) => ({
      address,
      taxPaidRaw: taxPaid,
      taxPaidVirtual: Number(taxPaid) / 1e18,
    }))
    .sort((a, b) => Number(b.taxPaidRaw - a.taxPaidRaw));

  console.log('🏆 TOP 10 TAX PAYERS (Target Token Only):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  leaderboard.slice(0, 10).forEach((entry, index) => {
    console.log(`${(index + 1).toString().padStart(2)}. ${entry.address} → ${entry.taxPaidVirtual.toFixed(4)} VIRTUAL`);
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Step 5: Save to Redis
  const redisKey = `tax-leaderboard:${campaignId}`;
  const metaKey = `tax-leaderboard-meta:${campaignId}`;

  console.log(`💾 Saving leaderboard to Redis: ${redisKey}...`);

  await redis.del(redisKey);
  for (const entry of leaderboard) {
    await redis.zadd(redisKey, {
      score: entry.taxPaidVirtual,
      member: entry.address,
    });
  }

  const totalTaxPaid = leaderboard.reduce((sum, e) => sum + e.taxPaidVirtual, 0).toFixed(4);

  await redis.hset(metaKey, {
    campaignId,
    name,
    targetToken,
    taxWallet,
    lastUpdated: Date.now().toString(),
    totalUsers: leaderboard.length.toString(),
    totalTaxPaid: totalTaxPaid,
    startTimestamp: startTimestamp.toString(),
    endTimestamp: endTimestamp.toString(),
  });

  console.log('✅ Leaderboard saved to Redis!\n');
  console.log(`📌 Total unique users: ${leaderboard.length}`);
  console.log(`📌 Total tax collected: ${totalTaxPaid} VIRTUAL\n`);

  return leaderboard;
}

// ========== EXECUTE ==========
generateTaxLeaderboard()
  .then(() => {
    console.log('🎉 Tax leaderboard generation complete!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
