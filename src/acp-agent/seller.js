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

/**
 * Validates a token address FORMAT only (no RPC calls).
 * Phase 0 must never make on-chain calls — they can cause the agent to miss
 * the ACP acceptance window and get an "Expired Job" penalty.
 * Returns { valid: true } or { valid: false, reason: string }
 */
function validateTokenAddressFormatSync(tokenAddress) {
    if (!tokenAddress || typeof tokenAddress !== 'string') {
        return { valid: false, reason: 'No token address provided.' };
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
        return { valid: false, reason: `Invalid token address format: "${tokenAddress}". Must be a 42-character hex string starting with 0x.` };
    }
    if (tokenAddress === '0x0000000000000000000000000000000000000000') {
        return { valid: false, reason: 'Cannot analyze the zero address.' };
    }
    return { valid: true };
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
            report = await calculateBuybacks(tokenAddress, RPC_URL, async (percent, message) => {
                console.log(`⏳ Job ${jobId} Progress: ${percent}% - ${message}`);
            });
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
            report = await calculateTax(tokenAddress, RPC_URL, async (percent, message) => {
                console.log(`⏳ Job ${jobId} Progress: ${percent}% - ${message}`);
            });
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
        // CRITICAL: We MUST reject the job cleanly in Phase 2 so the user gets refunded for failures.
        // Returning an error string via .deliver() counts as a "Success" and takes their money.
        try {
            console.log(`⚠️ Rejecting and refunding failed Job ${jobId}...`);
            await job.rejectPayable(err.message || 'Analysis failed. Target is likely not a valid Token contract on Base chain.');
            console.log(`✅ Job ${jobId} successfully rejected and refunded.`);
        } catch (rejectErr) {
            console.error(`❌ Even rejectPayable failed for Job ${jobId}:`, rejectErr.message);
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

            // Simple format validation only — no on-chain calls in Phase 0.
            // On-chain checks here caused the 5s acceptance timeout to fire (Expired Jobs).
            // The token address format check is sufficient to accept/reject at this stage.
            const validation = validateTokenAddressFormatSync(tokenAddress);

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
