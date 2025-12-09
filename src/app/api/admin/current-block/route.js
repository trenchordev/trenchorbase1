import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const COOKIE_NAME = 'ADMIN_PASSWORD';

// Birden fazla RPC kullanarak en güncel bloğu al
const RPC_ENDPOINTS = [
  'https://mainnet.base.org',
  'https://base.llamarpc.com',
  'https://base-mainnet.public.blastapi.io',
  'https://base.meowrpc.com',
  'https://1rpc.io/base',
];

async function getBlockFromRPC(rpcUrl) {
  try {
    const client = createPublicClient({
      chain: base,
      transport: http(rpcUrl, { timeout: 5000 }),
    });
    const blockNumber = await client.getBlockNumber();
    return { rpcUrl, blockNumber: BigInt(blockNumber) };
  } catch (error) {
    return { rpcUrl, blockNumber: BigInt(0), error: error.message };
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const authCookie = cookieStore.get(COOKIE_NAME);
    if (authCookie?.value !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Tüm RPC'lerden paralel olarak blok numarası al
    const results = await Promise.all(
      RPC_ENDPOINTS.map(rpc => getBlockFromRPC(rpc))
    );

    // En yüksek blok numarasını bul
    let maxBlock = BigInt(0);
    let bestRpc = '';

    for (const result of results) {
      if (result.blockNumber > maxBlock) {
        maxBlock = result.blockNumber;
        bestRpc = result.rpcUrl;
      }
    }

    if (maxBlock === BigInt(0)) {
      return NextResponse.json(
        { success: false, error: 'All RPC endpoints failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      blockNumber: maxBlock.toString(),
      timestamp: Date.now(),
      source: bestRpc,
      // Debug için tüm sonuçlar
      allResults: results.map(r => ({
        rpc: r.rpcUrl.split('/')[2],
        block: r.blockNumber.toString(),
        error: r.error
      }))
    });
  } catch (error) {
    console.error('Error fetching current block:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
