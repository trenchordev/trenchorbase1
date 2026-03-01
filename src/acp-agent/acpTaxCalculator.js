/**
 * ACP Tax Calculator Module — v4 (OpenClaw-compatible)
 *
 * This module mirrors the exact approach used in the working OpenClaw agent
 * (wolfy-agent/virtuals-tax-analyzer). It uses:
 *   1. Raw axios HTTP calls directly to RPC endpoints (no viem client)
 *   2. Multi-endpoint auto-failover with hard per-request timeouts
 *   3. eth_getCode binary search starting from VIRTUALS_FLOOR_BLOCK
 *   4. O(1) in-memory intersection to find taxed buys (no receipt calls)
 *
 * NO DexScreener. NO viem fallback. NO receipt fetches.
 */

import axios from 'axios';
import { formatEther } from 'viem';

// ─── Constants ────────────────────────────────────────────────────────────────

const VIRTUAL_ADDRESS = '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b';
const TAX_WALLET = '0x32487287c65f11d53bbca89c2472171eb09bf337';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const BLOCKS_TO_SCAN = 2940;   // ~98 minutes at 2s/block
const CHUNK_SIZE = 900;    // max safe eth_getLogs block range per public RPC
const VIRTUALS_FLOOR = 14_000_000;   // oldest possible Virtuals token on Base
const RPC_TIMEOUT_MS = 12_000;  // 12s per single RPC call
const DELAY_BETWEEN_MS = 150;    // 150ms between calls (rate-limit safety)

// Public Base RPC endpoints — same list as OpenClaw, ordered by reliability
const BASE_RPCS = [
    'https://base.llamarpc.com',
    'https://base.drpc.org',
    'https://mainnet.base.org',
    'https://1rpc.io/base',
    'https://base-rpc.publicnode.com',
];

// ─── Raw RPC caller ─────────────────────────────────────────────────────────

let _rpcIndex = 0;
let _lastCall = 0;

