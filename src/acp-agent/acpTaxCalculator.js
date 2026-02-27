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

import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';

// ─── Constants ───────────────────────────────────────────────────────────────

const VIRTUAL_ADDRESS = '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b';
const TAX_WALLET = '0x32487287c65f11d53bbCa89c2472171eB09bf337';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const BLOCKS_TO_SCAN = 2940;
const MAX_RETRIES = 5;
const INITIAL_CHUNK_SIZE = 500;
const RECEIPT_BATCH_SIZE = 5;
const RECEIPT_BATCH_DELAY_MS = 600;

// ─── Viem Client ─────────────────────────────────────────────────────────────

function createBaseClient(rpcUrl) {
    return createPublicClient({
        chain: base,
        transport: http(rpcUrl || 'https://mainnet.base.org', {
            batch: true,
            retryCount: 3,
            retryDelay: 1000,
        }),
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

    const currentBlock = Number(await client.getBlockNumber());
    const WINDOW = 2000; // Safe query window for public RPCs

    // ─── Phase 1: Find contract deployment block via eth_getCode binary search ──
    // eth_getCode returns '0x' (empty) before deployment and non-empty after.
    // Binary search: O(log₂ n) ≈ 25 calls for ~40M blocks.

    console.log(`🔎 Phase 1: Finding contract deployment block via binary search...`);

    let lo = 0;
    let hi = currentBlock;
    let deployBlock = currentBlock; // Will narrow this down

    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);

        try {
            const code = await client.request({
                method: 'eth_getCode',
                params: [tokenAddress, `0x${mid.toString(16)}`],
            });

            if (code && code !== '0x' && code !== '0x0') {
                // Contract exists at this block — deployment was at or before this
                deployBlock = mid;
                hi = mid - 1;
            } else {
                // Contract doesn't exist yet — deployment is after this block
                lo = mid + 1;
            }
        } catch (err) {
            console.warn(`   ⚠️ getCode error at block ${mid}: ${err.message}`);
            // On error, try to narrow from both sides
            await new Promise(r => setTimeout(r, 500));
            lo = mid + 1; // Skip forward to avoid infinite loop
        }
    }

    console.log(`📦 Contract deployment block: ${deployBlock}`);

    // ─── Phase 2: Find pre-launch block ──────────────────────────────────
    // Scan from deployment block forward to find the first Transfer event
    // (this is the pre-launch/creation block with mint events)

    let prelaunchBlock = null;
    let scanFrom = deployBlock;

    console.log(`🔎 Phase 2: Finding pre-launch events from block ${deployBlock}...`);

    for (let from = scanFrom; from <= Math.min(deployBlock + 100, currentBlock); from += WINDOW + 1) {
        const to = Math.min(from + WINDOW, currentBlock);
        try {
            const logs = await client.request({
                method: 'eth_getLogs',
                params: [{
                    address: tokenAddress,
                    fromBlock: `0x${from.toString(16)}`,
                    toBlock: `0x${to.toString(16)}`,
                    topics: [TRANSFER_TOPIC],
                }],
            });
            if (logs.length > 0) {
                prelaunchBlock = Number(logs[0].blockNumber);
                break;
            }
        } catch (err) {
            await new Promise(r => setTimeout(r, 500));
        }
    }

    if (!prelaunchBlock) {
        // Wider scan — deployment might not have Transfer events immediately
        for (let from = deployBlock; from <= Math.min(deployBlock + 50000, currentBlock); from += WINDOW + 1) {
            const to = Math.min(from + WINDOW, currentBlock);
            try {
                const logs = await client.request({
                    method: 'eth_getLogs',
                    params: [{
                        address: tokenAddress,
                        fromBlock: `0x${from.toString(16)}`,
                        toBlock: `0x${to.toString(16)}`,
                        topics: [TRANSFER_TOPIC],
                    }],
                });
                if (logs.length > 0) {
                    prelaunchBlock = Number(logs[0].blockNumber);
                    break;
                }
            } catch (err) {
                await new Promise(r => setTimeout(r, 300));
            }
        }
    }

    if (!prelaunchBlock) {
        throw new Error(`No Transfer events found after contract deployment for token ${tokenAddress}.`);
    }

    console.log(`📋 Pre-launch block found: ${prelaunchBlock}`);

    // ─── Phase 3: Find launch block (first event AFTER pre-launch block) ─
    let forwardFrom = prelaunchBlock + 1;
    const maxScanEnd = Math.min(prelaunchBlock + 1000000, currentBlock);
    let forwardChunk = WINDOW;

    console.log(`🔎 Phase 3: Scanning forward from block ${forwardFrom} for launch...`);

    while (forwardFrom <= maxScanEnd) {
        const scanTo = Math.min(forwardFrom + forwardChunk, maxScanEnd);
        let retries = 0;
        let success = false;

        while (!success && retries < MAX_RETRIES) {
            try {
                const logs = await client.request({
                    method: 'eth_getLogs',
                    params: [{
                        address: tokenAddress,
                        fromBlock: `0x${forwardFrom.toString(16)}`,
                        toBlock: `0x${scanTo.toString(16)}`,
                        topics: [TRANSFER_TOPIC],
                    }],
                });

                if (logs.length > 0) {
                    const launchBlock = Number(logs[0].blockNumber);
                    console.log(`🚀 Launch block detected: ${launchBlock} (${launchBlock - prelaunchBlock} blocks after pre-launch)`);
                    return { launchBlock, prelaunchBlock };
                }

                forwardFrom = scanTo + 1;
                success = true;
                if (forwardChunk < 10000) forwardChunk = Math.min(forwardChunk * 2, 10000);

            } catch (err) {
                retries++;
                forwardChunk = Math.max(500, Math.floor(forwardChunk / 2));
                if (retries >= MAX_RETRIES) {
                    forwardFrom = scanTo + 1;
                    success = true;
                }
                await new Promise(r => setTimeout(r, 500 * retries));
            }
        }
    }

    throw new Error(`Could not find launch block for token ${tokenAddress}. The token may not have been launched yet.`);
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
                        fromBlock: `0x${currentFrom.toString(16)}`,
                        toBlock: `0x${currentTo.toString(16)}`,
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
                if (chunkSize < 2000) chunkSize = Math.min(chunkSize * 2, 2000);

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

    if (onProgress) onProgress(75, `Processing ${taxTransferLogs.length} transactions...`);

    // Step 4: Filter by target token interaction and calculate per-user tax
    // Process receipts in small batches with delays to avoid RPC rate limits
    const userTaxPaid = new Map();
    let validCount = 0;
    let skippedCount = 0;
    let totalTax = 0n;

    for (let batchStart = 0; batchStart < taxTransferLogs.length; batchStart += RECEIPT_BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + RECEIPT_BATCH_SIZE, taxTransferLogs.length);
        const batch = taxTransferLogs.slice(batchStart, batchEnd);

        // Process batch sequentially (each with retry)
        for (let j = 0; j < batch.length; j++) {
            const i = batchStart + j;
            const log = batch[j];
            const txHash = log.transactionHash;
            const taxAmount = BigInt(log.data || '0');

            try {
                // Fetch receipt with retry + backoff
                const receipt = await fetchWithRetry(
                    client,
                    'eth_getTransactionReceipt',
                    [txHash]
                );

                if (!receipt) {
                    console.warn(`⚠️ Null receipt for tx ${txHash} — skipping`);
                    skippedCount++;
                    continue;
                }

                const userAddress = receipt.from.toLowerCase();

                // Check if transaction also involves the target token
                let hasTargetTokenInteraction = false;
                for (const txLog of receipt.logs) {
                    if (txLog.topics[0] !== TRANSFER_TOPIC) continue;
                    if (txLog.address.toLowerCase() === tokenAddress.toLowerCase()) {
                        hasTargetTokenInteraction = true;
                        break;
                    }
                }

                if (hasTargetTokenInteraction) {
                    const currentTax = userTaxPaid.get(userAddress) || 0n;
                    userTaxPaid.set(userAddress, currentTax + taxAmount);
                    totalTax += taxAmount;
                    validCount++;
                } else {
                    skippedCount++;
                }

                // Progress update every 10 transactions
                if (i % 10 === 0 && onProgress) {
                    const txProgress = 75 + Math.round((i / taxTransferLogs.length) * 20);
                    onProgress(Math.min(txProgress, 95), `Verified ${i + 1}/${taxTransferLogs.length} transactions...`);
                }

            } catch (err) {
                console.warn(`⚠️ Error processing tx ${txHash} (after ${MAX_RETRIES} retries):`, err.message);
                skippedCount++;
            }
        }

        // Inter-batch delay to stay under rate limits
        if (batchEnd < taxTransferLogs.length) {
            await new Promise(r => setTimeout(r, RECEIPT_BATCH_DELAY_MS));
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
