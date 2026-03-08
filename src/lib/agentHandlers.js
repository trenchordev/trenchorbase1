import { scanTaxCollection } from './agentTaxScanner';

// Simple handler registry
const handlers = new Map();

// Register built-in handlers
handlers.set('tax-scanner', async (job, offering, redis) => {
  // Expect serviceRequirement to contain start/end or tokenAddress + launch block detection elsewhere.
  // If serviceRequirement contains tokenAddress and launchBlock, run scanTaxCollection using those blocks.
  const sr = job.serviceRequirement || {};

  // If sr has startBlock and endBlock, use them. Otherwise, fail with guidance.
  if (sr.startBlock && sr.endBlock) {
    const start = BigInt(sr.startBlock);
    const end = BigInt(sr.endBlock);
    const report = await scanTaxCollection(start, end, sr.rpcUrl || null);
    return { success: true, result: report };
  }

  // If seller provided tokenAddress and launchBlock, allow that too
  if (sr.tokenAddress && sr.launchBlock) {
    const start = BigInt(sr.launchBlock);
    const end = start + BigInt(2940);
    const report = await scanTaxCollection(start, end, sr.rpcUrl || null);
    return { success: true, result: report };
  }

  return { success: false, error: 'Insufficient service requirement fields for tax-scanner. Provide startBlock/endBlock or tokenAddress + launchBlock.' };
});

export function registerHandler(name, fn) {
  handlers.set(name, fn);
}

export function getHandler(name) {
  return handlers.get(name);
}

export default {
  registerHandler,
  getHandler,
};
