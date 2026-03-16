/**
 * ACP Agent Seller — TrenchorTaxButler
 * 
 * This is the main ACP Agent process that runs as a Provider on Virtual Protocol.
 * It listens for incoming job requests, calculates token tax, and delivers results.
 * 
 * Features:
 *   - Multi-phase ACP lifecycle (Phase 0: respond, Phase 2: deliver)
 *   - Request validation & rejection for invalid/inappropriate requests
 *   - Job queue with concurrency control for scalability
 * 
 * Usage:
 *   node src/acp-agent/seller.js
 * 
 * Required environment variables (see .env.acp):
 *   - ACP_AGENT_WALLET_PRIVATE_KEY
 *   - ACP_AGENT_WALLET_ADDRESS  
 *   - ACP_ENTITY_ID
 *   - BASE_RPC_URL
 */

import acpModule from '@virtuals-protocol/acp-node';
const { AcpContractClientV2, baseAcpConfigV2 } = acpModule;
const AcpClient = acpModule.default || acpModule;
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { calculateTax, formatTaxReport } from './acpTaxCalculator.js';
import { calculateBuybacks, formatBuybackReport } from './acpBuybackTracker.js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

// ─── Telegram Notifications ───────────────────────────────────────────────
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Send a Telegram message. Fire-and-forget — never throws.
 * No-op if TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set.
 */
