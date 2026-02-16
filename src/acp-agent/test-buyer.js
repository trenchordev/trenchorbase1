/**
 * ACP Test Buyer Agent — Sends test jobs to TrenchorTaxButler
 * 
 * This script acts as a Buyer agent that sends a job request to our Seller agent.
 * Used for:
 *   - Testing agent-to-agent interaction
 *   - Demonstrating the full ACP job lifecycle
 *   - Providing proof for graduation review
 * 
 * Usage:
 *   node src/acp-agent/test-buyer.js <tokenAddress>
 * 
 * Example:
 *   node src/acp-agent/test-buyer.js 0x20dCAaf4c61712857f80716c88EA9B12C1F7A336
 * 
 * Required environment variables (same .env.acp):
 *   - ACP_AGENT_WALLET_PRIVATE_KEY
 *   - ACP_AGENT_WALLET_ADDRESS
 *   - ACP_ENTITY_ID
 *   - ACP_SELLER_WALLET_ADDRESS (wallet address of the seller agent)
 */

import acpModule from '@virtuals-protocol/acp-node';
const { AcpContractClientV2, baseAcpConfigV2, AcpJobOffering } = acpModule;
const AcpClient = acpModule.default || acpModule;
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Load Environment ────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../../.env.acp');

import { existsSync } from 'fs';
if (existsSync(envPath)) {
    config({ path: envPath });
}

const AGENT_PRIVATE_KEY = process.env.ACP_AGENT_WALLET_PRIVATE_KEY;
const AGENT_WALLET = process.env.ACP_AGENT_WALLET_ADDRESS;
const ENTITY_ID = parseInt(process.env.ACP_ENTITY_ID || '0');
const SELLER_WALLET = process.env.ACP_SELLER_WALLET_ADDRESS;

// Get token address from command line
const tokenAddress = process.argv[2];

if (!AGENT_PRIVATE_KEY || !AGENT_WALLET || !ENTITY_ID) {
    console.error('❌ Missing required environment variables!');
    process.exit(1);
}

if (!SELLER_WALLET) {
    console.error('❌ Missing ACP_SELLER_WALLET_ADDRESS in .env.acp');
    console.error('   This should be the wallet address of the seller agent you want to interact with.');
    process.exit(1);
}

if (!tokenAddress) {
    console.error('❌ Usage: node src/acp-agent/test-buyer.js <tokenAddress>');
    console.error('   Example: node src/acp-agent/test-buyer.js 0x20dCAaf4c61712857f80716c88EA9B12C1F7A336');
    process.exit(1);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n' + '═'.repeat(60));
    console.log('  🛒 ACP Test Buyer Agent');
    console.log('  📡 Sending job to TrenchorTaxButler');
    console.log('═'.repeat(60));
    console.log(`  Buyer Wallet: ${AGENT_WALLET}`);
    console.log(`  Seller Wallet: ${SELLER_WALLET}`);
    console.log(`  Token to analyze: ${tokenAddress}`);
    console.log('');

    try {
        // Build the ACP contract client
        const acpContractClient = await AcpContractClientV2.build(
            AGENT_PRIVATE_KEY,
            ENTITY_ID,
            AGENT_WALLET,
            baseAcpConfigV2
        );
        console.log('✅ ACP Contract Client built');

        // Create ACP client with buyer callbacks
        const acpClient = new AcpClient({
            acpContractClient,
            onNewTask: async (job) => {
                const phase = job.phase;
                console.log(`\n📥 Buyer callback — Job ${job.id} | Phase: ${phase}`);

                // Phase 1: Provider has accepted, buyer needs to pay
                if (phase === 1) {
                    console.log(`💰 Phase 1: Provider accepted! Paying for the job...`);
                    try {
                        const price = job.price || 0;
                        console.log(`   Price: ${price} VIRTUAL`);
                        const payResult = await job.pay(price);
                        console.log(`✅ Payment sent!`);
                        if (payResult?.txnHash) {
                            console.log(`🧾 Pay TxHash: ${payResult.txnHash}`);
                        }
                    } catch (err) {
                        console.error(`❌ Payment failed:`, err.message);
                    }
                }

                // Phase 3: Provider has delivered, buyer evaluates
                if (phase === 3) {
                    console.log(`📋 Phase 3: Deliverable received! Evaluating...`);
                    try {
                        // Get the deliverable content
                        const deliverMemo = job.memos?.find(m => m.nextPhase === 4);
                        if (deliverMemo) {
                            console.log(`\n📄 Deliverable Content:`);
                            console.log(deliverMemo.content);
                        }

                        // Auto-approve the deliverable
                        const evalResult = await job.evaluate(true, 'Great work! Tax report received successfully.');
                        console.log(`✅ Job evaluated and COMPLETED!`);
                        if (evalResult?.txnHash) {
                            console.log(`🧾 Evaluate TxHash: ${evalResult.txnHash}`);
                        }

                        console.log(`\n🎉 Full job lifecycle completed successfully!`);
                        console.log(`   Request → Negotiation → Transaction → Evaluation → Completed`);

                        // Wait a bit then exit
                        setTimeout(() => process.exit(0), 5000);
                    } catch (err) {
                        console.error(`❌ Evaluation failed:`, err.message);
                    }
                }
            },
        });

        // Initialize
        await acpClient.init();
        console.log('✅ ACP Client initialized');

        // Create a job offering targeting our seller agent
        console.log(`\n🚀 Creating job for seller ${SELLER_WALLET}...`);

        // The AcpJobOffering creates a job on-chain
        const jobOffering = new AcpJobOffering(
            acpClient,
            acpContractClient,
            SELLER_WALLET,                    // Provider address
            'trenchor_tax_scanner',           // Service name (must match seller's offering)
            0,                                 // Price (0 for sandbox/free testing)
            'fixed',                           // Price type
            null                               // No schema validation on buyer side
        );

        const jobId = await jobOffering.initiateJob(
            { tokenAddress: tokenAddress },    // Service requirement
            AGENT_WALLET,                      // Evaluator (self)
            new Date(Date.now() + 1000 * 60 * 60 * 24) // Expires in 24h
        );

        console.log(`✅ Job created! Job ID: ${jobId}`);
        console.log(`\n⏳ Waiting for seller to process...\n`);
        console.log(`   The job will go through these phases:`);
        console.log(`   Phase 0: REQUEST      → Seller validates & accepts`);
        console.log(`   Phase 1: NEGOTIATION  → This buyer pays`);
        console.log(`   Phase 2: TRANSACTION  → Seller calculates tax`);
        console.log(`   Phase 3: EVALUATION   → This buyer evaluates`);
        console.log(`   Phase 4: COMPLETED    → Done!`);

        // Keep alive for 10 minutes max
        setTimeout(() => {
            console.log('\n⏰ Timeout reached (10 minutes). Exiting...');
            process.exit(0);
        }, 10 * 60 * 1000);

    } catch (err) {
        console.error('❌ Error:', err.message || err);
        process.exit(1);
    }
}

main();
