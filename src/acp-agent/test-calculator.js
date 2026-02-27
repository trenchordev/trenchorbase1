/**
 * Test Script — Tax Calculator
 * 
 * Tests the tax calculation module with a known token (SantaClaw).
 * Run: node src/acp-agent/test-calculator.js
 */

import { calculateTax, formatTaxReport } from './acpTaxCalculator.js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env.acp') });

// SantaClaw token address (known test token from example TX)
const TEST_TOKEN = process.argv[2] || '0x2612da14af37933b95a4d8666e7caf9b10ec3edf';
const RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

console.log('\n🧪 ═══════════════════════════════════════════');
console.log('   Tax Calculator — Test Mode');
console.log('   ═══════════════════════════════════════════');
console.log(`\n   Token: ${TEST_TOKEN}`);
console.log(`   RPC: ${RPC_URL.substring(0, 40)}...`);
console.log('');

const startTime = Date.now();

try {
    const report = await calculateTax(TEST_TOKEN, RPC_URL, (percent, message) => {
        console.log(`   [${percent}%] ${message}`);
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n⏱️ Completed in ${elapsed} seconds\n`);
    console.log(formatTaxReport(report));
    console.log('\n📦 Full Report JSON:');
    console.log(JSON.stringify(report, null, 2));

} catch (err) {
    console.error('\n❌ Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
}
