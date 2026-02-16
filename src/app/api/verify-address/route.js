import { NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';

const client = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
});

const POOL_ADDRESS = "0x70000c1cb3ee34a7323211607ac3162665b49549";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const testAddress = searchParams.get('address') || '0xf3964a4Ba7371E4C44aADFAc679cE9ba8B6AdC66';
    
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock - 5000n;
    
    // Bu pool'daki TÜM Swap eventlerini al
    const allSwaps = await client.getLogs({
      address: POOL_ADDRESS,
      event: parseAbiItem('event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)'),
      fromBlock: fromBlock,
      toBlock: currentBlock
    });

    // Test adresinin olduğu swap'ları bul
    const addressSwaps = allSwaps.filter(log => {
      return log.args.sender.toLowerCase() === testAddress.toLowerCase() ||
             log.args.to.toLowerCase() === testAddress.toLowerCase();
    });

    // Tüm swap'lardaki adresleri topla
    const allAddresses = {
      senders: new Set(),
      recipients: new Set()
    };

    allSwaps.forEach(log => {
      allAddresses.senders.add(log.args.sender.toLowerCase());
      allAddresses.recipients.add(log.args.to.toLowerCase());
    });

    return NextResponse.json({
      success: true,
      poolAddress: POOL_ADDRESS,
      currentBlock: Number(currentBlock),
      fromBlock: Number(fromBlock),
      testAddress: testAddress,
      totalSwaps: allSwaps.length,
      addressFoundInSwaps: addressSwaps.length,
      addressDetails: addressSwaps.map(log => ({
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        sender: log.args.sender,
        to: log.args.to,
        amount0In: log.args.amount0In.toString(),
        amount1In: log.args.amount1In.toString(),
        amount0Out: log.args.amount0Out.toString(),
        amount1Out: log.args.amount1Out.toString()
      })),
      uniqueSenders: Array.from(allAddresses.senders),
      uniqueRecipients: Array.from(allAddresses.recipients),
      allSwapsSample: allSwaps.slice(0, 3).map(log => ({
        sender: log.args.sender,
        to: log.args.to,
        txHash: log.transactionHash
      }))
    });

  } catch (error) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
