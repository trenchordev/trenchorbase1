/**
 * ACP Tax Calculator Module — v5 (OpenClaw analyzer.ts port)
 *
 * Uses INTERSECTION-FIRST launch discovery — the ONLY reliable approach for
 * Virtuals Protocol tokens. Mirrors OpenClaw's analyzer.ts exactly:
 *
 *   1. Find deploy block via eth_getCode binary search (O(log N) = ~25 calls)
 *   2. Scan forward in CHUNK_SIZE (900-block) windows from deploy block.
 *      In each window, check if VIRTUAL→TAX_ADDRESS and target token Transfers
 *      share a txHash. This is the ONLY reliable signal of real trading start.
 *   3. Once the launch block (first intersection) is found, scan [launch, launch+2940]
 *      to collect all VIRTUAL→TAX_ADDRESS transfers intersecting token buys.
 *
 * Why: "first non-mint Transfer" is unreliable. Virtuals tokens have internal
 * distributions/burns before real bonding-curve trading starts.
 * The correct signal is VIRTUAL→taxAddress in the same tx as a token transfer.
 *
 * NO DexScreener. NO viem. NO receipt fetches. Pure axios.
 */

import axios from 'axios';

// ─── Constants ────────────────────────────────────────────────────────────────

const VIRTUAL_ADDRESS = '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b';
const TAX_ADDRESS = '0x32487287c65f11d53bbca89c2472171eb09bf337';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const BLOCKS_TO_SCAN = 2940;      // ~98 minutes at 2s/block
const CHUNK_SIZE = 900;       // max safe eth_getLogs per public RPC
const VIRTUALS_FLOOR = 14_000_000; // oldest possible Virtuals token on Base
const RPC_TIMEOUT_MS = 12_000;   // per-call timeout
const DELAY_BETWEEN_MS = 200;      // rate-limit safety delay (higher = fewer 429s under concurrent load)
const DISCOVERY_WINDOW = 300_000;  // scan up to ~7 days after deploy to find launch

// Public Base RPC endpoints — ordered by reliability (most stable first)
// ALCHEMY_RPC_URL env var goes first when set (paid/high-limit endpoint).
// All others are free public RPCs used as fallback.
const BASE_RPCS = [
    ...(process.env.ALCHEMY_RPC_URL ? [process.env.ALCHEMY_RPC_URL] : []),
    'https://base.llamarpc.com',
    'https://base.drpc.org',
    'https://1rpc.io/base',
    'https://base-rpc.publicnode.com',
    'https://mainnet.base.org',
];

// Startup log — confirms which RPCs are active (check logs after deploy)
console.log(`🔌 RPC list (${BASE_RPCS.length} endpoints): ${BASE_RPCS.map((u, i) => `\n   [${i}] ${u}`).join('')}`);

// ─── Raw RPC caller ─────────────────────────────────────────────────────────

let _rpcIndex = 0;
let _lastCall = 0;