async function rpcCall(method, params) {
    // Throttle: at least DELAY_BETWEEN_MS between calls
    const now = Date.now();
    const elapsed = now - _lastCall;
    if (elapsed < DELAY_BETWEEN_MS) {
        await sleep(DELAY_BETWEEN_MS - elapsed);
    }
    _lastCall = Date.now();

    // Try each endpoint in order (round-robin on failure)
    for (let attempt = 0; attempt < BASE_RPCS.length; attempt++) {
        const url = BASE_RPCS[_rpcIndex % BASE_RPCS.length];
        try {
            const { data } = await axios.post(
                url,
                { jsonrpc: '2.0', id: 1, method, params },
                { timeout: RPC_TIMEOUT_MS }
            );
            if (data.error) {
                // Failover on RPC-level errors that are endpoint-specific
                const code = data.error?.code ?? 0;
                const msg = String(data.error?.message ?? '');
                const isEndpointQuirk =
                    code === -32001 || code === -32603 ||
                    msg.includes('incorrect response') ||
                    msg.includes('wrong json-rpc');

                if (isEndpointQuirk && attempt < BASE_RPCS.length - 1) {
                    _rpcIndex++;
                    await sleep(300);
                    continue;
                }
                throw new Error(`RPC[${url}] error: ${JSON.stringify(data.error)}`);
            }
            return data.result;
        } catch (err) {
            const status = err?.response?.status;
            const axiosOk = [400, 408, 429, 500, 502, 503, 504].includes(status);
            const netErr = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(err?.code ?? '');
            const timeout = err?.message?.includes('timeout');

            if ((axiosOk || netErr || timeout) && attempt < BASE_RPCS.length - 1) {
                console.warn(`   ⚠️ RPC[${url}] failed (${err.message?.slice(0, 60)}), trying next...`);
                _rpcIndex++;
                await sleep(300);
                continue;
            }
            throw err;
        }
    }
    throw new Error('All public Base RPC endpoints failed.');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── eth_getLogs chunked fetcher ─────────────────────────────────────────────

/**
 * Fetches Transfer logs for a contract in [fromBlock, toBlock] using CHUNK_SIZE windows.
 * Optionally filters by "to" address (topic[2]).
 */
async function fetchLogs(contractAddress, fromBlock, toBlock, toAddressFilter, onProgress) {
    const all = [];
    let chunk = CHUNK_SIZE;

    for (let from = fromBlock; from <= toBlock; from += chunk + 1) {
        const to = Math.min(from + chunk, toBlock);

        // Build topics: avoid null (some RPCs reject it) — use array filter instead
        let topics;
        if (toAddressFilter) {
            const padded = '0x000000000000000000000000' + toAddressFilter.slice(2).toLowerCase();
            topics = [TRANSFER_TOPIC, [], padded];
        } else {
            topics = [TRANSFER_TOPIC];
        }

        let retries = 0;
        while (retries <= 3) {
            try {
                const logs = await rpcCall('eth_getLogs', [{
                    address: contractAddress,
                    fromBlock: '0x' + from.toString(16),
                    toBlock: '0x' + to.toString(16),
                    topics,
                }]);
                if (logs) all.push(...logs);
                onProgress?.(`   ${from.toLocaleString()} → ${to.toLocaleString()}`);
                break;
            } catch (err) {
                retries++;
                console.warn(`   ⚠️ getLogs retry ${retries}/3 [${from}-${to}]: ${err.message?.slice(0, 80)}`);
                if (retries > 3) break;   // skip chunk on persistent failure
                chunk = Math.max(100, Math.floor(chunk / 2));
                await sleep(1000 * retries);
            }
        }
    }
    return all;
}

// ─── Launch Block Detection ───────────────────────────────────────────────────

/**
 * Finds deploy block via eth_getCode binary search.
 * Mirrors OpenClaw basescan.ts getDeployBlock() exactly.
 * Returns deploy block number.
 */
async function getDeployBlock(tokenAddress, currentBlock) {
    // Verify contract exists at latest block first
    const codeNow = await rpcCall('eth_getCode', [tokenAddress, 'latest']);
    if (!codeNow || codeNow === '0x') {
        throw new Error(`${tokenAddress} is not a contract on Base chain.`);
    }

    let lo = VIRTUALS_FLOOR;
    let hi = currentBlock;

    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        try {
            const code = await rpcCall('eth_getCode', [tokenAddress, '0x' + mid.toString(16)]);
            if (!code || code === '0x') {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        } catch (err) {
            console.warn(`   ⚠️ getCode error at ${mid}: ${err.message?.slice(0, 60)}`);
            await sleep(1000);
            // do NOT advance lo/hi on network error — retry same mid
        }
    }
    return lo;
}

/**
 * Finds the actual launch block (first real trading Transfer).
 * Scans forward from deploy block in CHUNK_SIZE windows looking for first Transfer.
 * Mirrors OpenClaw's approach.
 */
async function findLaunchBlock(tokenAddress, deployBlock, currentBlock) {
    console.log(`📋 Scanning forward from deploy block ${deployBlock} for first Transfer...`);

    for (let from = deployBlock; from <= Math.min(deployBlock + 300_000, currentBlock); from += CHUNK_SIZE + 1) {
        const to = Math.min(from + CHUNK_SIZE, currentBlock);
        try {
            const logs = await rpcCall('eth_getLogs', [{
                address: tokenAddress,
                fromBlock: '0x' + from.toString(16),
                toBlock: '0x' + to.toString(16),
                topics: [TRANSFER_TOPIC],
            }]);
            if (logs && logs.length > 0) {
                const firstBlock = parseInt(logs[0].blockNumber, 16);
                console.log(`✅ First Transfer at block ${firstBlock.toLocaleString()}`);
                return firstBlock;
            }
        } catch (err) {
            console.warn(`   ⚠️ getLogs error searching for launch [${from}-${to}]: ${err.message?.slice(0, 60)}`);
            await sleep(500);
        }
    }

    // Fallback: use deploy block itself
    console.warn(`⚠️ No transfers found within 300k blocks of deploy. Using deploy block.`);
    return deployBlock;
}

// ─── Main Tax Calculator ──────────────────────────────────────────────────────

/**
 * Calculates total VIRTUAL tax collected for a token.
 * Uses OpenClaw's O(1) in-memory intersection algorithm.
 *
 * @param {string} tokenAddress - Token contract address
 * @param {string} [rpcUrl] - Optional preferred RPC URL (ignored if it's mainnet.base.org)
 * @param {function} [onProgress] - Optional progress callback (percent, message)
 * @returns {Promise<TaxReport>}
 */
export async function calculateTax(tokenAddress, rpcUrl, onProgress) {
    // If a custom (non-default) RPC was provided, prepend it to our list
    if (rpcUrl && !rpcUrl.includes('mainnet.base.org') && !BASE_RPCS.includes(rpcUrl)) {
        BASE_RPCS.unshift(rpcUrl);
    }

    const progress = (pct, msg) => { onProgress?.(pct, msg); console.log(`[${pct}%] ${msg}`); };

    progress(5, 'Getting current block number...');
    const currentBlockHex = await rpcCall('eth_blockNumber', []);
    const currentBlock = parseInt(currentBlockHex, 16);
    console.log(`📦 Current block: ${currentBlock.toLocaleString()}`);

    progress(10, 'Finding contract deploy block via binary search...');
    const deployBlock = await getDeployBlock(tokenAddress.toLowerCase(), currentBlock);
    console.log(`📦 Contract deployed at block: ${deployBlock.toLocaleString()}`);

    progress(20, 'Locating first trading Transfer event...');
    const launchBlock = await findLaunchBlock(tokenAddress.toLowerCase(), deployBlock, currentBlock);
    const endBlock = Math.min(launchBlock + BLOCKS_TO_SCAN, currentBlock);

    const actualBlocksScanned = endBlock - launchBlock;
    const isComplete = (launchBlock + BLOCKS_TO_SCAN) <= currentBlock;
    const progressPercent = Math.min(100, Math.round((actualBlocksScanned / BLOCKS_TO_SCAN) * 100));

    console.log(`📊 Scan range: ${launchBlock.toLocaleString()} → ${endBlock.toLocaleString()} (${actualBlocksScanned} of ${BLOCKS_TO_SCAN} blocks)`);
    console.log(`   Complete: ${isComplete ? 'YES ✅' : `NO ⏳ (${progressPercent}%)`}`);

    // ── Step A: Fetch VIRTUAL → taxWallet transfers in scan window ─────────
    progress(30, `Fetching VIRTUAL tax transfers (blocks ${launchBlock}–${endBlock})...`);
    const taxLogs = await fetchLogs(
        VIRTUAL_ADDRESS,
        launchBlock,
        endBlock,
        TAX_WALLET   // filter: only transfers TO taxWallet
    );
    console.log(`📝 Found ${taxLogs.length} VIRTUAL→taxWallet transfers`);

    // ── Step B: Fetch target token Transfer logs to build txHash Set ───────
    progress(60, `Fetching ${tokenAddress.slice(0, 10)}... Transfer events...`);
    const tokenLogs = await fetchLogs(tokenAddress.toLowerCase(), launchBlock, endBlock);
    console.log(`📝 Found ${tokenLogs.length} target token Transfers`);

    // Build txHash → buyerAddress Map from token logs (OpenClaw style)
    const tokenTxMap = new Map();
    for (const log of tokenLogs) {
        const txHash = log.transactionHash.toLowerCase();
        // topic[2] = 'to' address (the buyer in a buy transfer)
        const toAddr = log.topics[2]
            ? '0x' + log.topics[2].slice(26).toLowerCase()
            : '0xunknown';
        // Skip mint events (from = zero address)
        const fromAddr = log.topics[1] ? '0x' + log.topics[1].slice(26).toLowerCase() : '';
        const ZERO = '0x0000000000000000000000000000000000000000';
        if (fromAddr !== ZERO) {
            tokenTxMap.set(txHash, toAddr);
        }
    }

    // ── Step C: O(1) memory intersection ───────────────────────────────────
    progress(80, 'Cross-referencing in memory...');

    const userTaxPaid = new Map();
    let totalTax = 0n;
    let validCount = 0;
    let skippedCount = 0;

    for (const log of taxLogs) {
        const txHash = log.transactionHash.toLowerCase();
        const taxAmtWei = BigInt(log.data || '0');

        if (tokenTxMap.has(txHash)) {
            // topic[1] of the VIRTUAL transfer = 'from' (the payer of the tax)
            const payer = log.topics[1]
                ? '0x' + log.topics[1].slice(26).toLowerCase()
                : '0xunknown';

            const prev = userTaxPaid.get(payer) || 0n;
            userTaxPaid.set(payer, prev + taxAmtWei);
            totalTax += taxAmtWei;
            validCount++;
        } else {
            skippedCount++;
        }
    }

    progress(95, 'Building report...');

    const totalTaxVirtual = parseFloat(formatEther(totalTax));

    const leaderboard = Array.from(userTaxPaid.entries())
        .map(([address, amt]) => ({
            address,
            taxPaidWei: amt.toString(),
            taxPaidVirtual: parseFloat(formatEther(amt)),
        }))
        .sort((a, b) => b.taxPaidVirtual - a.taxPaidVirtual);

    progress(100, 'Tax calculation complete!');

    const report = {
        tokenAddress,
        taxWallet: TAX_WALLET,
        launchBlock,
        scanStartBlock: launchBlock,
        scanEndBlock: endBlock,
        blocksScanned: actualBlocksScanned,
        totalBlocks: BLOCKS_TO_SCAN,
        progressPercent,
        isComplete,
        totalTaxWei: totalTax.toString(),
        totalTaxVirtual,
        validTransactions: validCount,
        skippedTransactions: skippedCount,
        uniquePayers: userTaxPaid.size,
        leaderboard: leaderboard.slice(0, 20),
        timestamp: new Date().toISOString(),
    };

    console.log('\n📊 ═══════════════════════════════════════════');
    console.log(`   Token: ${tokenAddress}`);
    console.log(`   Launch Block: ${launchBlock.toLocaleString()}`);
    console.log(`   Blocks Scanned: ${actualBlocksScanned}/${BLOCKS_TO_SCAN} (${progressPercent}%)`);
    console.log(`   Total Tax: ${totalTaxVirtual} VIRTUAL`);
    console.log(`   Valid TXs: ${validCount} | Skipped: ${skippedCount}`);
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
