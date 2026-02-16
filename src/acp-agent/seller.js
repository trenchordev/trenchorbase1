/**
 * ACP Agent Seller — TrenchorTaxButler
 * 
 * This is the main ACP Agent process that runs as a Provider on Virtual Protocol.
 * It listens for incoming job requests, calculates token tax, and delivers results.
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

// ─── Job Processing ──────────────────────────────────────────────────────────

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
async function handleNewTask(job) {
    const jobId = job.id;
    const phase = job.phase;

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📥 Job Event — ID: ${jobId} | Phase: ${phase}`);
    console.log(`   Client: ${job.clientAddress}`);
    console.log(`${'═'.repeat(60)}`);

    try {
        // ─── PHASE 0: REQUEST → Accept & Send Requirement ────────────────
        if (phase === 0) {
            console.log(`🔄 Phase 0: Accepting job and sending requirement memo...`);

            // Extract requirement to validate the request
            const requirement = job.requirement || job.memos?.[0]?.content;
            console.log(`📋 Requirement:`, requirement);

            const tokenAddress = extractTokenAddress(requirement);
            if (!tokenAddress) {
                console.error(`❌ No valid token address found in requirement`);
                await job.respond(false, 'No valid token address provided. Please provide an Ethereum token address (0x...).');
                return;
            }

            console.log(`✅ Token address extracted: ${tokenAddress}`);

            // respond(true) = accept() + createRequirement() 
            // This advances the job from REQUEST → NEGOTIATION and signals the Buyer to pay
            const respondResult = await job.respond(true, `Accepted! Will calculate tax for token ${tokenAddress}.`);
            console.log(`✅ Job ${jobId} accepted & requirement sent`);
            if (respondResult?.txnHash) {
                console.log(`🧾 Respond TxHash: ${respondResult.txnHash}`);
            }
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
            if (result?.txnHash) {
                console.log(`🧾 Deliver TxHash: ${result.txnHash}`);
            }
            if (result?.userOpHash) {
                console.log(`🔑 UserOp Hash: ${result.userOpHash}`);
            }
            return;
        }

        // ─── OTHER PHASES: Not our responsibility ────────────────────────
        console.log(`ℹ️ Phase ${phase} — Not a Provider action phase. Ignoring.`);

    } catch (err) {
        console.error(`❌ Error in Job ${jobId} (Phase ${phase}):`, err.message || err);

        try {
            if (phase === 0) {
                await job.respond(false, `Error: ${err.message}`);
            }
        } catch (rejectErr) {
            console.error(`❌ Failed to reject job:`, rejectErr.message);
        }
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

    // ─── Health Cheek: Check Balance ─────────────────────────────────────────
    try {
        console.log(`  Checking wallet balance...`);
        // Use a public client to fetch balance
        const publicClient = acpModule.createPublicClient ?
            acpModule.createPublicClient({ chain: acpModule.base, transport: acpModule.http(RPC_URL) }) :
            (await import('viem')).createPublicClient({
                chain: (await import('viem/chains')).base,
                transport: (await import('viem')).http(RPC_URL)
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
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            console.log('\n\n👋 Agent shutting down...');
            process.exit(0);
        });

        // Heartbeat log every 5 minutes
        setInterval(() => {
            console.log(`💓 Agent heartbeat — ${new Date().toISOString()} — Waiting for jobs...`);
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
