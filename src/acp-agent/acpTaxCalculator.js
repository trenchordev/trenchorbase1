/**
 * ACP Tax Calculator Module
 * 
 * Calculates VIRTUAL token tax collected for a given token on Base chain.
 * Works by scanning Transfer events of VIRTUAL token to the tax wallet address,
 * filtering only those transactions that also involve the target token.
 * 
 * Scans from the token's launch block for 2940 blocks (~98 minutes).
 * If the 2940-block window hasn't elapsed yet, returns partial results.
 */

import { createPublicClient, http, formatEther, fallback, toHex } from 'viem';
import { base } from 'viem/chains';

// ─── Constants ───────────────────────────────────────────────────────────────

const VIRTUAL_ADDRESS = '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b';
const TAX_WALLET = '0x32487287c65f11d53bbCa89c2472171eB09bf337';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const BLOCKS_TO_SCAN = 2940;
const MAX_RETRIES = 10;
const INITIAL_CHUNK_SIZE = 400;
const RECEIPT_BATCH_SIZE = 5;
const RECEIPT_BATCH_DELAY_MS = 600;

// ─── Viem Client ─────────────────────────────────────────────────────────────

function createBaseClient(rpcUrl) {
    const transports = [];
    if (rpcUrl) transports.push(http(rpcUrl, { retryCount: 1, retryDelay: 500, timeout: 5000 }));

    // Fallback public RPCs to survive 503 "no backend healthy" errors on Base
    // Priority: llamarpc first, because mainnet is currently dropping getLogs connections
    transports.push(http('https://base.llamarpc.com', { retryCount: 2, retryDelay: 1000, timeout: 8000 }));
    transports.push(http('https://mainnet.base.org', { retryCount: 1, retryDelay: 500, timeout: 4000 }));

    return createPublicClient({
        chain: base,
        transport: fallback(transports, { rank: false }),
    });
}

/**
 * Fetches an RPC result with retry + exponential backoff.
 * Avoids silent data loss from rate limits.
 */
async function fetchWithRetry(client, method, params, maxRetries = MAX_RETRIES) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await client.request({ method, params });
        } catch (err) {
            const isRateLimit = err.message?.includes('rate limit') || err.message?.includes('429');
            if (attempt >= maxRetries) {
                throw err; // Exhausted retries
            }
            const delay = isRateLimit
                ? 1500 * attempt   // Longer backoff for rate limits
                : 500 * attempt;   // Standard backoff for other errors
            if (attempt >= 2) {
                console.warn(`   ⚠️ ${method} retry ${attempt}/${maxRetries} (waiting ${delay}ms): ${err.message?.substring(0, 80)}`);
            }
            await new Promise(r => setTimeout(r, delay));
        }
    }
}

// ─── Launch Block Detection ──────────────────────────────────────────────────

/**
 * Finds the launch block for a token.
 * 
 * Algorithm:
 * 1. Get earliest Transfer events for the token
 * 2. Pre-launch events (mint + distribution) all happen in the same block
 * 3. The first Transfer event in a DIFFERENT, LATER block = launch block
 * 
 * @param {string} tokenAddress - Token contract address
 * @param {object} client - Viem public client
 * @returns {Promise<{launchBlock: number, prelaunchBlock: number}>}
 */
