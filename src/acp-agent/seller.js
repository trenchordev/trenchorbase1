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
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

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

const MAX_CONCURRENT_CALCS = 3;
const MAX_QUEUE_SIZE = 5; // allow up to 5 jobs in queue waiting for calc
let activeCalculations = 0;
const calculationQueue = [];
let jobStats = { accepted: 0, rejected: 0, delivered: 0, failed: 0 };

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
 * Extracts token address from a job's requirement.
 * The requirement can come in different formats:
 * - JSON: { "tokenAddress": "0x..." }
 * - Plain text: "0x2612da14af37933b95a4d8666e7caf9b10ec3edf"
 * - Natural language: "Calculate tax for token 0x2612da..."
 */
function extractTokenAddress(requirement) {
    if (!requirement) return null;

    // If requirement is an object with tokenAddress field
    if (typeof requirement === 'object' && requirement.tokenAddress) {
        return requirement.tokenAddress;
    }

    // Convert to string and look for an Ethereum address pattern
    const str = typeof requirement === 'string' ? requirement : JSON.stringify(requirement);
    const match = str.match(/0x[a-fA-F0-9]{40}/);
    return match ? match[0] : null;
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
    console.log(`🔄 Phase 2: Starting work for Job ${jobId}...`);

    try {
        // Extract token address from original requirement
        const requirement = job.requirement || job.memos?.[0]?.content;
        const tokenAddress = extractTokenAddress(requirement);

        if (!tokenAddress) {
            console.error(`❌ Cannot extract token address for delivery`);
            jobStats.failed++;
            logQueueStatus();
            return;
        }

        console.log(`🔬 Calculating tax for: ${tokenAddress}`);

        // Calculate tax natively (new O(1) algorithm is lightning fast, no timeout wrapper needed)
        const report = await calculateTax(tokenAddress, RPC_URL, async (percent, message) => {
            console.log(`⏳ Job ${jobId} Progress: ${percent}% - ${message}`);
        });

        // Format the report as a deliverable
        const deliverable = formatTaxReport(report);
        console.log(`\n📤 Delivering results for Job ${jobId}...`);

        // Brief delay for network settlement
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Deliver the result → advances job to EVALUATION phase
        const result = await job.deliver(deliverable);
        console.log(`✅ Job ${jobId} delivered successfully!`);
        jobStats.delivered++;
        if (result?.txnHash) {
            console.log(`🧾 Deliver TxHash: ${result.txnHash}`);
        }
        logQueueStatus();
    } catch (err) {
        console.error(`❌ Error in Job ${jobId} (Phase 2):`, err.message || err);
        jobStats.failed++;

        // CRITICAL: We MUST deliver something in Phase 2, otherwise the job sits Pending until it expires,
        // which hurts the agent's Graduation metrics. We deliver a fallback error payload.
        try {
            console.log(`⚠️ Delivering fallback error payload to prevent job expiration for Job ${jobId}...`);
            const fallbackDeliverable = {
                error: true,
                message: `Failed to perform tax calculation: ${err.message}`,
                summary: "Error occurred during on-chain scanning. Please try again.",
                totalTaxVirtual: 0,
                tokenAddress: "unknown"
            };
            await job.deliver(fallbackDeliverable);
            console.log(`✅ Fallback delivered for Job ${jobId}.`);
        } catch (deliverErr) {
            console.error(`❌ Even fallback delivery failed for Job ${jobId}:`, deliverErr.message);
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
                await job.respond(false, 'Request rejected: No requirement provided. Please include a token contract address (0x...) for tax analysis.');
                logQueueStatus();
                return;
            }

            // Extract token address
            const tokenAddress = extractTokenAddress(requirement);
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
            const respondResult = await job.respond(true, `Accepted! Will calculate tax for token ${tokenAddress}.`);
            console.log(`✅ Job ${jobId} accepted & requirement sent`);
            if (respondResult?.txnHash) {
                console.log(`🧾 Respond TxHash: ${respondResult.txnHash}`);
            }
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
