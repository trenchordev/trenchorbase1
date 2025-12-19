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
    const key = `trenchshare:submission:${campaignId}:${wallet.toLowerCase()}`;
    const submission = await redis.hgetall(key);

    if (submission && submission.posts) {
      return NextResponse.json({
        submission: {
          campaignId: submission.campaignId,
          wallet: submission.wallet,
          posts: JSON.parse(submission.posts),
          status: submission.status || 'pending',
          points: parseInt(submission.points) || 0,
          timestamp: submission.timestamp,
        }
      });
    }

    return NextResponse.json({ submission: null });
  } catch (error) {
    console.error('Error fetching submission:', error);
    return NextResponse.json({ error: 'Failed to fetch submission' }, { status: 500 });
  }
}
