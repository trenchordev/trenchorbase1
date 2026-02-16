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
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

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

// ─── Job Queue ───────────────────────────────────────────────────────────────
// Simple in-memory queue to handle concurrent job requests without overloading

const MAX_CONCURRENT_JOBS = 3;
let activeJobs = 0;
const jobQueue = [];
let jobStats = { accepted: 0, rejected: 0, delivered: 0, failed: 0 };

function logQueueStatus() {
    console.log(`📊 Queue: ${activeJobs} active, ${jobQueue.length} waiting | Stats: ✅${jobStats.delivered} 🚫${jobStats.rejected} ❌${jobStats.failed}`);
}

async function enqueueJob(job) {
    if (activeJobs < MAX_CONCURRENT_JOBS) {
        activeJobs++;
        logQueueStatus();
        try {
            await processJob(job);
        } finally {
            activeJobs--;
            // Process next job in queue if any
            if (jobQueue.length > 0) {
                const nextJob = jobQueue.shift();
                console.log(`📤 Dequeuing next job from queue...`);
                enqueueJob(nextJob); // Don't await — fire and forget to not block
            }
        }
    } else {
        console.log(`⏳ Queue full (${activeJobs}/${MAX_CONCURRENT_JOBS} active). Queuing job ${job.id}...`);
        jobQueue.push(job);
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
 * Validates a token address to ensure it's a real contract on Base chain.
 * Returns { valid: true } or { valid: false, reason: string }
 */
async function validateTokenAddress(tokenAddress) {
    // 1. Basic format check
    if (!tokenAddress || typeof tokenAddress !== 'string') {
        return { valid: false, reason: 'No token address provided.' };
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
        return { valid: false, reason: `Invalid token address format: "${tokenAddress}". Must be a 42-character hex string starting with 0x.` };
    }

    // 2. Not a zero/burn address
    if (tokenAddress === '0x0000000000000000000000000000000000000000') {
        return { valid: false, reason: 'Cannot analyze the zero address.' };
    }

    // 3. On-chain contract existence check
    try {
        const client = createPublicClient({
            chain: base,
            transport: http(RPC_URL, { retryCount: 2, retryDelay: 500 }),
        });

        const code = await client.getCode({ address: tokenAddress });
        if (!code || code === '0x' || code === '0x0') {
            return { valid: false, reason: `Address ${tokenAddress} is not a contract on Base chain (no bytecode found). Please provide a valid token contract address.` };
        }
    } catch (err) {
        console.warn(`⚠️ Contract check failed (RPC issue): ${err.message}`);
        // Don't reject on RPC errors — allow the job to proceed
    }

    return { valid: true };
}

// ─── Job Processing ──────────────────────────────────────────────────────────

/**
 * ACP Job Lifecycle Handler (Multi-Phase)
 * 
 * The ACP protocol uses a state machine with phases:
 *   Phase 0: REQUEST      → Provider responds with job.respond(true)
 *   Phase 1: NEGOTIATION  → Buyer pays with job.payAndAcceptRequirement()
 *   Phase 2: TRANSACTION  → Provider does work and calls job.deliver()
 *   Phase 3: EVALUATION   → Buyer evaluates with job.evaluate(true)
 *   Phase 4: COMPLETED    → Done!
 * 
 * onNewTask fires at EVERY phase transition. We must check job.phase
 * and only act when it's our turn (Phase 0 and Phase 2).
 */
async function processJob(job) {
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

            // Validate the token address on-chain
            const validation = await validateTokenAddress(tokenAddress);
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
            console.log(`🔄 Phase 2: Buyer has paid. Starting work...`);

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

            // Calculate tax
            const report = await calculateTax(tokenAddress, RPC_URL, async (percent, message) => {
                console.log(`⏳ Progress: ${percent}% - ${message}`);
            });

            // Format the report as a deliverable
            const deliverable = formatTaxReport(report);
            console.log(`\n📤 Delivering results for Job ${jobId}...`);

            // Brief delay for network settlement
            console.log("⏳ Waiting 5s for network settlement before delivery...");
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Deliver the result → advances job to EVALUATION phase
            const result = await job.deliver(deliverable);
            console.log(`✅ Job ${jobId} delivered successfully!`);
            jobStats.delivered++;
            if (result?.txnHash) {
                console.log(`🧾 Deliver TxHash: ${result.txnHash}`);
            }
            if (result?.userOpHash) {
                console.log(`🔑 UserOp Hash: ${result.userOpHash}`);
            }
            logQueueStatus();
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
    console.log(`  Max Concurrent Jobs: ${MAX_CONCURRENT_JOBS}`);
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
        // onNewTask is routed through the queue for concurrency control
        const acpClient = new AcpClient({
            acpContractClient,
            onNewTask: enqueueJob,
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
