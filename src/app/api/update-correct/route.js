import { NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem, decodeEventLog } from 'viem';
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

// Pool adresi
const POOL_ADDRESS = "0x780eeb55c05c9611987f839f5fb6c67b0312d2e5";

// Uniswap V2 Swap Event Topic (keccak256 hash)
const SWAP_TOPIC = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";

export async function GET() {
  try {
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock - 5000n;

    // Raw logs çek - filtresiz, sadece bu contract'tan
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
    const debugInfo = [];

    for (const log of rawLogs) {
      const txHash = log.transactionHash;
      
      // Transaction receipt al - internal transactions dahil
      const receipt = await client.getTransactionReceipt({ hash: txHash });
      const tx = await client.getTransaction({ hash: txHash });
      
      // GERÇEK KULLANICI: Transaction'ı imzalayan adres
      const realUser = receipt.from.toLowerCase();
      
      // Swap verilerini decode et
      // Data: amount0In, amount1In, amount0Out, amount1Out (her biri 32 byte = 64 hex char)
      const data = log.data.slice(2); // 0x'i kaldır
      const amount0In = BigInt('0x' + data.slice(0, 64));
      const amount1In = BigInt('0x' + data.slice(64, 128));
      const amount0Out = BigInt('0x' + data.slice(128, 192));
      const amount1Out = BigInt('0x' + data.slice(192, 256));

      // Volume hesapla (hangisi büyükse onu al)
      let volumeWei = 0n;
      let type = "UNKNOWN";

      if (amount0In > 0n) {
        volumeWei = amount0In;
        type = amount1Out > 0n ? "BUY" : "UNKNOWN";
      } else if (amount1In > 0n) {
        volumeWei = amount1In;
        type = amount0Out > 0n ? "SELL" : "UNKNOWN";
      }

      const volumeETH = Number(volumeWei) / 1e18;

      debugInfo.push({
        txHash: txHash.slice(0, 20) + '...',
        realUser,
        type,
        volumeETH: volumeETH.toFixed(4),
        blockNumber: parseInt(log.blockNumber, 16)
      });

      if (volumeETH > 0.0001) {
        if (!traderData.has(realUser)) {
          traderData.set(realUser, { totalVolume: 0, netBuy: 0, txCount: 0 });
        }
        
        const data = traderData.get(realUser);
        data.totalVolume += volumeETH;
        data.txCount++;
        
        if (type === "BUY") {
          data.netBuy += volumeETH;
        } else if (type === "SELL") {
          data.netBuy -= volumeETH;
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
      await redis.zadd('leaderboard:volume', {
        score: data.totalVolume,
        member: trader
      });
      
      await redis.hset(`user:${trader}`, {
        totalVolume: data.totalVolume.toString(),
        netBuy: data.netBuy.toString(),
        txCount: data.txCount.toString()
      });
    }

    return NextResponse.json({ 
      success: true,
      currentBlock: Number(currentBlock),
      fromBlock: Number(fromBlock),
      totalSwaps: rawLogs.length,
      uniqueTraders: traderData.size,
      traders: Array.from(traderData.entries()).map(([addr, data]) => ({
        address: addr,
        ...data
      })),
      debug: debugInfo.slice(0, 10)
    });

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
}