export async function findLaunchBlock(tokenAddress, client) {
    console.log(`🔍 Finding launch block for token: ${tokenAddress}`);

    // ─── Fast Path: DexScreener API ──────────────────────────────────────────
    // Eliminates the need for 100s of RPC calls if the token is already trading
    try {
        console.log(`🌐 Checking DexScreener for token launch...`);
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data && data.pairs && data.pairs.length > 0) {
            const earliestPair = data.pairs.sort((a, b) => a.pairCreatedAt - b.pairCreatedAt)[0];
            const pairCreatedAt = earliestPair.pairCreatedAt;

            const currentBlock = await client.getBlock({ blockTag: 'latest' });
            const currentBlockNum = Number(currentBlock.number);
            const currentTimestamp = Number(currentBlock.timestamp) * 1000;

            // Base chain produces 1 block exactly every 2 seconds
            const diffMs = currentTimestamp - pairCreatedAt;
            const diffBlocks = Math.floor(diffMs / 2000);
            let estimatedBlock = currentBlockNum - diffBlocks;

            // We pad by 200 blocks (~6 mins) just to catch early transfers
            estimatedBlock = Math.max(0, estimatedBlock - 200);

            console.log(`🚀 Found launch via DexScreener: Approx block ${estimatedBlock}`);
            return { launchBlock: estimatedBlock, prelaunchBlock: estimatedBlock };
        }
    } catch (err) {
        console.warn(`⚠️ DexScreener check failed or token not found, falling back to on-chain scan: ${err.message}`);
    }

    // ─── Fallback Path: On-chain Binary Search ───────────────────────────────
    const currentBlock = Number(await client.getBlockNumber());
    const WINDOW = 2000;

    console.log(`🔎 Phase 1: Finding contract deployment block via binary search...`);
    let lo = 0;
    let hi = currentBlock;
    let deployBlock = currentBlock;

    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        try {
            const code = await client.request({
                method: 'eth_getCode',
                params: [tokenAddress, `0x${mid.toString(16)}`],
            });
            if (code && code !== '0x' && code !== '0x0') {
                deployBlock = mid;
                hi = mid - 1;
            } else {
                lo = mid + 1;
            }
        } catch (err) {
            console.warn(`   ⚠️ getCode error at block ${mid}: ${err.message}`);
            await new Promise(r => setTimeout(r, 500));
            lo = mid + 1;
        }
    }
    console.log(`📦 Contract deployment block: ${deployBlock}`);

    // Phase 2: Scan forward to find the first event (up to 500k blocks = ~11 days post-deployment)
    let prelaunchBlock = null;
    let scanFrom = deployBlock;
    console.log(`🔎 Phase 2: Scanning forward from block ${deployBlock} for first transfer...`);

    for (let from = scanFrom; from <= Math.min(deployBlock + 500000, currentBlock); from += WINDOW + 1) {
        const to = Math.min(from + WINDOW, currentBlock);

        let success = false;
        let retries = 0;
        while (!success && retries < 3) {
            try {
                const logs = await client.request({
                    method: 'eth_getLogs',
                    params: [{
                        address: tokenAddress,
                        fromBlock: toHex(from),
                        toBlock: toHex(to),
                        topics: [TRANSFER_TOPIC],
                    }],
                });
                if (logs.length > 0) {
                    prelaunchBlock = Number(logs[0].blockNumber);
                    console.log(`📋 Found first transfer event at block: ${prelaunchBlock}`);
                    return { launchBlock: prelaunchBlock, prelaunchBlock: prelaunchBlock };
                }
                success = true;
            } catch (err) {
                retries++;
                console.warn(`⚠️ getLogs error (retry ${retries}/3): ${err.message}`);
                await new Promise(r => setTimeout(r, 1000 * retries));
            }
        }
    }

    throw new Error(`Could not find launch block for token ${tokenAddress}. The token may not have been launched or traded yet.`);
}

// ─── Tax Calculation ─────────────────────────────────────────────────────────

/**
 * Calculates total VIRTUAL tax collected for a token.
 * 
 * @param {string} tokenAddress - Token contract address
 * @param {string} [rpcUrl] - Optional custom RPC URL (defaults to Base mainnet)
 * @param {function} [onProgress] - Optional progress callback (percent, message)
 * @returns {Promise<TaxReport>}
 */
