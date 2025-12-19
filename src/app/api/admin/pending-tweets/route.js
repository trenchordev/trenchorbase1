import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET(request) {
  try {
    // Get all active campaigns
    const campaignKeys = await redis.keys('campaign:*');
    const campaigns = [];
    
    for (const key of campaignKeys) {
      const campaign = await redis.get(key);
      if (campaign) {
        campaigns.push(JSON.parse(campaign));
      }
    }

    // Get all submissions with pending tweets
    const submissions = [];
    
    for (const campaign of campaigns) {
      const submissionKeys = await redis.keys(`submission:${campaign.id}:*`);
      
      for (const subKey of submissionKeys) {
        const submission = await redis.get(subKey);
        if (submission) {
          const parsed = JSON.parse(submission);
          
          // Filter only pending posts
          const pendingPosts = parsed.posts.filter(p => p.status === 'pending');
          
          if (pendingPosts.length > 0) {
            submissions.push({
              ...parsed,
              campaignName: campaign.name,
              posts: parsed.posts, // Keep all posts but mark which are pending
            });
          }
        }
      }
    }

    // Sort by submission date (newest first)
    submissions.sort((a, b) => b.submittedAt - a.submittedAt);

    return NextResponse.json({ submissions });
  } catch (error) {
    console.error('Error fetching pending tweets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pending tweets' },
      { status: 500 }
    );
  }
}
