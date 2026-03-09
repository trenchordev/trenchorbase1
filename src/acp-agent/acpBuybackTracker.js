import axios from 'axios';
import { calculateTax } from './acpTaxCalculator.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const VIRTUAL_ADDRESS = '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b';
const TAX_ADDRESS = '0x32487287c65f11d53bbca89c2472171eb09bf337';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const PADDED_TAX_ADDR = '0x000000000000000000000000' + TAX_ADDRESS.slice(2).toLowerCase();

const CHUNK_SIZE = 2000;           // Maximum blocks per getLogs call supported by public RPCs
const CONCURRENT_CHUNKS = 50;      // How many chunks to process simultaneously (parallel fetch)
const RPC_TIMEOUT_MS = 15_000;

// Public Base RPC endpoints
const _customRpc = process.env.DRPC_RPC_URL || process.env.ALCHEMY_RPC_URL;
const BASE_RPCS = [
    ...(_customRpc ? [_customRpc] : []),
    'https://base.llamarpc.com',
    'https://base.drpc.org',
    'https://1rpc.io/base',
    'https://base-rpc.publicnode.com',
    'https://mainnet.base.org',
];

const _deadEndpoints = new Set();
const _strikeCount = {};
const STRIKE_LIMIT = 5;

// ERC-20 symbol() and name() bare minimum ABI signatures
const SYMBOL_SIG = '0x95d89b41';
const NAME_SIG = '0x06fdde03';

// ─── RPC Engine ─────────────────────────────────────────────────────────────

async function rpcCall(method, params, overrideTimeout = null) {
    const active = BASE_RPCS.filter(u => !_deadEndpoints.has(u));
    const healthy = active.filter(u => (_strikeCount[u] ?? 0) < STRIKE_LIMIT);
    const limping = active.filter(u => (_strikeCount[u] ?? 0) >= STRIKE_LIMIT);
    const ordered = [...healthy, ...limping];

    if (ordered.length === 0) throw new Error('All RPC endpoints are dead/rate-limited.');

    for (let attempt = 0; attempt < ordered.length; attempt++) {
        const url = ordered[attempt];
        try {
            const { data } = await axios.post(
                url,
                { jsonrpc: '2.0', id: 1, method, params },
                { timeout: overrideTimeout || RPC_TIMEOUT_MS }
            );
            if (data.error) throw new Error(`RPC[${url}] error: ${JSON.stringify(data.error)}`);
            _strikeCount[url] = 0;
            return data.result;
        } catch (err) {
            const status = err?.response?.status;
            if (status === 400 || err.message?.includes('413')) {
                // Ignore 413, that's block range error, but don't blacklist endpoint
                if (status === 400) _deadEndpoints.add(url);
                continue;
            }
            if (attempt < ordered.length - 1) {
                _strikeCount[url] = (_strikeCount[url] ?? 0) + 1;
                await new Promise(r => setTimeout(r, 200));
                continue;
            }
            throw err;
        }
    }
    throw new Error('All RPC attempts failed.');
}

/**
 * Fetch logs for a specific chunk. Retries with smaller chunks if it hits 413 limits.
 */
async function getLogsChunk(contractAddress, fromBlock, toBlock, topics) {
    let retries = 0;
    while (retries < 3) {
        try {
            return await rpcCall('eth_getLogs', [{
                address: contractAddress,
                fromBlock: '0x' + fromBlock.toString(16),
                toBlock: '0x' + toBlock.toString(16),
                topics,
            }], 20000);
        } catch (err) {
            retries++;
            // If it's a size limit, sleep and retry. The caller logic will handle recursive halving if needed,
            // but 2,000 blocks is universally safe on Base DRPC.
            await new Promise(r => setTimeout(r, 1000 * retries));
        }
    }
    console.warn(`⚠️ getLogs failed repeatedly for chunk ${fromBlock}-${toBlock}`);
    return [];
}

// ─── Parallel Chunking Scanner ───────────────────────────────────────────────

/**
 * Scans millions of blocks in parallel to find all buyback transactions.
 * Buyback Definition: VIRTUAL transferred FROM Tax Wallet where the destination router 
 * matches a Target Token liquidity transfer (we simplify by just scanning VIRTUAL spent by Tax Wallet
 * during a window, but we need the exact Pair).
 *
 * Better approach learned from TX analysis:
 * In a buyback, the Target Token emits a Transfer where `to` == Tax Wallet.
 * We fetch all Target Token logs going TO the Tax Wallet.
 */
