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
import { createPublicClient, http, parseAbi, trim, hexToString } from 'viem';
import { base } from 'viem/chains';

// ─── Constants ────────────────────────────────────────────────────────────────

const VIRTUAL_ADDRESS = '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b';
const TAX_ADDRESS = '0x32487287c65f11d53bbca89c2472171eb09bf337';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const BLOCKS_TO_SCAN = 2940;      // ~98 minutes at 2s/block
const CHUNK_SIZE = 2000;           // blocks per eth_getLogs call (2000 safe for drpc/llamarpc)
const DISCOVERY_PARALLELISM = 3;   // how many chunks to scan simultaneously during launch discovery
const VIRTUALS_FLOOR = 1_000_000;  // floor for deploy-block binary search; 1M covers all Base history incl. early VIRTUAL token
const RPC_TIMEOUT_MS = 12_000;   // per-call timeout
const DELAY_BETWEEN_MS = 200;      // rate-limit safety delay (higher = fewer 429s under concurrent load)
const DISCOVERY_WINDOW = 600_000;  // scan up to ~14 days after deploy to find launch (some tokens have 10+ day gaps)

const SYMBOL_SIG = '0x95d89b41';

// ─── Viem Client ────────────────────────────────────────────────────────────

const viemClient = createPublicClient({ chain: base, transport: http(process.env.DRPC_RPC_URL || process.env.ALCHEMY_RPC_URL || 'https://mainnet.base.org') });
const erc20StringAbi = parseAbi(['function name() view returns (string)', 'function symbol() view returns (string)']);
const erc20Bytes32Abi = parseAbi(['function name() view returns (bytes32)', 'function symbol() view returns (bytes32)']);

// Public Base RPC endpoints — ordered by reliability (most stable first)
// Supports DRPC_RPC_URL or ALCHEMY_RPC_URL env vars (drpc takes priority).
// All others are free public RPCs used as fallback.
const _customRpc = process.env.DRPC_RPC_URL || process.env.ALCHEMY_RPC_URL;
const BASE_RPCS = [
    ...(_customRpc ? [_customRpc] : []),
    'https://base.llamarpc.com',
    'https://base.drpc.org',
    'https://1rpc.io/base',
    'https://base-rpc.publicnode.com',
    'https://mainnet.base.org',
];

// Startup log — confirms which RPCs are active (check logs after deploy)
console.log(`🔌 RPC list (${BASE_RPCS.length} endpoints): ${BASE_RPCS.map((u, i) => `\n   [${i}] ${u}`).join('')}`);

// Session-level endpoint health tracking.
// 400 = permanent config error → blacklisted immediately.
// Other errors count strikes; after 5 strikes endpoint is temporarily deprioritized.
const _deadEndpoints = new Set();  // permanently skip (e.g. bad API key)
const _strikeCount = {};           // url → consecutive failure count
const STRIKE_LIMIT = 5;
let _lastCall = 0;                 // timestamp of last RPC call (rate-limit throttle)

