import axios from 'axios';
import { calculateTax } from './acpTaxCalculator.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const VIRTUAL_ADDRESS = '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b';
const TAX_ADDRESS = '0x32487287c65f11d53bbca89c2472171eb09bf337';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const PADDED_TAX_ADDR = '0x000000000000000000000000' + TAX_ADDRESS.slice(2).toLowerCase();

const CHUNK_SIZE = 50000;          // Aggressively scan up to 50k blocks per request 
const CONCURRENT_CHUNKS = 20;      // Lower concurrency to respect RPC rate limits when fetching huge chunks
const RPC_TIMEOUT_MS = 25_000;     // Allow more time for massive payload resolutions

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

// ERC-20 symbol(), name(), and decimals() bare minimum ABI signatures
const SYMBOL_SIG = '0x95d89b41';
const NAME_SIG = '0x06fdde03';
const DECIMALS_SIG = '0x313ce567';

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
            if (status === 400 || err.message?.includes('413') || status === 413) {
                // Ignore 413, that's block range error, but don't blacklist endpoint
                if (status === 400) _deadEndpoints.add(url);
                throw new Error(`RPC size limit hit (413/400): ${err.message}`);
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
    try {
        return await rpcCall('eth_getLogs', [{
            address: contractAddress,
            fromBlock: '0x' + fromBlock.toString(16),
            toBlock: '0x' + toBlock.toString(16),
            topics,
        }], 25000);
    } catch (err) {
        // If the payload is too large natively (413 or 400 limitation), dynamically slice the chunk in half and recurse.
        // Base mainnet public RPCs aggressively limit getLogs if the range contains too many target events.
        if (err.message && (err.message.includes('413') || err.message.includes('400') || err.message.includes('size limit') || err.message.includes('block range'))) {
             if (toBlock - fromBlock > 2000) {
                 const midBlock = Math.floor((fromBlock + toBlock) / 2);
                 const [logs1, logs2] = await Promise.all([
                     getLogsChunk(contractAddress, fromBlock, midBlock, topics),
                     getLogsChunk(contractAddress, midBlock + 1, toBlock, topics)
                 ]);
                 return [...(logs1 || []), ...(logs2 || [])];
             }
        }
        console.warn(`⚠️ getLogs permanently failed for chunk ${fromBlock}-${toBlock}: ${err.message}`);
        return [];
    }
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
 * and determine how much VIRTUAL the tax wallet spent and how much Target Token it received.
 */
async function calculateVirtualSpentInTxs(txns, tokenAddress, onProgress) {
    let totalVirtualSpentWei = 0n;
    let totalTokenReceivedWei = 0n;
    let successfulLookups = 0;

    const targetTokenLower = tokenAddress.toLowerCase();

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
            let foundVirtual = false;

            // Search receipt logs for VIRTUAL Transfer FROM Tax Wallet and Token Transfer TO Tax Wallet
            for (const log of receipt.logs) {
                if (log.address.toLowerCase() === VIRTUAL_ADDRESS.toLowerCase() &&
                    log.topics[0] === TRANSFER_TOPIC &&
                    log.topics[1]?.toLowerCase() === PADDED_TAX_ADDR) {

                    const amount = BigInt(log.data || '0');
                    totalVirtualSpentWei += amount;
                    foundVirtual = true;
                }

                if (log.address.toLowerCase() === targetTokenLower &&
                    log.topics[0] === TRANSFER_TOPIC &&
                    log.topics[2]?.toLowerCase() === PADDED_TAX_ADDR) {

                    const amountRecv = BigInt(log.data || '0');
                    totalTokenReceivedWei += amountRecv;
                }
            }
            if (foundVirtual) successfulLookups++;
        }

        const pct = Math.round(((i + batch.length) / totalTxns) * 100);
        onProgress?.(80 + Math.floor(pct * 0.2), `Resolving buyback amounts... ${pct}%`);
    }

    return {
        totalVirtualSpentWei,
        totalTokenReceivedWei,
        buybackTxCount: successfulLookups
    };
}


// ─── Main Tracker Function ──────────────────────────────────────────────────

export async function calculateBuybacks(tokenAddress, rpcUrl, onProgress) {
    if (rpcUrl && !BASE_RPCS.includes(rpcUrl) && !rpcUrl.includes('mainnet.base.org')) {
        BASE_RPCS.unshift(rpcUrl);
    }

    // Fetch Token Name, Symbol, and Decimals for better UX
    onProgress?.(2, 'Fetching Contract Identity...');
    let tokenName = 'Unknown';
    let tokenSymbol = 'TOKEN';
    let tokenDecimals = 18;
    try {
        const decHex = await rpcCall('eth_call', [{ to: tokenAddress, data: DECIMALS_SIG }, 'latest']);
        if (decHex && decHex !== '0x') {
            tokenDecimals = parseInt(decHex, 16);
        }
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
    let tokensReceived = 0;
    let buybackCount = 0;

    if (buybackTxns.length > 0) {
        const { totalVirtualSpentWei, totalTokenReceivedWei, buybackTxCount } = await calculateVirtualSpentInTxs(buybackTxns, tokenAddress, onProgress);
        spentVirtual = Number(totalVirtualSpentWei) / 1e18;
        tokensReceived = Number(totalTokenReceivedWei) / Math.pow(10, tokenDecimals);
        buybackCount = buybackTxCount;
    }

    const remainingVirtual = Math.max(0, totalVirtualCollected - spentVirtual);

    onProgress?.(100, 'Buyback tracking complete!');

    console.log('\n📊 ═══════════════════════════════════════════');
    console.log(`   Token:       ${tokenAddress}`);
    console.log(`   Tax Earned:  ${totalVirtualCollected.toFixed(4)} VIRTUAL`);
    console.log(`   Spent:       ${spentVirtual.toFixed(4)} VIRTUAL`);
    console.log(`   Got Back:    ${tokensReceived.toFixed(2)} ${tokenSymbol}`);
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
        totalTargetTokenReceived: tokensReceived,
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
        totalTargetTokenReceived: 0,
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
        `💰 Total VIRTUAL Tax Collected: ${report.totalTaxCollectedVirtual.toFixed(4)} VIRTUAL`,
        `🔥 VIRTUAL Spent on Buybacks:  ${report.totalVirtualSpentVirtual.toFixed(4)} VIRTUAL`,
        `📈 ${report.tokenSymbol} Received From Buybacks: ${report.totalTargetTokenReceived.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${report.tokenSymbol}`,
        `💵 Remaining Pending VIRTUAL:  ${report.pendingVirtualForBuyback.toFixed(4)} VIRTUAL`,
        ``,
        `📊 Total Buyback Transactions: ${report.buybackTransactionsCount}`,
        ``,
        `⏰ Tracking Time: ${report.timestamp}`
    ];
    return lines.join('\n');
}