export async function calculateTax(tokenAddress, rpcUrl, onProgress) {
    const client = createBaseClient(rpcUrl);
    const currentBlock = Number(await client.getBlockNumber());

    // Step 1: Find launch block
    if (onProgress) onProgress(5, 'Finding token launch block...');
    const { launchBlock, prelaunchBlock } = await findLaunchBlock(tokenAddress, client);

    // Step 2: Determine scan range
    const endBlock = Math.min(launchBlock + BLOCKS_TO_SCAN, currentBlock);
    const totalBlocksToScan = BLOCKS_TO_SCAN;
    const actualBlocksScanned = endBlock - launchBlock;
    const isComplete = (launchBlock + BLOCKS_TO_SCAN) <= currentBlock;
    const progressPercent = Math.min(100, Math.round((actualBlocksScanned / totalBlocksToScan) * 100));

    console.log(`📊 Scan range: ${launchBlock} → ${endBlock} (${actualBlocksScanned} of ${totalBlocksToScan} blocks)`);
    console.log(`   Complete: ${isComplete ? 'YES ✅' : `NO ⏳ (${progressPercent}%)`}`);

    if (onProgress) onProgress(10, `Scanning blocks ${launchBlock} to ${endBlock}...`);

    // Step 3: Fetch VIRTUAL Transfer logs to tax wallet
    const taxTransferLogs = [];
    let chunkSize = INITIAL_CHUNK_SIZE;
    let currentFrom = launchBlock;

    while (currentFrom < endBlock) {
        const currentTo = Math.min(currentFrom + chunkSize, endBlock);
        let success = false;
        let retries = 0;

        while (!success && retries < MAX_RETRIES) {
            try {
                const logs = await client.request({
                    method: 'eth_getLogs',
                    params: [{
                        address: VIRTUAL_ADDRESS,
                        fromBlock: toHex(currentFrom),
                        toBlock: toHex(currentTo),
                        topics: [
                            TRANSFER_TOPIC,
                            null, // any sender
                            `0x000000000000000000000000${TAX_WALLET.slice(2).toLowerCase()}`, // to tax wallet
                        ],
                    }],
                });

                taxTransferLogs.push(...logs);
                currentFrom = currentTo + 1;
                success = true;

                // Increase chunk size on success
                if (chunkSize < 800) chunkSize = Math.min(chunkSize * 2, 800);

                // Progress update
                const scanProgress = 10 + Math.round(((currentFrom - launchBlock) / actualBlocksScanned) * 60);
                if (onProgress) onProgress(Math.min(scanProgress, 70), `Fetched ${taxTransferLogs.length} tax transfers...`);

            } catch (err) {
                retries++;
                console.warn(`⚠️ Error fetching logs (retry ${retries}/${MAX_RETRIES}):`, err.message);

                // Reduce chunk size on error
                chunkSize = Math.max(50, Math.floor(chunkSize / 2));

                if (retries >= MAX_RETRIES) {
                    console.error(`❌ Failed to fetch logs for range ${currentFrom}-${currentTo}`);
                    currentFrom = currentTo + 1;
                    success = true; // Move on
                }

                // Wait before retry
                await new Promise(r => setTimeout(r, 1000 * retries));
            }
        }
    }

    console.log(`📝 Found ${taxTransferLogs.length} VIRTUAL transfers to tax wallet in scan range`);

    if (onProgress) onProgress(60, `Fetching target token transfers for intersection matching...`);

    // Step 4: Fetch target token transfers to build a fast-lookup Set of valid transactions
    // This entirely eliminates the need for thousands of slow eth_getTransactionReceipt calls
    const targetTokenTxMap = new Map();
    currentFrom = launchBlock;
    chunkSize = INITIAL_CHUNK_SIZE;

    while (currentFrom < endBlock) {
        const currentTo = Math.min(currentFrom + chunkSize, endBlock);
        let success = false;
        let retries = 0;

        while (!success && retries < MAX_RETRIES) {
            try {
                const logs = await client.request({
                    method: 'eth_getLogs',
                    params: [{
                        address: tokenAddress,
                        fromBlock: toHex(currentFrom),
                        toBlock: toHex(currentTo),
                        topics: [TRANSFER_TOPIC],
                    }],
                });

                // Map txHash -> buyer address (the "to" field in a buy transfer is usually the buyer)
                for (const log of logs) {
                    const txHash = log.transactionHash.toLowerCase();
                    // Topic 2 is the 'to' address in a Transfer(from, to, value)
                    if (log.topics[2]) {
                        // Extract address from 32-byte padded topic (last 40 chars = 20 bytes)
                        const toAddress = '0x' + log.topics[2].slice(26).toLowerCase();
                        targetTokenTxMap.set(txHash, toAddress);
                    } else {
                        // Fallback: just record the interaction
                        targetTokenTxMap.set(txHash, '0xunknown');
                    }
                }

                currentFrom = currentTo + 1;
                success = true;
                if (chunkSize < 800) chunkSize = Math.min(chunkSize * 2, 800);

            } catch (err) {
                retries++;
                console.warn(`⚠️ Error fetching target token logs (retry ${retries}/${MAX_RETRIES}):`, err.message);
                chunkSize = Math.max(50, Math.floor(chunkSize / 2));
                if (retries >= MAX_RETRIES) {
                    currentFrom = currentTo + 1;
                    success = true;
                }
                await new Promise(r => setTimeout(r, 1000 * retries));
            }
        }
    }

    console.log(`📝 Found ${targetTokenTxMap.size} unique transactions involving the target token`);
    if (onProgress) onProgress(80, `Cross-referencing taxes in memory...`);

    // Step 5: Filter by target token interaction and calculate per-user tax locally
    const userTaxPaid = new Map();
    let validCount = 0;
    let skippedCount = 0;
    let totalTax = 0n;

    for (let i = 0; i < taxTransferLogs.length; i++) {
        const log = taxTransferLogs[i];
        const txHash = log.transactionHash.toLowerCase();
        const taxAmount = BigInt(log.data || '0');

        // Instant memory intersection check
        if (targetTokenTxMap.has(txHash)) {
            // Extract the sender of the VIRTUAL tax. 
            // In VIRTUAL Transfer(from, to, amount), topic 1 is 'from' (the buyer paying tax)
            let userAddress = '0xunknown';
            if (log.topics[1]) {
                userAddress = '0x' + log.topics[1].slice(26).toLowerCase();
            }

            const currentTax = userTaxPaid.get(userAddress) || 0n;
            userTaxPaid.set(userAddress, currentTax + taxAmount);
            totalTax += taxAmount;
            validCount++;
        } else {
            skippedCount++;
        }

        if (i % 50 === 0 && onProgress) {
            const txProgress = 80 + Math.round((i / taxTransferLogs.length) * 15);
            onProgress(Math.min(txProgress, 95), `Verified ${i + 1}/${taxTransferLogs.length} transactions...`);
        }
    }

    // Step 5: Format results
    const totalTaxVirtual = formatEther(totalTax);

    // Build leaderboard (top payers)
    const leaderboard = Array.from(userTaxPaid.entries())
        .map(([address, amount]) => ({
            address,
            taxPaidWei: amount.toString(),
            taxPaidVirtual: parseFloat(formatEther(amount)),
        }))
        .sort((a, b) => b.taxPaidVirtual - a.taxPaidVirtual);

    if (onProgress) onProgress(100, 'Tax calculation complete!');

    const report = {
        tokenAddress,
        taxWallet: TAX_WALLET,
        launchBlock,
        prelaunchBlock,
        scanStartBlock: launchBlock,
        scanEndBlock: endBlock,
        blocksScanned: actualBlocksScanned,
        totalBlocks: totalBlocksToScan,
        progressPercent,
        isComplete,
        totalTaxWei: totalTax.toString(),
        totalTaxVirtual: parseFloat(totalTaxVirtual),
        validTransactions: validCount,
        skippedTransactions: skippedCount,
        uniquePayers: userTaxPaid.size,
        leaderboard: leaderboard.slice(0, 20), // Top 20 payers
        timestamp: new Date().toISOString(),
    };

    console.log('\n📊 ═══════════════════════════════════════════');
    console.log(`   Token: ${tokenAddress}`);
    console.log(`   Launch Block: ${launchBlock}`);
    console.log(`   Blocks Scanned: ${actualBlocksScanned}/${totalBlocksToScan} (${progressPercent}%)`);
    console.log(`   Total Tax: ${totalTaxVirtual} VIRTUAL`);
    console.log(`   Valid Transactions: ${validCount}`);
    console.log(`   Unique Payers: ${userTaxPaid.size}`);
    console.log('═══════════════════════════════════════════════\n');

    return report;
}

