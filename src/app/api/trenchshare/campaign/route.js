import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Campaign ID is required' },
        { status: 400 }
      );
    }

    const campaign = await redis.hgetall(`trenchshare:campaign:${id}`);
    
    if (!campaign || !campaign.id) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Get participant count
    const leaderboardKey = `leaderboard:campaign:${id}`;
    const participantCount = await redis.zcard(leaderboardKey);

    return NextResponse.json({ 
      campaign: {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description || '',
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        maxPosts: parseInt(campaign.maxPosts) || 10,
        status: campaign.active === 'true' ? 'active' : 'inactive',
        participantCount: participantCount || 0
      }
    });
  } catch (error) {
    console.error('Error fetching campaign:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaign' },
      { status: 500 }
    );
  }
}
