import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('campaignId');
    const wallet = searchParams.get('wallet');

    if (!campaignId || !wallet) {
      return NextResponse.json({ error: 'Missing campaignId or wallet' }, { status: 400 });
    }

    const walletLower = wallet.toLowerCase();
    const today = new Date().toISOString().split('T')[0];
    const dailyLimitKey = `trenchshare:daily-limit:${campaignId}:${walletLower}:${today}`;

    const count = await redis.get(dailyLimitKey) || 0;

    return NextResponse.json({
      success: true,
      count: parseInt(count),
      remaining: Math.max(0, 10 - parseInt(count)),
      resetAtUtc: "00:00"
    });
  } catch (error) {
    console.error('Error fetching daily status:', error);
    return NextResponse.json({ error: 'Failed to fetch daily status' }, { status: 500 });
  }
}