/**
 * Formats a tax report into a human-readable string for ACP deliverable.
 */
export function formatTaxReport(report) {
    const lines = [
        `📊 Tax Report for Token ${report.tokenAddress}`,
        ``,
        `🏷️ Tax Wallet: ${report.taxWallet}`,
        `🚀 Launch Block: ${report.launchBlock}`,
        `📦 Blocks Scanned: ${report.blocksScanned} / ${report.totalBlocks} (${report.progressPercent}%)`,
        `${report.isComplete ? '✅ Scan Complete' : '⏳ Scan In Progress (token still in tax period)'}`,
        ``,
        `💰 Total Tax Collected: ${report.totalTaxVirtual.toFixed(6)} VIRTUAL`,
        `📝 Valid Tax Transactions: ${report.validTransactions}`,
        `👥 Unique Tax Payers: ${report.uniquePayers}`,
        ``,
    ];

    if (report.leaderboard.length > 0) {
        lines.push(`🏆 Top Tax Payers:`);
        report.leaderboard.slice(0, 10).forEach((payer, i) => {
            lines.push(`   ${i + 1}. ${payer.address}: ${payer.taxPaidVirtual.toFixed(6)} VIRTUAL`);
        });
    }

    lines.push(``);
    lines.push(`⏰ Report Generated: ${report.timestamp}`);

    return lines.join('\n');
}
