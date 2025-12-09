import { NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const client = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
});

const POOL_ADDRESS = "0x780eeb55c05c9611987f839f5fb6c67b0312d2e5";
const VIRTUAL_PRICE = 1;

export async function GET() {
  try {
    const currentBlock = await client.getBlockNumber();
    
    console.log('Current block:', currentBlock);
    console.log('Pool address:', POOL_ADDRESS);
    
    // Son 5000 bloğu tara
    const fromBlock = currentBlock - 5000n;
    console.log('Checking from block:', fromBlock, 'to', currentBlock);
    
    const logs = await client.getLogs({
      address: POOL_ADDRESS,
      event: parseAbiItem('event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)'),
      fromBlock: fromBlock,
      toBlock: currentBlock
    });

    console.log('Total Swap events found:', logs.length);

    // Her trader için en güncel hacim verilerini tut
    const traderData = new Map();

    // Her transaction için gerçek sender'ı (from) bul
    for (const log of logs) {
      const { args, transactionHash } = log;
      
      // Transaction'ı getir - gerçek başlatıcıyı bulmak için
      const tx = await client.getTransaction({ hash: transactionHash });
      
      // GERÇEK TRADER: Transaction'ı başlatan kişi (tx.from)
      const realTrader = tx.from;
      
      let volumeUSD = 0;
      let type = "UNKNOWN";

      // Token0 = ETH/WETH, Token1 = Token (genellikle)
      // amount0In > 0: Token0 (ETH) giriyor, Token1 çıkıyor = BUY
      // amount1In > 0: Token1 giriyor, Token0 (ETH) çıkıyor = SELL
      
      if (Number(args.amount0In) > 0 && Number(args.amount1Out) > 0) {
        // ETH giriyor, Token çıkıyor = BUY
        type = "BUY";
        volumeUSD = (Number(args.amount0In) / 1e18) * VIRTUAL_PRICE;
      } 
      else if (Number(args.amount1In) > 0 && Number(args.amount0Out) > 0) {
        // Token giriyor, ETH çıkıyor = SELL
        type = "SELL";
        volumeUSD = (Number(args.amount1In) / 1e18) * VIRTUAL_PRICE;
      }

      console.log(`TX: ${transactionHash.slice(0, 10)}... | Real Trader: ${realTrader} | Type: ${type} | Volume: $${volumeUSD.toFixed(2)}`);

      if (volumeUSD > 0.01) {
        if (!traderData.has(realTrader)) {
          traderData.set(realTrader, { totalVolume: 0, netBuy: 0 });
        }
        
        const data = traderData.get(realTrader);
        data.totalVolume += volumeUSD;
        
        if (type === "BUY") {
          data.netBuy += volumeUSD;
        } else {
          data.netBuy -= volumeUSD;
        }
      }
    }

    // Redis'e kaydet - ÖNCE ESKİ VERİLERİ SİL
    console.log('Clearing old data...');
    await redis.del('leaderboard:volume');
    
    const oldKeys = await redis.keys('user:*');
    if (oldKeys && oldKeys.length > 0) {
      await redis.del(...oldKeys);
    }

    // Yeni verileri ekle
    console.log('Adding new data...');
    let processedCount = 0;
    
    for (const [trader, data] of traderData.entries()) {
      processedCount++;
      const userKey = `user:${trader}`;
      
      await redis.zadd('leaderboard:volume', {
        score: data.totalVolume,
        member: trader
      });
      
      await redis.hset(userKey, {
        totalVolume: data.totalVolume.toString(),
        netBuy: data.netBuy.toString()
      });
    }

    return NextResponse.json({ 
        success: true, 
        message: `${processedCount} trader işlendi (${logs.length} swap eventi)`,
        block: Number(currentBlock),
        totalSwaps: logs.length,
        uniqueTraders: processedCount
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