async function rpcCall(method, params) {
    const now = Date.now();
    const elapsed = now - _lastCall;
    if (elapsed < DELAY_BETWEEN_MS) await sleep(DELAY_BETWEEN_MS - elapsed);
    _lastCall = Date.now();

    // Always start from index 0 (Alchemy if configured, otherwise llamarpc).
    // _rpcIndex must NOT drift between calls — otherwise Alchemy gets skipped.
    const startIndex = 0;

    for (let attempt = 0; attempt < BASE_RPCS.length; attempt++) {
        const url = BASE_RPCS[(startIndex + attempt) % BASE_RPCS.length];
        try {
            const { data } = await axios.post(
                url,
                { jsonrpc: '2.0', id: 1, method, params },
                { timeout: RPC_TIMEOUT_MS }
            );
            if (data.error) {
                const code = data.error?.code ?? 0;
                const msg = String(data.error?.message ?? '');
                // Endpoint-specific errors: failover to next RPC instead of throwing.
                // -32000: block data not available (llamarpc/drpc don't archive all blocks)
                // -32001: wrong response body (endpoint quirk)
                // -32002: historical state not available
                // -32603: internal error
                const isEndpointQuirk =
                    code === -32000 || code === -32001 || code === -32002 || code === -32603 ||
                    msg.includes('data not available') ||
                    msg.includes('historical state') ||
                    msg.includes('incorrect response') ||
                    msg.includes('wrong json-rpc');
                if (isEndpointQuirk && attempt < BASE_RPCS.length - 1) {
                    console.warn(`   ⚠️ RPC[${url}] quirk (code ${code}), failover...`);
                    await sleep(300);
                    continue;
                }
                throw new Error(`RPC[${url}] error: ${JSON.stringify(data.error)}`);
            }
            return data.result;
        } catch (err) {
            const status = err?.response?.status;
            const axiosOk = [400, 408, 413, 429, 500, 502, 503, 504].includes(status);
            const netErr = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(err?.code ?? '');
            const timeout = err?.message?.includes('timeout');
            if ((axiosOk || netErr || timeout) && attempt < BASE_RPCS.length - 1) {
                console.warn(`   ⚠️ RPC[${url}] failed (${err.message?.slice(0, 50)}), trying next...`);
                await sleep(300);
                continue;
            }
            throw err;
        }
    }
    throw new Error('All public Base RPC endpoints failed.');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── eth_getLogs helpers ─────────────────────────────────────────────────────

/**
 * Fetch one chunk of Transfer logs.
 * toAddressFilter: if set, filters by topic[2] (recipient address).
 * Uses `null` (not `[]`) for wildcard — drpc.org returns HTTP 500 for `[]`.
 */
async function getLogsChunk(contractAddress, fromBlock, toBlock, toAddressFilter) {
    let topics;
    if (toAddressFilter) {
        const padded = '0x000000000000000000000000' + toAddressFilter.slice(2).toLowerCase();
        topics = [TRANSFER_TOPIC, null, padded];
    } else {
        topics = [TRANSFER_TOPIC];
    }
    return rpcCall('eth_getLogs', [{
        address: contractAddress,
        fromBlock: '0x' + fromBlock.toString(16),
        toBlock: '0x' + toBlock.toString(16),
        topics,
    }]);
}

/**
 * Fetch all Transfer logs in [fromBlock, toBlock] in CHUNK_SIZE windows.
 * Retries with half-chunk on block-range errors.
 */
async function fetchLogs(contractAddress, fromBlock, toBlock, toAddressFilter) {
    const all = [];
    let chunk = CHUNK_SIZE;

    for (let from = fromBlock; from <= toBlock; from += chunk + 1) {
        const to = Math.min(from + chunk, toBlock);
        let retries = 0;
        while (true) {
            try {
                const logs = await getLogsChunk(contractAddress, from, to, toAddressFilter);
                if (logs) all.push(...logs);
                break;
            } catch (err) {
                retries++;
                console.warn(`   ⚠️ getLogs retry ${retries}/3 [${from}-${to}]: ${err.message?.slice(0, 60)}`);
                if (retries >= 3) break;
                chunk = Math.max(100, Math.floor(chunk / 2));
                await sleep(1000 * retries);
            }
        }
    }
    return all;
}

// ─── Deploy Block Detection ───────────────────────────────────────────────────

/**
 * Binary search for the first block where the contract code exists.
 * O(log N) = ~25 RPC calls, handles any token age.
 */
async function getDeployBlock(tokenAddress, currentBlock) {
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
            if (!code || code === '0x') { lo = mid + 1; } else { hi = mid; }
        } catch (err) {
            console.warn(`   ⚠️ getCode error at ${mid}: ${err.message?.slice(0, 50)}`);
            await sleep(1000);
        }
    }
    return lo;
}

// ─── Intersection-First Launch Discovery ──────────────────────────────────────

/**
 * Finds the real launch block (first block where a VIRTUAL→TAX_ADDRESS transfer
 * and a target token Transfer share the same txHash).
 *
 * This is the ONLY reliable method for Virtuals Protocol tokens:
 * - New model: launch happens immediately at deploy
 * - Old model: launch is days/weeks after deploy (prebonding phase)
 * VIRTUAL→taxAddress only flows during bonding-curve buys — so the first
 * intersection IS the true launch block.
 *
 * Scans forward in CHUNK_SIZE steps from deploy block.
 * Falls back to deploy block if no intersection found in DISCOVERY_WINDOW blocks.
 */
async function findLaunchBlock(tokenAddress, deployBlock, currentBlock) {
    console.log(`📋 Finding launch block via VIRTUAL-tax intersection...`);
    const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';

    const scanEnd = Math.min(deployBlock + DISCOVERY_WINDOW, currentBlock);

    for (let from = deployBlock; from <= scanEnd; from += CHUNK_SIZE + 1) {
        const to = Math.min(from + CHUNK_SIZE, scanEnd);

        const [tokenLogs, taxLogs] = await Promise.all([
            getLogsChunk(tokenAddress, from, to, null).catch(() => []),
            getLogsChunk(VIRTUAL_ADDRESS, from, to, TAX_ADDRESS).catch(() => []),
        ]);

        if (!tokenLogs?.length || !taxLogs?.length) continue;

        // Build txHash set from VIRTUAL tax transfers
        const taxTxSet = new Set(taxLogs.map(l => l.transactionHash.toLowerCase()));

        // Find token transfers in the same txs (skip mints)
        const matches = tokenLogs.filter(l =>
            l.topics[1]?.toLowerCase() !== ZERO &&
            taxTxSet.has(l.transactionHash.toLowerCase())
        );

        if (matches.length > 0) {
            matches.sort((a, b) => parseInt(a.blockNumber, 16) - parseInt(b.blockNumber, 16));
            const launchBlock = parseInt(matches[0].blockNumber, 16);
            console.log(`✅ Launch block: ${launchBlock.toLocaleString()} (${launchBlock - deployBlock} blocks after deploy)`);
            return launchBlock;
        }
    }

    console.warn(`⚠️ No intersection found in ${DISCOVERY_WINDOW.toLocaleString()} blocks. This token may have 0 tax.`);
    return -1; // Signals: no taxed buys found
}

