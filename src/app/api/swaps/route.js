import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { createPublicClient, http, decodeAbiParameters } from 'viem';
import { base } from 'viem/chains';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const client = createPublicClient({
  chain: base,
  transport: http('https://base.llamarpc.com'),
});

// === ADRESLER ===
const LP_ADDRESS = "0x780eeb55c05c9611987f839f5fb6c67b0312d2e5".toLowerCase();
const TOKEN_ADDRESS = "0x15dd9165b3a80F83a5471f2E6eba57158cA3cF86".toLowerCase();
const VIRTUAL_ADDRESS = "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b".toLowerCase();

// Uniswap V2 Swap Event
const SWAP_TOPIC = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";

// Transfer event topic
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// VIRTUAL USD fiyatı
const VIRTUAL_USD_PRICE = 1.50;

export async function GET() {
  try {
    const currentBlock = await client.getBlockNumber();
    
    // 10000 block tara, 1000'lik parçalar halinde (RPC limiti)
    const totalBlocks = 10000n;
    const chunkSize = 1000n;
    const startBlock = currentBlock - totalBlocks;
    
    console.log(`Scanning blocks ${startBlock} to ${currentBlock} in chunks of ${chunkSize}`);

    let allSwapLogs = [];
    
    // 1000'lik parçalar halinde tara
    for (let from = startBlock; from < currentBlock; from += chunkSize) {
      const to = from + chunkSize > currentBlock ? currentBlock : from + chunkSize;
      
      const logs = await client.request({
        method: 'eth_getLogs',
        params: [{
          address: LP_ADDRESS,
          fromBlock: `0x${from.toString(16)}`,
          toBlock: `0x${to.toString(16)}`,
          topics: [SWAP_TOPIC]
        }]
      });
      
      allSwapLogs = allSwapLogs.concat(logs);
      console.log(`Chunk ${from}-${to}: ${logs.length} swaps found`);
    }

    const swapLogs = allSwapLogs;
    console.log(`Total: ${swapLogs.length} swap events`);

    const traders = new Map();
    const swapDetails = [];

    for (const log of swapLogs) {
      const txHash = log.transactionHash;
      
      // Transaction receipt al - gerçek kullanıcıyı bulmak için
      const receipt = await client.getTransactionReceipt({ hash: txHash });
      const trader = receipt.from.toLowerCase();

      // Transfer eventlerini analiz et - hangi token ne kadar hareket etti
      let virtualIn = 0n;
      let virtualOut = 0n;
      let tokenIn = 0n;
      let tokenOut = 0n;

      for (const txLog of receipt.logs) {
        // Sadece Transfer eventlerini kontrol et
        if (txLog.topics[0] !== TRANSFER_TOPIC) continue;
        
        const tokenAddress = txLog.address.toLowerCase();
        const from = '0x' + txLog.topics[1].slice(26).toLowerCase();
        const to = '0x' + txLog.topics[2].slice(26).toLowerCase();
        const amount = BigInt(txLog.data);

        // VIRTUAL transferleri
        if (tokenAddress === VIRTUAL_ADDRESS) {
          if (to === LP_ADDRESS) {
            virtualIn += amount; // VIRTUAL LP'ye girdi
          }
          if (from === LP_ADDRESS) {
            virtualOut += amount; // VIRTUAL LP'den çıktı
          }
        }

        // TOKEN transferleri
        if (tokenAddress === TOKEN_ADDRESS) {
          if (to === LP_ADDRESS) {
            tokenIn += amount; // Token LP'ye girdi
          }
          if (from === LP_ADDRESS) {
            tokenOut += amount; // Token LP'den çıktı
          }
        }
      }

      // İşlem tipini belirle
      let type = "UNKNOWN";
      let virtualAmount = 0;
      let tokenAmount = 0;

      if (virtualIn > 0n && tokenOut > 0n) {
        // VIRTUAL girdi, TOKEN çıktı = BUY (kullanıcı token aldı)
        type = "BUY";
        virtualAmount = Number(virtualIn) / 1e18;
        tokenAmount = Number(tokenOut) / 1e18;
      } else if (tokenIn > 0n && virtualOut > 0n) {
        // TOKEN girdi, VIRTUAL çıktı = SELL (kullanıcı token sattı)
        type = "SELL";
        virtualAmount = Number(virtualOut) / 1e18;
        tokenAmount = Number(tokenIn) / 1e18;
      }

      if (type === "UNKNOWN") continue;

      const usdAmount = virtualAmount * VIRTUAL_USD_PRICE;

      // Trader verilerini güncelle
      if (!traders.has(trader)) {
        traders.set(trader, {
          buyVirtual: 0,
          sellVirtual: 0,
          buyUsd: 0,
          sellUsd: 0,
          buyToken: 0,
          sellToken: 0,
          txCount: 0
        });
      }

      const data = traders.get(trader);
      data.txCount++;

      if (type === "BUY") {
        data.buyVirtual += virtualAmount;
        data.buyUsd += usdAmount;
        data.buyToken += tokenAmount;
      } else {
        data.sellVirtual += virtualAmount;
        data.sellUsd += usdAmount;
        data.sellToken += tokenAmount;
      }

      swapDetails.push({
        txHash,
        trader,
        type,
        virtualAmount: virtualAmount.toFixed(4),
        tokenAmount: tokenAmount.toFixed(4),
        usdAmount: usdAmount.toFixed(2),
        block: parseInt(log.blockNumber, 16)
      });
    }

    // Redis'i temizle ve yeni verileri kaydet
    await redis.del('leaderboard:volume');
    const oldKeys = await redis.keys('user:*');
    if (oldKeys && oldKeys.length > 0) {
      await redis.del(...oldKeys);
    }

    // Trader verilerini Redis'e kaydet
    for (const [trader, data] of traders.entries()) {
      const totalVirtual = data.buyVirtual + data.sellVirtual;
      const totalUsd = data.buyUsd + data.sellUsd;
      const totalToken = data.buyToken + data.sellToken;
      const netBuyVirtual = data.buyVirtual - data.sellVirtual;
      const netBuyUsd = data.buyUsd - data.sellUsd;

      await redis.zadd('leaderboard:volume', {
        score: totalUsd,
        member: trader
      });

      await redis.hset(`user:${trader}`, {
        totalVirtualVolume: totalVirtual.toFixed(4),
        totalTokenVolume: totalToken.toFixed(4),
        totalUsdVolume: totalUsd.toFixed(2),
        buyVirtualVolume: data.buyVirtual.toFixed(4),
        sellVirtualVolume: data.sellVirtual.toFixed(4),
        buyUsdVolume: data.buyUsd.toFixed(2),
        sellUsdVolume: data.sellUsd.toFixed(2),
        netBuyVirtual: netBuyVirtual.toFixed(4),
        netBuyUsd: netBuyUsd.toFixed(2),
        txCount: data.txCount.toString()
      });
    }

    return NextResponse.json({
      success: true,
      config: {
        lpAddress: LP_ADDRESS,
        tokenAddress: TOKEN_ADDRESS,
        virtualAddress: VIRTUAL_ADDRESS,
        virtualUsdPrice: VIRTUAL_USD_PRICE
      },
      stats: {
        blocksScanned: `${startBlock} - ${currentBlock}`,
        totalSwaps: swapLogs.length,
        processedSwaps: swapDetails.length,
        uniqueTraders: traders.size
      },
      traders: Array.from(traders.entries()).map(([addr, data]) => ({
        address: addr,
        buyVirtual: data.buyVirtual.toFixed(4),
        sellVirtual: data.sellVirtual.toFixed(4),
        buyUsd: data.buyUsd.toFixed(2),
        sellUsd: data.sellUsd.toFixed(2),
        netBuyUsd: (data.buyUsd - data.sellUsd).toFixed(2),
        txCount: data.txCount
      })),
      recentSwaps: swapDetails.slice(-10)
    });

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