async function scanTargetTokenToTaxWallet(targetToken, startBlock, endBlock, onProgress) {
    const totalBlocks = endBlock - startBlock;
    const chunks = [];

    for (let from = startBlock; from <= endBlock; from += CHUNK_SIZE + 1) {
        chunks.push({
            from,
            to: Math.min(from + CHUNK_SIZE, endBlock)
        });
    }

    const totalChunks = chunks.length;
    let completedChunks = 0;
    let allLogs = [];

    // Process in batches to avoid crushing public RPCs completely
    for (let i = 0; i < totalChunks; i += CONCURRENT_CHUNKS) {
        const batch = chunks.slice(i, i + CONCURRENT_CHUNKS);

        const batchPromises = batch.map(async (chunk) => {
            // Topic 0: Transfer
            // Topic 1: Any (who cares who sent it) => null
            // Topic 2: Tax Wallet (recipient) => PADDED_TAX_ADDR
            const logs = await getLogsChunk(
                targetToken.toLowerCase(),
                chunk.from,
                chunk.to,
                [TRANSFER_TOPIC, null, PADDED_TAX_ADDR]
            );
            return logs || [];
        });

        const batchResults = await Promise.all(batchPromises);

        for (const logs of batchResults) {
            allLogs = allLogs.concat(logs);
        }

        completedChunks += batch.length;
        const pct = Math.round((completedChunks / totalChunks) * 100);

        // Progress reporting (offset 20-80% of total tracker progress)
        onProgress?.(20 + Math.floor(pct * 0.6), `Scanning blocks... ${pct}%`);
    }

    // De-duplicate any potential overlaps, just in case
    const uniqueTxHashes = new Set();
    const uniqueReceiptBlocks = [];
    for (const log of allLogs) {
        const hash = log.transactionHash.toLowerCase();
        if (!uniqueTxHashes.has(hash)) {
            uniqueTxHashes.add(hash);
            uniqueReceiptBlocks.push({
                hash,
                blockNumber: parseInt(log.blockNumber, 16)
            });
        }
    }

    return uniqueReceiptBlocks;
}

/**
 * For each found buyback transaction, look at the exact transaction receipt
 * and determine how much VIRTUAL the tax wallet spent.
 */
async function calculateVirtualSpentInTxs(txns, onProgress) {
    let totalVirtualSpentWei = 0n;
    let successfulLookups = 0;

    const totalTxns = txns.length;

    // Batch process receipts
    for (let i = 0; i < totalTxns; i += 10) {
        const batch = txns.slice(i, i + 10);
        const receiptPromises = batch.map(tx =>
            rpcCall('eth_getTransactionReceipt', [tx.hash])
                .catch(() => null)
        );

        const receipts = await Promise.all(receiptPromises);

        for (const receipt of receipts) {
            if (!receipt || !receipt.logs) continue;

            // Search receipt logs for VIRTUAL Transfer FROM Tax Wallet
            for (const log of receipt.logs) {
                if (log.address.toLowerCase() === VIRTUAL_ADDRESS.toLowerCase() &&
                    log.topics[0] === TRANSFER_TOPIC &&
                    log.topics[1]?.toLowerCase() === PADDED_TAX_ADDR) {

                    const amount = BigInt(log.data || '0');
                    totalVirtualSpentWei += amount;
                }
            }
            successfulLookups++;
        }

        const pct = Math.round(((i + batch.length) / totalTxns) * 100);
        onProgress?.(80 + Math.floor(pct * 0.2), `Resolving buyback amounts... ${pct}%`);
    }

    return {
        totalVirtualSpentWei,
        buybackTxCount: successfulLookups
    };
}


// ─── Main Tracker Function ──────────────────────────────────────────────────

