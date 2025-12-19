import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const isTruthy = (value) => value === true || value === 'true' || value === 1 || value === '1';

export async function GET() {
  try {
    
    // Get all campaigns
    const campaignKeys = await redis.keys('trenchshare:campaign:*');
    let activeCampaign = null;
    const now = new Date();

    for (const key of campaignKeys) {
      const campaign = await redis.hgetall(key);
      if (campaign && isTruthy(campaign.active)) {
        const startDate = new Date(campaign.startDate);
        const endDate = new Date(campaign.endDate);
        
        if (now >= startDate && now <= endDate) {
          // Get participant count
          const submissionKeys = await redis.keys(`trenchshare:submission:${campaign.id}:*`);
          
          activeCampaign = {
            id: campaign.id,
            name: campaign.name,
            description: campaign.description || '',
            startDate: campaign.startDate,
            endDate: campaign.endDate,
            maxPosts: parseInt(campaign.maxPosts) || 10,
            participantCount: submissionKeys.length,
          };
          break;
        }
      }
    }

    return NextResponse.json({ campaign: activeCampaign });
  } catch (error) {
    console.error('Error fetching active campaign:', error);
    return NextResponse.json({ error: 'Failed to fetch campaign' }, { status: 500 });
  }
}