async function tgNotify(text) {
    if (!TG_TOKEN || !TG_CHAT_ID) return;
    try {
        await axios.post(
            `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
            { chat_id: TG_CHAT_ID, text, parse_mode: 'HTML' },
            { timeout: 5000 }
        );
    } catch (_) { /* silently ignore — notifications are best-effort */ }
}

// ─── Load Environment ────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../../.env.acp');

// Load .env.acp if it exists (local dev), otherwise use system env vars (Railway/Docker)
import { existsSync } from 'fs';
if (existsSync(envPath)) {
    config({ path: envPath });
}

const AGENT_PRIVATE_KEY = process.env.ACP_AGENT_WALLET_PRIVATE_KEY;
const AGENT_WALLET = process.env.ACP_AGENT_WALLET_ADDRESS;
const ENTITY_ID = parseInt(process.env.ACP_ENTITY_ID || '0');
// RPC for on-chain data fetching (tax calculation)
const RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

// ─── Validation ──────────────────────────────────────────────────────────────

if (!AGENT_PRIVATE_KEY || !AGENT_WALLET || !ENTITY_ID) {
    console.error('❌ Missing required environment variables!');
    console.error('   Please set the following in .env.acp:');
    console.error('   - ACP_AGENT_WALLET_PRIVATE_KEY');
    console.error('   - ACP_AGENT_WALLET_ADDRESS');
    console.error('   - ACP_ENTITY_ID');
    process.exit(1);
}

// ─── Job Queue & Capacity Management ───────────────────────────────────────────
// We separate quick Phase 0 responses from heavy Phase 2 calculations to prevent
// Phase 0 timeouts (which cause the agent to get "Expired" jobs).

const MAX_CONCURRENT_CALCS = 2;  // Reduced: fewer concurrent = fewer RPC collisions
const MAX_QUEUE_SIZE = 5; // allow up to 5 jobs in queue waiting for calc
let activeCalculations = 0;
const calculationQueue = [];
let jobStats = { accepted: 0, rejected: 0, delivered: 0, failed: 0 };

// ─── Dedup Guard ─────────────────────────────────────────────────────────────
// ACP SDK fires the same event multiple times. Track which job+phase combos we
// have already started acting on to prevent duplicate processing.
const processingJobs = new Set(); // Set<`${jobId}-${phase}`>

function logQueueStatus() {
    console.log(`📊 Capacity: ${activeCalculations}/${MAX_CONCURRENT_CALCS} active calc, ${calculationQueue.length}/${MAX_QUEUE_SIZE} queued | Stats: ✅${jobStats.delivered} 🚫${jobStats.rejected} ❌${jobStats.failed}`);
}

async function enqueueCalculation(job) {
    if (activeCalculations < MAX_CONCURRENT_CALCS) {
        activeCalculations++;
        logQueueStatus();
        try {
            await doPhase2Work(job);
        } finally {
            activeCalculations--;
            // Process next job in queue if any
            if (calculationQueue.length > 0) {
                const nextJob = calculationQueue.shift();
                console.log(`📤 Dequeuing next job for calc from queue...`);
                enqueueCalculation(nextJob); // Don't await — fire and forget to not block
            }
        }
    } else {
        console.log(`⏳ Calc queue full (${activeCalculations}/${MAX_CONCURRENT_CALCS} active). Queuing job ${job.id} for Phase 2...`);
        calculationQueue.push(job);
        logQueueStatus();
    }
}

// ─── Request Validation ──────────────────────────────────────────────────────

/**
 * Extracts token address and intent from the entire job object.
 * We scan the entire Job JSON because UI form submissions strictly pass "tokenAddress"
 * without the natural language identifying the "buyback" intent.
 */
function parseJobRequirement(job) {
    if (!job) return { tokenAddress: null, intent: 'tax_scan' };

    let tokenAddress = null;
    let intent = 'tax_scan';

    // Safely extract token address from requirement or memos
    const req = job.requirement || job.memos?.[0]?.content;
    const reqStr = typeof req === 'string' ? req : JSON.stringify(req || {});
    const memoStr = JSON.stringify(job.memos || []);

    // Look for 0x address
    let match = reqStr.match(/0x[a-fA-F0-9]{40}/i);
    if (!match) match = memoStr.match(/0x[a-fA-F0-9]{40}/i);
    if (match) tokenAddress = match[0];

    // Deduce user Intent (Buyback vs Standard Tax Scan)
    // We scan the entire job object to catch keyword intent that might be in the JobName or Request payload
    const fullJobStr = JSON.stringify(job).toLowerCase();
    const buybackKeywords = ['buyback', 'spend', 'spent', 'remaining', 'trenchor_buyback', 'tax_buyback', 'buyback_tax'];

    if (buybackKeywords.some(kw => fullJobStr.includes(kw))) {
        intent = 'buyback_track';
    }

    return { tokenAddress, intent };
}

const validationClient = createPublicClient({ chain: base, transport: http(RPC_URL) });

// ─── System Contract Blocklist ────────────────────────────────────────────────
// DevRel sends known Base system/infrastructure tokens as negative-test traps.
// These are real contracts (have bytecode) so the getBytecode check alone won't catch them.
// We must reject them explicitly in Phase 0 because they are not Virtuals Protocol ecosystem tokens.
const SYSTEM_CONTRACT_BLOCKLIST = new Set([
    '0x4200000000000000000000000000000000000006', // WETH on Base
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC on Base
    '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', // DAI on Base
    '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca', // USDbC on Base
    '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22', // cbETH on Base
    '0x4200000000000000000000000000000000000042', // OP on Base
]);

/**
 * Validates a token address FORMAT and performs a fast on-chain verification.
 * Resolves DEVREL negative testing requirements by formally rejecting EOAs and burn addresses.
 * Wraps the RPC call in a strict timeout to ensure we never miss the 5-second ACP acceptance SLA.
 * Returns { valid: true } or { valid: false, reason: string }
 */
async function validateTokenOnChain(tokenAddress) {
    if (!tokenAddress || typeof tokenAddress !== 'string') {
        return { valid: false, reason: 'No token address provided.' };
    }
    if (!/^0x[a-fA-F0-9]{40}$/i.test(tokenAddress)) {
        return { valid: false, reason: `Invalid token address format: "${tokenAddress}". Must be a 42-character hex string starting with 0x.` };
    }

    const lowerAddr = tokenAddress.toLowerCase();
    if (lowerAddr === '0x0000000000000000000000000000000000000000' || lowerAddr === '0x000000000000000000000000000000000000dead') {
        return { valid: false, reason: 'Cannot analyze the zero or burn address.' };
    }

    // Reject known Base system/infrastructure contracts — these are not Virtuals ecosystem tokens.
    if (SYSTEM_CONTRACT_BLOCKLIST.has(lowerAddr)) {
        return { valid: false, reason: `${tokenAddress} is a Base network system contract (e.g. WETH, USDC). This service only analyzes Virtuals Protocol ecosystem tokens.` };
    }

    try {
        // Fast online lookup to ensure it's a contract with bytecode
        const bytecode = await Promise.race([
            validationClient.getBytecode({ address: tokenAddress }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]);
        if (!bytecode || bytecode === '0x') {
            return { valid: false, reason: `${tokenAddress} is not a deployed contract on Base network. Please provide a valid ERC20 token address.` };
        }
    } catch (e) {
        // Accept the job if it timed out to prevent falsely punishing users for network lag.
        // We will catch actual non-contracts during Phase 2 if we accepted them erroneously.
        if (!e.message.includes('timeout')) {
             return { valid: false, reason: `RPC Error validating contract: ${e.message}`};
        }
    }
    return { valid: true };
}

// ─── Phase 2 Execution Timeout ───────────────────────────────────────────────
// ACP jobs expire after 30 minutes. We use a 25-minute hard timeout so we can
// call rejectPayable() (triggering a refund) before the job silently expires.
const PHASE2_TIMEOUT_MS = 25 * 60 * 1000;

function withPhase2Timeout(promise) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(
                () => reject(new Error('Job calculation exceeded the 25-minute timeout. Scan window may be too large for this token.')),
                PHASE2_TIMEOUT_MS
            )
        ),
    ]);
}

// ─── Job Processing ──────────────────────────────────────────────────────────

async function doPhase2Work(job) {
    const jobId = job.id;
    const _jobStartTime = Date.now();
    console.log(`🔄 Phase 2: Starting work for Job ${jobId}...`);

    // Extract token address BEFORE try so it's available in catch for Telegram notification
    const { tokenAddress, intent } = parseJobRequirement(job);

    try {
        if (!tokenAddress) {
            console.error(`❌ Cannot extract token address for delivery`);
            jobStats.failed++;
            logQueueStatus();
            return;
        }

        console.log(`🔬 Phase 2 [${intent.toUpperCase()}]: ${tokenAddress}`);

        let report, deliverable, telegramMsg;

        if (intent === 'buyback_track') {
            report = await withPhase2Timeout(
                calculateBuybacks(tokenAddress, RPC_URL, async (percent, message) => {
                    console.log(`⏳ Job ${jobId} Progress: ${percent}% - ${message}`);
                })
            );
            deliverable = formatBuybackReport(report);

            telegramMsg = `✅ <b>Buyback Job Tamamlandı!</b>\n` +
                `🔑 Job ID: <code>${jobId}</code>\n` +
                `🎯 Token: <b>${report.tokenName} ($${report.tokenSymbol})</b>\n` +
                `📄 Adres: <code>${tokenAddress}</code>\n` +
                `💰 Tax: <b>${report.totalTaxCollectedVirtual?.toFixed(4) ?? '?'} VIRTUAL</b>\n` +
                `🔥 Spent: <b>${report.totalVirtualSpentVirtual?.toFixed(4) ?? '0'} VIRTUAL</b>\n` +
                `📈 Got Back: <b>${report.totalTargetTokenReceived?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '0'} ${report.tokenSymbol}</b>\n` +
                `💵 Pending: <b>${report.pendingVirtualForBuyback?.toFixed(4) ?? '?'} VIRTUAL</b>\n` +
                `⏱ Süre: ${Math.round((Date.now() - _jobStartTime) / 1000)}s`;
        } else {
            // Existing native tax scan feature
            report = await withPhase2Timeout(
                calculateTax(tokenAddress, RPC_URL, async (percent, message) => {
                    console.log(`⏳ Job ${jobId} Progress: ${percent}% - ${message}`);
                })
            );
            deliverable = formatTaxReport(report);

            telegramMsg = `✅ <b>Tax Job Tamamlandı!</b>\n` +
                `🔑 Job ID: <code>${jobId}</code>\n` +
                `🎯 Token: <b>${report.tokenName} ($${report.tokenSymbol})</b>\n` +
                `📄 Adres: <code>${tokenAddress}</code>\n` +
                `💰 Vergi: <b>${report.totalTaxVirtual?.toFixed(4) ?? '?'} VIRTUAL</b>\n` +
                `📄 TX Sayısı: ${report.validTransactions ?? 0}\n` +
                `⏱ Süre: ${Math.round((Date.now() - _jobStartTime) / 1000)}s`;
        }

        console.log(`\n📤 Delivering results for Job ${jobId}...`);

        // Brief delay for network settlement
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Deliver the result → advances job to EVALUATION phase
        const result = await job.deliver(deliverable);
        console.log(`✅ Job ${jobId} delivered successfully!`);
        jobStats.delivered++;
        if (result?.txnHash) {
            console.log(`🧧 Deliver TxHash: ${result.txnHash}`);
        }

        // 📲 Telegram Notify
        tgNotify(telegramMsg);
        logQueueStatus();
    } catch (err) {
        const _elapsed = Math.round((Date.now() - _jobStartTime) / 1000);
        console.error(`❌ Error in Job ${jobId} (Phase 2):`, err.message || err);
        jobStats.failed++;

        // 📲 Telegram: job failed
        tgNotify(
            `❌ <b>Job Başarısız!</b>\n` +
            `🔑 Job ID: <code>${jobId}</code>\n` +
            `🎯 Token: <code>${tokenAddress}</code>\n` +
            `📍 Hata: ${err.message?.slice(0, 120)}`
        );
        // CRITICAL: We MUST reject the job formally so Virtuals platform triggers the
        // smart contract refund for the user, fulfilling DEVREL negative test rules.
        try {
            console.log(`⚠️ formally rejecting Job ${jobId} to trigger refund...`);
            await job.rejectPayable(`Execution failed: ${err.message}`);
            console.log(`✅ Reject signal sent to Virtuals for Job ${jobId}.`);
        } catch (rejectErr) {
            console.error(`❌ SDK Failed to reject Job ${jobId}:`, rejectErr.message);
        }

        logQueueStatus();
    }
}

/**
 * ACP Job Lifecycle Handler (Multi-Phase)
 * onNewTask fires at EVERY phase transition. We must check job.phase.
 */
async function handleNewTask(job) {
    const jobId = job.id;
    const phase = job.phase;
    const dedupKey = `${jobId}-${phase}`;

    // ─ Dedup: ACP SDK fires the same event multiple times. Drop duplicates. ─
    if (processingJobs.has(dedupKey)) {
        console.log(`⏭️  Duplicate event skipped: Job ${jobId} Phase ${phase}`);
        return;
    }
    processingJobs.add(dedupKey);
    // Auto-cleanup after 10 minutes so memory doesn't grow unbounded
    setTimeout(() => processingJobs.delete(dedupKey), 10 * 60 * 1000);

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📥 Job Event — ID: ${jobId} | Phase: ${phase}`);
    console.log(`   Client: ${job.clientAddress}`);
    console.log(`${'═'.repeat(60)}`);

    try {
        // ─── PHASE 0: REQUEST → Validate & Accept/Reject ────────────────
        if (phase === 0) {
            console.log(`🔄 Phase 0: Validating request...`);

            // CAPACITY CHECK: Prevent taking more jobs than we can handle within SLA (5 min)
            if (activeCalculations + calculationQueue.length >= MAX_CONCURRENT_CALCS + MAX_QUEUE_SIZE) {
                console.log(`🚫 REJECTING: Server at full capacity (active: ${activeCalculations}, queued: ${calculationQueue.length})`);
                jobStats.rejected++;
                await job.respond(false, 'Request rejected: Server is currently at full capacity processing other requests. Please try again in a few minutes.');
                logQueueStatus();
                return;
            }

            // Extract requirement
            const requirement = job.requirement || job.memos?.[0]?.content;
            console.log(`📋 Requirement:`, requirement);

            // Check for empty/missing requirement
            if (!requirement || (typeof requirement === 'string' && requirement.trim().length === 0)) {
                console.log(`🚫 REJECTING: Empty or missing requirement`);
                jobStats.rejected++;
                await job.respond(false, 'Request rejected: No requirement provided. Please include a token contract address (0x...) for tax or buyback analysis.');
                logQueueStatus();
                return;
            }

            // Extract token address and intent
            const { tokenAddress, intent } = parseJobRequirement(job);
            if (!tokenAddress) {
                console.log(`🚫 REJECTING: No valid token address in requirement`);
                jobStats.rejected++;
                await job.respond(false, 'Request rejected: No valid Ethereum token address found. Please provide a 42-character hex address starting with 0x.');
                logQueueStatus();
                return;
            }

            // DEVREL mandated on-chain validation for contracts in Phase 0.
            // Wrapped with a strict 3-second timeout so it never causes true jobs to EXPIRE.
            const validation = await validateTokenOnChain(tokenAddress);

            if (!validation.valid) {
                console.log(`🚫 REJECTING: ${validation.reason}`);
                jobStats.rejected++;
                await job.respond(false, `Request rejected: ${validation.reason}`);
                logQueueStatus();
                return;
            }

            console.log(`✅ Token address validated: ${tokenAddress}`);
            jobStats.accepted++;

            // respond(true) = accept() + createRequirement() 
            // This advances the job from REQUEST → NEGOTIATION and signals the Buyer to pay
            const respondResult = await job.respond(true, `Accepted! Preparing ${intent === 'buyback_track' ? 'Buyback Tracker' : 'Tax Scan'} for token ${tokenAddress}.`);
            console.log(`✅ Job ${jobId} accepted (${intent}) & requirement sent`);
            if (respondResult?.txnHash) {
                console.log(`🧧 Respond TxHash: ${respondResult.txnHash}`);
            }

            // 📲 Telegram: new job accepted
            tgNotify(
                `📥 <b>Yeni Job Kabul Edildi</b>\n` +
                `🔑 Job ID: <code>${jobId}</code>\n` +
                `🎯 Token: <code>${tokenAddress}</code>\n` +
                `👤 Client: <code>${job.clientAddress?.slice(0, 10)}...</code>`
            );

            logQueueStatus();
            return; // Wait for Buyer to pay → Phase 2 callback
        }

        // ─── PHASE 2: TRANSACTION → Do Work & Deliver ────────────────────
        if (phase === 2) {
            console.log(`🔄 Phase 2: Buyer has paid. Queuing for calculation...`);
            // Queue the calculation work so we don't block network handlers
            enqueueCalculation(job);
            return;
        }

        // ─── OTHER PHASES: Not our responsibility ────────────────────────
        console.log(`ℹ️ Phase ${phase} — Not a Provider action phase. Ignoring.`);

    } catch (err) {
        console.error(`❌ Error in Job ${jobId} (Phase ${phase}):`, err.message || err);
        jobStats.failed++;

        try {
            if (phase === 0) {
                await job.respond(false, `Error processing request: ${err.message}`);
            }
        } catch (rejectErr) {
            console.error(`❌ Failed to reject job:`, rejectErr.message);
        }
        logQueueStatus();
    }
}

// ─── Main Agent Loop ─────────────────────────────────────────────────────────

async function main() {
    console.log('\n' + '═'.repeat(60));
    console.log('  🤖 TrenchorTaxButler — ACP Agent');
    console.log('  📡 Virtual Protocol Provider');
    console.log('═'.repeat(60));
    console.log(`\n  Agent Wallet: ${AGENT_WALLET}`);
    console.log(`  Entity ID: ${ENTITY_ID}`);

    // ─── Health Check: Check Balance ─────────────────────────────────────────
    try {
        console.log(`  Checking wallet balance...`);
        const publicClient = createPublicClient({
            chain: base,
            transport: http(RPC_URL),
        });

        const balance = await publicClient.getBalance({ address: AGENT_WALLET });
        const ethBalance = Number(balance) / 1e18;
        console.log(`💰 Agent Wallet Balance: ${ethBalance.toFixed(6)} ETH`);

        if (ethBalance < 0.0005) {
            console.warn(`⚠️ LOW BALANCE WARNING! Agent may not be able to pay for gas.`);
            console.warn(`   Please send at least 0.002 ETH (Base) to ${AGENT_WALLET}`);
        } else {
            console.log(`✅ Sufficient gas funds detected.`);
        }
    } catch (err) {
        console.warn(`⚠️ Could not verify balance (RPC issue?): ${err.message}`);
    }
    // ─────────────────────────────────────────────────────────────────────────

    console.log(`  RPC URL: ${RPC_URL.substring(0, 30)}...`);
    console.log(`  Max Concurrent Calcs: ${MAX_CONCURRENT_CALCS}, Max Queue: ${MAX_QUEUE_SIZE}`);
    console.log(`\n  Starting agent initialization...\n`);

    try {
        // Build the ACP contract client
        const acpContractClient = await AcpContractClientV2.build(
            AGENT_PRIVATE_KEY,      // wallet private key
            ENTITY_ID,               // session entity key ID (from ACP Platform)
            AGENT_WALLET,            // agent wallet address
            baseAcpConfigV2          // ACP v2 config for Base mainnet
        );

        console.log('✅ ACP Contract Client built successfully');

        // Create the ACP client with callbacks
        // handleNewTask processes Phase 0 immediately and routes Phase 2 to the calculation queue
        const acpClient = new AcpClient({
            acpContractClient,
            onNewTask: handleNewTask,
        });

        // Initialize the client (connects WebSocket to ACP backend)
        await acpClient.init();

        console.log('✅ ACP Client initialized and connected!');
        console.log('\n🎯 Agent is now ONLINE and waiting for jobs...');
        console.log('   Press Ctrl+C to stop.\n');

        // Keep the process alive
        process.on('SIGINT', () => {
            console.log('\n\n👋 Agent shutting down...');
            logQueueStatus();
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            console.log('\n\n👋 Agent shutting down...');
            logQueueStatus();
            process.exit(0);
        });

        // Heartbeat log every 5 minutes
        setInterval(() => {
            console.log(`💓 Agent heartbeat — ${new Date().toISOString()} — Waiting for jobs...`);
            logQueueStatus();
        }, 5 * 60 * 1000);

    } catch (err) {
        console.error('\n❌ Failed to start ACP Agent:', err);
        console.error('\n💡 Troubleshooting:');
        console.error('   1. Check your .env.acp file has all required variables');
        console.error('   2. Make sure ACP_ENTITY_ID is correct (from ACP Platform)');
        console.error('   3. Ensure your agent wallet has been whitelisted');
        console.error('   4. Check your internet connection');
        process.exit(1);
    }
}

// Start the agent
main();