// ─── Main Tax Calculator ──────────────────────────────────────────────────────

/**
 * Calculates total VIRTUAL tax collected for a Virtuals token.
 * Mirrors OpenClaw's analyzer.ts v3 exactly.
 *
 * @param {string} tokenAddress - Token contract address
 * @param {string|null} rpcUrl - Optional preferred RPC URL (prepended to failover list)
 * @param {function} onProgress - Progress callback (percent, message)
 * @returns {Promise<TaxReport>}
 */
export async function calculateTax(tokenAddress, rpcUrl, onProgress) {
    if (rpcUrl && !rpcUrl.includes('mainnet.base.org') && !BASE_RPCS.includes(rpcUrl)) {
        BASE_RPCS.unshift(rpcUrl);
    }

    const progress = (pct, msg) => { onProgress?.(pct, msg); console.log(`[${pct}%] ${msg}`); };
    const normToken = tokenAddress.toLowerCase();

    // ── Step 1: Current block + deploy block ─────────────────────────────────
    progress(5, 'Getting current block...');
    const currentBlockHex = await rpcCall('eth_blockNumber', []);
    const currentBlock = parseInt(currentBlockHex, 16);
    console.log(`📦 Current block: ${currentBlock.toLocaleString()}`);

    progress(10, 'Finding contract deploy block via binary search...');
    const deployBlock = await getDeployBlock(normToken, currentBlock);
    console.log(`📦 Deploy block: ${deployBlock.toLocaleString()}`);

    // ── Step 2: Find launch block via intersection discovery ─────────────────
    progress(20, 'Finding launch block (intersection-first discovery)...');
    const launchBlock = await findLaunchBlock(normToken, deployBlock, currentBlock);

    if (launchBlock < 0) {
        // Token has never had a taxed buy in its lifecycle
        progress(100, 'No taxed buys detected.');
        return buildEmptyReport(tokenAddress, deployBlock, deployBlock + BLOCKS_TO_SCAN);
    }

    const endBlock = Math.min(launchBlock + BLOCKS_TO_SCAN, currentBlock);
    const blocksScanned = endBlock - launchBlock;
    const isComplete = (launchBlock + BLOCKS_TO_SCAN) <= currentBlock;
    const progressPercent = Math.min(100, Math.round((blocksScanned / BLOCKS_TO_SCAN) * 100));

    console.log(`📊 Tax window: ${launchBlock.toLocaleString()} → ${endBlock.toLocaleString()}`);
    console.log(`   ${blocksScanned}/${BLOCKS_TO_SCAN} blocks (${progressPercent}%) | Complete: ${isComplete}`);

    // ── Step 3: Fetch all token TXs in the window → build txHash→buyer map ──
    progress(40, `Fetching ${normToken.slice(0, 10)}... Transfer events in tax window...`);
    const tokenLogs = await fetchLogs(normToken, launchBlock, endBlock, null);
    console.log(`📝 Token transfers: ${tokenLogs.length}`);

    const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
    const txToMap = new Map(); // txHash → buyer address
    for (const log of tokenLogs) {
        const txHash = log.transactionHash.toLowerCase();
        const fromAddr = log.topics[1] ? '0x' + log.topics[1].slice(26).toLowerCase() : '';
        const toAddr = log.topics[2] ? '0x' + log.topics[2].slice(26).toLowerCase() : '';
        // Skip mints and transfers TO tax receiver
        if (fromAddr !== ZERO_ADDR && toAddr !== TAX_ADDRESS.toLowerCase()) {
            txToMap.set(txHash, toAddr);
        }
    }

    // ── Step 4: Fetch VIRTUAL→TAX_ADDRESS transfers ──────────────────────────
    progress(65, 'Fetching VIRTUAL tax transfers in tax window...');
    const taxLogs = await fetchLogs(VIRTUAL_ADDRESS, launchBlock, endBlock, TAX_ADDRESS);
    console.log(`📝 VIRTUAL tax transfers: ${taxLogs.length}`);

    // ── Step 5: O(1) memory intersection ─────────────────────────────────────
    progress(85, 'Cross-referencing in memory...');

    const userTaxPaid = new Map(); // buyer → total VIRTUAL wei
    let totalTax = 0n;
    let validCount = 0;

    for (const log of taxLogs) {
        const txHash = log.transactionHash.toLowerCase();
        const taxAmtWei = BigInt(log.data || '0');

        if (txToMap.has(txHash)) {
            const buyer = txToMap.get(txHash);
            const prev = userTaxPaid.get(buyer) || 0n;
            userTaxPaid.set(buyer, prev + taxAmtWei);
            totalTax += taxAmtWei;
            validCount++;
        }
    }

    // ── Step 6: Build report ──────────────────────────────────────────────────
    progress(95, 'Building report...');

    const totalTaxVirtual = Number(totalTax) / 1e18;
    const leaderboard = Array.from(userTaxPaid.entries())
        .map(([address, amt]) => ({
            address,
            taxPaidVirtual: Number(amt) / 1e18,
        }))
        .sort((a, b) => b.taxPaidVirtual - a.taxPaidVirtual);

    progress(100, 'Tax calculation complete!');

    const report = {
        tokenAddress,
        taxWallet: TAX_ADDRESS,
        launchBlock,
        deployBlock,
        scanStartBlock: launchBlock,
        scanEndBlock: endBlock,
        blocksScanned,
        totalBlocks: BLOCKS_TO_SCAN,
        progressPercent,
        isComplete,
        totalTaxWei: totalTax.toString(),
        totalTaxVirtual,
        validTransactions: validCount,
        skippedTransactions: taxLogs.length - validCount,
        uniquePayers: userTaxPaid.size,
        leaderboard: leaderboard.slice(0, 20),
        timestamp: new Date().toISOString(),
    };

    console.log('\n📊 ═══════════════════════════════════════════');
    console.log(`   Token:  ${tokenAddress}`);
    console.log(`   Launch: ${launchBlock.toLocaleString()}`);
    console.log(`   Blocks: ${blocksScanned}/${BLOCKS_TO_SCAN} (${progressPercent}%)`);
    console.log(`   Tax:    ${totalTaxVirtual.toFixed(4)} VIRTUAL`);
    console.log(`   Hits:   ${validCount}/${taxLogs.length}`);
    console.log('═══════════════════════════════════════════════\n');

    return report;
}

