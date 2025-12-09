
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

// CONSTANTS FROM taxLeaderboard.js
const VIRTUAL_ADDRESS = '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b'.toLowerCase();
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// USER PROVIDED VALUES (Approximate from previous context, will log actuals to be sure)
// We will look for ANY match in the logs to see what's going on.

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

const client = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
});

const TX_HASH = '0xe9f21984f466aca694ba9a8284926905bec23efc092e5d9e57b89757950e13ea';

async function analyzeTx() {
    console.log(`🔍 Analyzing TX: ${TX_HASH}`);

    try {
        const receipt = await client.getTransactionReceipt({ hash: TX_HASH });
        console.log(`✅ Transaction found in block: ${receipt.blockNumber}`);
        console.log(`   From: ${receipt.from}`);
        console.log(`   Logs: ${receipt.logs.length}`);

        console.log('\n--- ALL LOGS IN RECEIPT ---');
        receipt.logs.forEach((log, i) => {
            console.log(`\nLog #${i}:`);
            console.log(`  Address: ${log.address.toLowerCase()}`);
            console.log(`  Topics: ${log.topics}`);

            // Check if it matches VIRTUAL Transfer
            if (log.address.toLowerCase() === VIRTUAL_ADDRESS && log.topics[0] === TRANSFER_TOPIC) {
                console.log('  👉 IS VIRTUAL TRANSFER');
                const to = '0x' + log.topics[2].slice(26);
                console.log(`     To (Topic 2): ${to}`);
            }
        });

        console.log('\n--- ANALYSIS ---');
        // Check if VIRTUAL_ADDRESS is involved
        const hasVirtual = receipt.logs.some(l => l.address.toLowerCase() === VIRTUAL_ADDRESS);
        console.log(`Contains VIRTUAL Token (${VIRTUAL_ADDRESS}) logs? ${hasVirtual ? 'YES' : 'NO'}`);

        // We don't know the exact Tax Wallet or Target Token the user used in config for THIS specific run,
        // but we can see what IS there.

    } catch (err) {
        console.error('❌ Error fetching/analyzing tx:', err);
    }
}

analyzeTx();
