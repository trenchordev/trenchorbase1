import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET(request) {
  try {
    // Get all active trenchshare campaigns
    const campaignKeys = await redis.keys('trenchshare:campaign:*');
    const campaigns = [];
    
    for (const key of campaignKeys) {
      // Only get the main campaign hash, not sub-keys
      if (key.split(':').length !== 3) continue;
      
      const campaign = await redis.hgetall(key);
      if (campaign && campaign.id) {
        campaigns.push(campaign);
      }
    }

    // Get all submissions with pending tweets
    const submissions = [];
    
    for (const campaign of campaigns) {
      const submissionKeys = await redis.keys(`trenchshare:submission:${campaign.id}:*`);
      
      for (const subKey of submissionKeys) {
        const submission = await redis.hgetall(subKey);
        if (submission && submission.posts) {
          const posts = JSON.parse(submission.posts);
          
          // Filter only pending posts
          const pendingPosts = posts.filter(p => p.status === 'pending');
          
          if (pendingPosts.length > 0) {
            submissions.push({
              campaignId: campaign.id,
              campaignName: campaign.name,
              wallet: submission.wallet,
              submittedAt: submission.submittedAt,
              posts: posts, // Keep all posts but mark which are pending
            });
          }
        }
      }
    }

    // Sort by submission date (newest first)
    submissions.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    return NextResponse.json({ submissions });
  } catch (error) {
    console.error('Error fetching pending tweets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pending tweets' },
      { status: 500 }
    );
  }
}