function buildEmptyReport(tokenAddress, launchBlock, endBlock) {
    return {
        tokenAddress,
        taxWallet: TAX_ADDRESS,
        launchBlock,
        deployBlock: launchBlock,
        scanStartBlock: launchBlock,
        scanEndBlock: endBlock,
        blocksScanned: BLOCKS_TO_SCAN,
        totalBlocks: BLOCKS_TO_SCAN,
        progressPercent: 100,
        isComplete: true,
        totalTaxWei: '0',
        totalTaxVirtual: 0,
        validTransactions: 0,
        skippedTransactions: 0,
        uniquePayers: 0,
        leaderboard: [],
        timestamp: new Date().toISOString(),
    };
}

/**
 * Formats a tax report into a human-readable string for ACP deliverable.
 */
export function formatTaxReport(report) {
    const lines = [
        `📊 Tax Report — ${report.tokenAddress}`,
        ``,
        `🏷️  Tax Wallet: ${report.taxWallet}`,
        `🚀 Launch Block: ${report.launchBlock.toLocaleString()}`,
        `📦 Blocks Scanned: ${report.blocksScanned} / ${report.totalBlocks} (${report.progressPercent}%)`,
        `${report.isComplete ? '✅ Tax period complete' : '⏳ Token still in tax period'}`,
        ``,
        `💰 Total Tax Collected: ${report.totalTaxVirtual.toFixed(6)} VIRTUAL`,
        `📝 Tax Transactions: ${report.validTransactions}`,
        `👥 Unique Tax Payers: ${report.uniquePayers}`,
        ``,
    ];

    if (report.leaderboard.length > 0) {
        lines.push(`🏆 Top Tax Payers:`);
        report.leaderboard.slice(0, 10).forEach((p, i) => {
            lines.push(`   ${i + 1}. ${p.address}: ${p.taxPaidVirtual.toFixed(4)} VIRTUAL`);
        });
        lines.push(``);
    }

    lines.push(`⏰ Generated: ${report.timestamp}`);
    return lines.join('\n');
}
