import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function GET() {
  try {
    // Demo trader adresleri
    const demoTraders = [
      {
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        totalVolume: 15420.50,
        netBuy: 8234.25
      },
      {
        address: '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
        totalVolume: 12350.75,
        netBuy: -3420.50
      },
      {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        totalVolume: 9876.30,
        netBuy: 5432.10
      },
      {
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        totalVolume: 8456.20,
        netBuy: -1234.56
      },
      {
        address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        totalVolume: 7234.80,
        netBuy: 2345.67
      },
      {
        address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
        totalVolume: 6543.21,
        netBuy: 4567.89
      },
      {
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        totalVolume: 5432.10,
        netBuy: -2345.67
      },
      {
        address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
        totalVolume: 4321.09,
        netBuy: 1234.56
      }
    ];

    // Redis'e demo verileri ekle
    for (const trader of demoTraders) {
      const userKey = `user:${trader.address}`;
      
      // Leaderboard ZSET'e ekle
      await redis.zadd('leaderboard:volume', {
        score: trader.totalVolume,
        member: trader.address
      });
      
      // User details HASH'e ekle
      await redis.hset(userKey, {
        totalVolume: trader.totalVolume.toString(),
        netBuy: trader.netBuy.toString()
      });
    }

    return NextResponse.json({
      success: true,
      message: `${demoTraders.length} demo trader eklendi!`,
      traders: demoTraders.length
    });

  } catch (error) {
    console.error('Demo data error:', error);
    return NextResponse.json({
      error: error.message
    }, { status: 500 });
  }
}
