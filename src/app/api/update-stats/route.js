import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const client = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
});

// Pool adresi
const POOL_ADDRESS = "0x780eeb55c05c9611987f839f5fb6c67b0312d2e5";

// Uniswap V2 Swap Event Topic
const SWAP_TOPIC = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";

// VIRTUAL fiyatı USD cinsinden
const VIRTUAL_USD_PRICE = 1.50;

// Pool yapısı: Token0 = VIRTUAL (0x0b3e...), Token1 = MEME TOKEN
// Debug-swaps verilerine göre doğrulandı
const VIRTUAL_IS_TOKEN0 = true; // VIRTUAL token0 pozisyonunda!

export async function GET() {
  try {
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock - 5000n;

    const rawLogs = await client.request({
      method: 'eth_getLogs',
      params: [{
        address: POOL_ADDRESS,
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${currentBlock.toString(16)}`,
        topics: [SWAP_TOPIC]
      }]
    });

    console.log(`Found ${rawLogs.length} raw swap logs`);

    const traderData = new Map();

    for (const log of rawLogs) {
      const txHash = log.transactionHash;
      const receipt = await client.getTransactionReceipt({ hash: txHash });
      const realUser = receipt.from.toLowerCase();
      
      // Swap verilerini decode et
      const data = log.data.slice(2);
      const amount0In = BigInt('0x' + data.slice(0, 64));
      const amount1In = BigInt('0x' + data.slice(64, 128));
      const amount0Out = BigInt('0x' + data.slice(128, 192));
      const amount1Out = BigInt('0x' + data.slice(192, 256));

      // Token miktarları (18 decimal varsayımı)
      const token0InAmount = Number(amount0In) / 1e18;
      const token1InAmount = Number(amount1In) / 1e18;
      const token0OutAmount = Number(amount0Out) / 1e18;
      const token1OutAmount = Number(amount1Out) / 1e18;

      let virtualVolume = 0;
      let tokenVolume = 0;
      let type = "UNKNOWN";

      if (VIRTUAL_IS_TOKEN0) {
        // Token0 = VIRTUAL, Token1 = MEME TOKEN
        // BUY MEME: VIRTUAL giriyor (amount0In > 0), Token çıkıyor (amount1Out > 0)
        // SELL MEME: Token giriyor (amount1In > 0), VIRTUAL çıkıyor (amount0Out > 0)
        
        if (amount0In > 0n && amount1Out > 0n) {
          type = "BUY";
          virtualVolume = token0InAmount;
          tokenVolume = token1OutAmount;
        } else if (amount1In > 0n && amount0Out > 0n) {
          type = "SELL";
          virtualVolume = token0OutAmount;
          tokenVolume = token1InAmount;
        }
      } else {
        // Token0 = MEME, Token1 = VIRTUAL (eski mantık)
        if (amount1In > 0n && amount0Out > 0n) {
          type = "BUY";
          virtualVolume = token1InAmount;
          tokenVolume = token0OutAmount;
        } else if (amount0In > 0n && amount1Out > 0n) {
          type = "SELL";
          virtualVolume = token1OutAmount;
          tokenVolume = token0InAmount;
        }
      }

      const usdVolume = virtualVolume * VIRTUAL_USD_PRICE;

      if (virtualVolume > 0.0001) {
        if (!traderData.has(realUser)) {
          traderData.set(realUser, { 
            totalVirtualVolume: 0,
            totalTokenVolume: 0,
            totalUsdVolume: 0,
            buyVirtualVolume: 0,
            sellVirtualVolume: 0,
            buyUsdVolume: 0,
            sellUsdVolume: 0,
            netBuyVirtual: 0,
            netBuyUsd: 0,
            txCount: 0 
          });
        }
        
        const userData = traderData.get(realUser);
        userData.totalVirtualVolume += virtualVolume;
        userData.totalTokenVolume += tokenVolume;
        userData.totalUsdVolume += usdVolume;
        userData.txCount++;
        
        if (type === "BUY") {
          userData.buyVirtualVolume += virtualVolume;
          userData.buyUsdVolume += usdVolume;
          userData.netBuyVirtual += virtualVolume;
          userData.netBuyUsd += usdVolume;
        } else if (type === "SELL") {
          userData.sellVirtualVolume += virtualVolume;
          userData.sellUsdVolume += usdVolume;
          userData.netBuyVirtual -= virtualVolume;
          userData.netBuyUsd -= usdVolume;
        }
      }
    }

    // Redis temizle
    await redis.del('leaderboard:volume');
    const oldKeys = await redis.keys('user:*');
    if (oldKeys && oldKeys.length > 0) {
      await redis.del(...oldKeys);
    }

    // Verileri kaydet
    for (const [trader, data] of traderData.entries()) {
      // USD volume'a göre sırala
      await redis.zadd('leaderboard:volume', {
        score: data.totalUsdVolume,
        member: trader
      });
      
      await redis.hset(`user:${trader}`, {
        totalVirtualVolume: data.totalVirtualVolume.toFixed(4),
        totalTokenVolume: data.totalTokenVolume.toFixed(4),
        totalUsdVolume: data.totalUsdVolume.toFixed(2),
        buyVirtualVolume: data.buyVirtualVolume.toFixed(4),
        sellVirtualVolume: data.sellVirtualVolume.toFixed(4),
        buyUsdVolume: data.buyUsdVolume.toFixed(2),
        sellUsdVolume: data.sellUsdVolume.toFixed(2),
        netBuyVirtual: data.netBuyVirtual.toFixed(4),
        netBuyUsd: data.netBuyUsd.toFixed(2),
        txCount: data.txCount.toString()
      });
    }

    return NextResponse.json({ 
      success: true,
      message: `${traderData.size} trader işlendi (${rawLogs.length} swap)`,
      block: Number(currentBlock),
      totalSwaps: rawLogs.length,
      uniqueTraders: traderData.size,
      virtualUsdPrice: VIRTUAL_USD_PRICE
    });

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}