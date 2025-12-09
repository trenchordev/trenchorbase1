import { NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const client = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
});

const POOL_ADDRESS = "0x780eeb55c05c9611987f839f5fb6c67b0312d2e5";
const SWAP_TOPIC = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";

export async function GET() {
  try {
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock - 5000n;

    // Raw logs çek
    const rawLogs = await client.request({
      method: 'eth_getLogs',
      params: [{
        address: POOL_ADDRESS,
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${currentBlock.toString(16)}`,
        topics: [SWAP_TOPIC]
      }]
    });

    const swapDetails = [];

    for (const log of rawLogs) {
      const txHash = log.transactionHash;
      const receipt = await client.getTransactionReceipt({ hash: txHash });
      const tx = await client.getTransaction({ hash: txHash });
      
      // Swap verilerini decode et
      const data = log.data.slice(2);
      const amount0In = BigInt('0x' + data.slice(0, 64));
      const amount1In = BigInt('0x' + data.slice(64, 128));
      const amount0Out = BigInt('0x' + data.slice(128, 192));
      const amount1Out = BigInt('0x' + data.slice(192, 256));

      // Indexed parametreler (sender ve to)
      const sender = '0x' + log.topics[1].slice(26);
      const to = '0x' + log.topics[2].slice(26);

      swapDetails.push({
        txHash,
        blockNumber: parseInt(log.blockNumber, 16),
        // Transaction bilgileri
        txFrom: receipt.from.toLowerCase(),
        txTo: tx.to?.toLowerCase(),
        // Event parametreleri
        eventSender: sender.toLowerCase(),
        eventTo: to.toLowerCase(),
        // Swap miktarları
        amount0In: (Number(amount0In) / 1e18).toFixed(6),
        amount1In: (Number(amount1In) / 1e18).toFixed(6),
        amount0Out: (Number(amount0Out) / 1e18).toFixed(6),
        amount1Out: (Number(amount1Out) / 1e18).toFixed(6),
        // Raw değerler
        raw: {
          amount0In: amount0In.toString(),
          amount1In: amount1In.toString(),
          amount0Out: amount0Out.toString(),
          amount1Out: amount1Out.toString()
        }
      });
    }

    // Unique adresleri topla
    const uniqueTxFrom = [...new Set(swapDetails.map(s => s.txFrom))];
    const uniqueEventSender = [...new Set(swapDetails.map(s => s.eventSender))];
    const uniqueEventTo = [...new Set(swapDetails.map(s => s.eventTo))];

    return NextResponse.json({
      poolAddress: POOL_ADDRESS,
      currentBlock: Number(currentBlock),
      fromBlock: Number(fromBlock),
      totalSwaps: rawLogs.length,
      uniqueAddresses: {
        txFrom: uniqueTxFrom,
        eventSender: uniqueEventSender,
        eventTo: uniqueEventTo
      },
      swaps: swapDetails
    });

  } catch (error) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