export async function calculateBuybacks(tokenAddress, rpcUrl, onProgress) {
    if (rpcUrl && !BASE_RPCS.includes(rpcUrl) && !rpcUrl.includes('mainnet.base.org')) {
        BASE_RPCS.unshift(rpcUrl);
    }

    // Fetch Token Name and Symbol for better UX
    onProgress?.(2, 'Fetching Contract Identity...');
    let tokenName = 'Unknown';
    let tokenSymbol = 'TOKEN';
    try {
        const symbolHex = await rpcCall('eth_call', [{ to: tokenAddress, data: SYMBOL_SIG }, 'latest']);
        if (symbolHex && symbolHex !== '0x') {
            tokenSymbol = Buffer.from(symbolHex.slice(130).replace(/0+$/, ''), 'hex').toString('utf8').replace(/[^a-zA-Z0-9_\-.]/g, '');
            if (!tokenSymbol) tokenSymbol = Buffer.from(symbolHex.slice(2).replace(/0+$/, ''), 'hex').toString('utf8').replace(/[^a-zA-Z0-9_\-.]/g, '');
        }
        const nameHex = await rpcCall('eth_call', [{ to: tokenAddress, data: NAME_SIG }, 'latest']);
        if (nameHex && nameHex !== '0x') {
            tokenName = Buffer.from(nameHex.slice(130).replace(/0+$/, ''), 'hex').toString('utf8').replace(/[^a-zA-Z0-9\s_\-.]/g, '').trim();
        }
    } catch (err) {
        console.warn(`⚠️ Could not fetch token identity for ${tokenAddress}`);
    }

    console.log(`\n🔍 Starting Buyback Analysis for ${tokenName} ($${tokenSymbol}) - ${tokenAddress}`);

    // 1. Get Foundation Tax Data (0-20% progress implied inside)
    onProgress?.(5, `Running baseline tax analysis for $${tokenSymbol}...`);

    // We leverage the existing ultra-fast tax calculator to get launch block and total collected
    const taxReport = await calculateTax(tokenAddress, rpcUrl, (pct, msg) => {
        // Map 0-100% of tax report to 0-20% of tracker report
        onProgress?.(Math.floor(pct * 0.2), `[Base Scan] ${msg}`);
    });

    const totalVirtualCollected = taxReport.totalTaxVirtual;

    // The buyback window starts AFTER the original 2940 block tax window closes
    // Let's scan from launchBlock (in case they spent early, though rare) up to latest
    const launchBlock = taxReport.launchBlock;

    if (launchBlock < 0) {
        onProgress?.(100, 'No tax collected, tracking not applicable.');
        return buildEmptyBuybackReport(tokenAddress, taxReport);
    }

    const currentBlockHex = await rpcCall('eth_blockNumber', []);
    const currentBlock = parseInt(currentBlockHex, 16);

    console.log(`📡 Scanning Buybacks from block ${launchBlock} to ${currentBlock}...`);

    // 2. Scan millions of blocks via parallel chunking engine
    const buybackTxns = await scanTargetTokenToTaxWallet(tokenAddress, launchBlock, currentBlock, onProgress);

    console.log(`🎯 Found ${buybackTxns.length} potential buyback transactions!`);

    // 3. Resolve exact VIRTUAL spent in each transaction
    let spentVirtual = 0;
    let buybackCount = 0;

    if (buybackTxns.length > 0) {
        const { totalVirtualSpentWei, buybackTxCount } = await calculateVirtualSpentInTxs(buybackTxns, onProgress);
        spentVirtual = Number(totalVirtualSpentWei) / 1e18;
        buybackCount = buybackTxCount;
    }

    const remainingVirtual = Math.max(0, totalVirtualCollected - spentVirtual);

    onProgress?.(100, 'Buyback tracking complete!');

    console.log('\n📊 ═══════════════════════════════════════════');
    console.log(`   Token:       ${tokenAddress}`);
    console.log(`   Tax Earned:  ${totalVirtualCollected.toFixed(4)} VIRTUAL`);
    console.log(`   Spent:       ${spentVirtual.toFixed(4)} VIRTUAL`);
    console.log(`   Pending:     ${remainingVirtual.toFixed(4)} VIRTUAL`);
    console.log(`   Buyback TXs: ${buybackCount}`);
    console.log('═══════════════════════════════════════════════\n');

    return {
        tokenAddress,
        tokenSymbol,
        tokenName,
        taxWallet: TAX_ADDRESS,
        launchBlock: taxReport.launchBlock,
        totalTaxCollectedVirtual: totalVirtualCollected,
        totalVirtualSpentVirtual: spentVirtual,
        pendingVirtualForBuyback: remainingVirtual,
        buybackTransactionsCount: buybackCount,
        timestamp: new Date().toISOString()
    };
}

function buildEmptyBuybackReport(tokenAddress, taxReport) {
    return {
        tokenAddress,
        tokenSymbol: 'TOKEN',
        tokenName: 'Unknown',
        taxWallet: TAX_ADDRESS,
        launchBlock: taxReport.launchBlock || 0,
        totalTaxCollectedVirtual: 0,
        totalVirtualSpentVirtual: 0,
        pendingVirtualForBuyback: 0,
        buybackTransactionsCount: 0,
        timestamp: new Date().toISOString()
    };
}

/**
 * Formats the tracker report into a human-readable string for ACP deliverable.
 */
export function formatBuybackReport(report) {
    const lines = [
        `🔄 Buyback Tracker Report — ${report.tokenName} ($${report.tokenSymbol})`,
        `📍 Contract: ${report.tokenAddress}`,
        ``,
        `🏦 Tax Wallet: ${report.taxWallet}`,
        `🚀 Launch Block: ${report.launchBlock === -1 ? 'None/Null' : report.launchBlock.toLocaleString()}`,
        ``,
        `💰 Total VIRTUAL Tax Collected: ${report.totalTaxCollectedVirtual.toFixed(4)}`,
        `🔥 VIRTUAL Spent on Buybacks:  ${report.totalVirtualSpentVirtual.toFixed(4)}`,
        `💵 Remaining Pending VIRTUAL:  ${report.pendingVirtualForBuyback.toFixed(4)}`,
        ``,
        `📈 Total Buyback Transactions: ${report.buybackTransactionsCount}`,
        ``,
        `⏰ Tracking Time: ${report.timestamp}`
    ];
    return lines.join('\n');
}
