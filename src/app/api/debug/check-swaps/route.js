import { NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const SWAP_TOPIC = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";

const RPC_ENDPOINTS = [
  'https://mainnet.base.org',
  'https://base.llamarpc.com',
  'https://base-mainnet.public.blastapi.io',
];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lpAddress = searchParams.get('lp');
  const blocks = parseInt(searchParams.get('blocks') || '500');
  
  if (!lpAddress) {
    return NextResponse.json({ error: 'LP address required' }, { status: 400 });
  }

  const results = [];
  
  for (const rpc of RPC_ENDPOINTS) {
    try {
      const client = createPublicClient({
        chain: base,
        transport: http(rpc, { timeout: 10000 }),
      });
      
      const currentBlock = await client.getBlockNumber();
      const fromBlock = currentBlock - BigInt(blocks);
      
      const logs = await client.request({
        method: 'eth_getLogs',
        params: [{
          address: lpAddress.toLowerCase(),
          fromBlock: `0x${fromBlock.toString(16)}`,
          toBlock: `0x${currentBlock.toString(16)}`,
          topics: [SWAP_TOPIC]
        }]
      });
      
      results.push({
        rpc: rpc.split('/')[2],
        currentBlock: currentBlock.toString(),
        fromBlock: fromBlock.toString(),
        swapCount: logs.length,
        lastSwaps: logs.slice(-3).map(l => ({
          block: parseInt(l.blockNumber, 16),
          txHash: l.transactionHash
        }))
      });
    } catch (err) {
      results.push({
        rpc: rpc.split('/')[2],
        error: err.message
      });
    }
  }
  
  return NextResponse.json({
    lpAddress,
    blocksScanned: blocks,
    results
  });
}
