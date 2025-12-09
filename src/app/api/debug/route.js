import { NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';

const client = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
});

const POOL_ADDRESS = "0x780eeb55c05c9611987f839f5fb6c67b0312d2e5";

export async function GET() {
  try {
    const currentBlock = await client.getBlockNumber();
    
    // Son 5000 bloğu kontrol et (yaklaşık 2.7 saat)
    const fromBlock = currentBlock - 5000n;
    
    // Tüm event'leri getir (filtresiz)
    const allLogs = await client.getLogs({
      address: POOL_ADDRESS,
      fromBlock: fromBlock,
      toBlock: currentBlock
    });

    // Uniswap V2 Swap event
    let v2Logs = [];
    try {
      v2Logs = await client.getLogs({
        address: POOL_ADDRESS,
        event: parseAbiItem('event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)'),
        fromBlock: fromBlock,
        toBlock: currentBlock
      });
    } catch (e) {
      console.log('V2 event error:', e.message);
    }

    // Uniswap V3 Swap event
    let v3Logs = [];
    try {
      v3Logs = await client.getLogs({
        address: POOL_ADDRESS,
        event: parseAbiItem('event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'),
        fromBlock: fromBlock,
        toBlock: currentBlock
      });
    } catch (e) {
      console.log('V3 event error:', e.message);
    }

    return NextResponse.json({
      success: true,
      currentBlock: Number(currentBlock),
      fromBlock: Number(fromBlock),
      poolAddress: POOL_ADDRESS,
      checksumAddress: POOL_ADDRESS.toLowerCase(),
      totalAllEvents: allLogs.length,
      v2SwapEvents: v2Logs.length,
      v3SwapEvents: v3Logs.length,
      allEventSample: allLogs.slice(0, 5).map(log => ({
        topics: log.topics,
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash
      }))
    });

  } catch (error) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