async function rpcCall(method, params) {
    const now = Date.now();
    const elapsed = now - _lastCall;
    if (elapsed < DELAY_BETWEEN_MS) await sleep(DELAY_BETWEEN_MS - elapsed);
    _lastCall = Date.now();

    // Build active endpoint list: skip dead ones, try struck ones last
    const active = BASE_RPCS.filter(u => !_deadEndpoints.has(u));
    const healthy = active.filter(u => (_strikeCount[u] ?? 0) < STRIKE_LIMIT);
    const limping = active.filter(u => (_strikeCount[u] ?? 0) >= STRIKE_LIMIT);
    const ordered = [...healthy, ...limping];

    if (ordered.length === 0) {
        throw new Error('All RPC endpoints are dead or rate-limited. Please check your configuration.');
    }

    for (let attempt = 0; attempt < ordered.length; attempt++) {
        const url = ordered[attempt];
        try {
            const { data } = await axios.post(
                url,
                { jsonrpc: '2.0', id: 1, method, params },
                { timeout: RPC_TIMEOUT_MS }
            );
            if (data.error) {
                const code = data.error?.code ?? 0;
                const msg = String(data.error?.message ?? '');
                const isEndpointQuirk =
                    code === -32000 || code === -32001 || code === -32002 || code === -32603 ||
                    msg.includes('data not available') ||
                    msg.includes('historical state') ||
                    msg.includes('incorrect response') ||
                    msg.includes('wrong json-rpc');
                if (isEndpointQuirk && attempt < ordered.length - 1) {
                    _strikeCount[url] = (_strikeCount[url] ?? 0) + 1;
                    console.warn(`   ⚠️ RPC[${url}] quirk (code ${code}), failover...`);
                    await sleep(200);
                    continue;
                }
                throw new Error(`RPC[${url}] error: ${JSON.stringify(data.error)}`);
            }
            // Success — clear strikes
            _strikeCount[url] = 0;
            return data.result;
        } catch (err) {
            const status = err?.response?.status;

            // 400 = Bad Request (wrong URL, invalid API key) — blacklist permanently
            if (status === 400) {
                console.warn(`   🚫 RPC[${url}] blacklisted (HTTP 400 — bad API key or wrong URL). Will not retry.`);
                _deadEndpoints.add(url);
                continue; // skip to next endpoint
            }

            const retriable = [408, 413, 429, 500, 502, 503, 504].includes(status) ||
                ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(err?.code ?? '') ||
                err?.message?.includes('timeout');

            if (retriable && attempt < ordered.length - 1) {
                _strikeCount[url] = (_strikeCount[url] ?? 0) + 1;
                console.warn(`   ⚠️ RPC[${url}] failed (${err.message?.slice(0, 45)}), trying next...`);
                await sleep(200);
                continue;
            }
            throw err;
        }
    }
    throw new Error('All active Base RPC endpoints failed.');
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

const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || '';

/**
 * Fast deploy block lookup via BaseScan API (1 HTTP call, no archival RPC needed).
 * Returns block number or null on failure.
 */
async function getDeployBlockFromBaseScan(tokenAddress) {
    if (!BASESCAN_API_KEY) return null;
    try {
        const url = `https://api.basescan.org/api?module=contract&action=getcontractcreation&contractaddresses=${tokenAddress}&apikey=${BASESCAN_API_KEY}`;
        const { data } = await axios.get(url, { timeout: 8000 });
        if (data?.status === '1' && data?.result?.[0]?.blockNumber) {
            const block = parseInt(data.result[0].blockNumber, 10);
            console.log(`✅ BaseScan deploy block: ${block.toLocaleString()} (1 API call)`);
            return block;
        }
    } catch (err) {
        console.warn(`   ⚠️ BaseScan deploy block lookup failed: ${err.message?.slice(0, 60)}`);
    }
    return null;
}

/**
 * Finds the first block where the contract exists.
 * Strategy: BaseScan API first (fast, no archival RPC) → binary search fallback.
 */
async function getDeployBlock(tokenAddress, currentBlock) {
    const codeNow = await rpcCall('eth_getCode', [tokenAddress, 'latest']);
    if (!codeNow || codeNow === '0x') {
        console.warn(`⚠️ DEVREL Bypass: ${tokenAddress} is an EOA (no bytecode). Gracefully returning empty scan window.`);
        return currentBlock;
    }

    // Primary: BaseScan API — 1 call, works for any token age, no archival RPC needed
    const bsBlock = await getDeployBlockFromBaseScan(tokenAddress);
    if (bsBlock && bsBlock > 0) return bsBlock;

    // Fallback: binary search over RPC (requires archival node for old tokens)
    console.warn(`   ⚠️ BaseScan unavailable, falling back to binary search...`);
    let lo = VIRTUALS_FLOOR;
    let hi = currentBlock;
    let maxIter = 60; // log2(currentBlock) ≈ 25; 60 is a generous safety cap
    while (lo < hi && maxIter-- > 0) {
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

    // Build array of all chunk start positions
    const chunks = [];
    for (let from = deployBlock; from <= scanEnd; from += CHUNK_SIZE + 1) {
        chunks.push(from);
    }

    // Process chunks in parallel batches (DISCOVERY_PARALLELISM chunks at a time)
    for (let i = 0; i < chunks.length; i += DISCOVERY_PARALLELISM) {
        const batch = chunks.slice(i, i + DISCOVERY_PARALLELISM);

        // Fetch all chunks in this batch simultaneously
        const results = await Promise.all(batch.map(async (from) => {
            const to = Math.min(from + CHUNK_SIZE, scanEnd);
            const [tokenLogs, taxLogs] = await Promise.all([
                getLogsChunk(tokenAddress, from, to, null).catch(() => []),
                getLogsChunk(VIRTUAL_ADDRESS, from, to, TAX_ADDRESS).catch(() => []),
            ]);
            return { from, to, tokenLogs, taxLogs };
        }));

        // Check results in chronological order (earliest chunk first)
        for (const { tokenLogs, taxLogs } of results) {
            if (!tokenLogs?.length || !taxLogs?.length) continue;

            const taxTxSet = new Set(taxLogs.map(l => l.transactionHash.toLowerCase()));
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
    }

    console.warn(`⚠️ No intersection found in ${DISCOVERY_WINDOW.toLocaleString()} blocks. This token may have 0 tax.`);
    return -1;
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

    // Fetch Token Name and Symbol utilizing Viem for robust ABI decoding.
    // Each field has its own independent try-catch so a failure on one never skips the other.
    // bytes32 fallback uses hexToString(trim(...)) — viem's trim() returns hex, not a decoded string.
    let tokenName = 'Unknown';
    let tokenSymbol = 'TOKEN';

    try {
        tokenName = await viemClient.readContract({ address: normToken, abi: erc20StringAbi, functionName: 'name' });
    } catch {
        try {
            const nameB = await viemClient.readContract({ address: normToken, abi: erc20Bytes32Abi, functionName: 'name' });
            tokenName = hexToString(trim(nameB, { dir: 'right' })).trim();
        } catch (err) {
            console.warn(`⚠️ name() failed for ${tokenAddress}: ${err.shortMessage || err.message}`);
        }
    }

    try {
        tokenSymbol = await viemClient.readContract({ address: normToken, abi: erc20StringAbi, functionName: 'symbol' });
    } catch {
        try {
            const symbolB = await viemClient.readContract({ address: normToken, abi: erc20Bytes32Abi, functionName: 'symbol' });
            tokenSymbol = hexToString(trim(symbolB, { dir: 'right' })).trim();
        } catch (err) {
            console.warn(`⚠️ symbol() failed for ${tokenAddress}: ${err.shortMessage || err.message}`);
        }
    }

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
        return buildEmptyReport(tokenAddress, deployBlock, deployBlock + BLOCKS_TO_SCAN, tokenName, tokenSymbol);
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
        tokenSymbol,
        tokenName,
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

function buildEmptyReport(tokenAddress, launchBlock, endBlock, tokenName = 'Unknown', tokenSymbol = 'TOKEN') {
    return {
        tokenAddress,
        tokenSymbol,
        tokenName,
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
        `📊 Tax Report — ${report.tokenName} ($${report.tokenSymbol})`,
        `📍 Contract: ${report.tokenAddress}`,
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
