import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET() {
  try {
    // Get all campaigns (using same format as admin API)
    const allKeys = await redis.keys('trenchshare:campaign:*');
    
    // Filter out non-campaign keys (like :submissions, :leaderboard, etc)
    const campaignKeys = allKeys.filter(key => {
      const parts = key.split(':');
      // Valid campaign key: trenchshare:campaign:{id}
      // Invalid: trenchshare:campaign:{id}:submissions
      return parts.length === 3;
    });
    
    const campaigns = [];
    
    for (const key of campaignKeys) {
      const campaign = await redis.hgetall(key);
      if (campaign && campaign.id) {
        // Get participant count for this campaign
        const leaderboardKey = `leaderboard:campaign:${campaign.id}`;
        const participantCount = await redis.zcard(leaderboardKey);
        
        // Get submission count
        const submissionKeys = await redis.keys(`submission:${campaign.id}:*`);
        
        campaigns.push({
          id: campaign.id,
          name: campaign.name,
          description: campaign.description || '',
          startDate: campaign.startDate,
          endDate: campaign.endDate,
          maxPosts: parseInt(campaign.maxPosts) || 10,
          status: campaign.active === 'true' ? 'active' : 'inactive',
          participantCount: participantCount || 0,
          submissionCount: submissionKeys.length || 0
        });
      }
    }

    // Sort by start date (newest first)
    campaigns.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaigns' },
      { status: 500 }
    );
  }
}
