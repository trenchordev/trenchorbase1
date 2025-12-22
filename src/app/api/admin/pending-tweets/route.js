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
      // Use the set of submissions instead of scanning keys
      // This is much more reliable and performant
      const submissionWallets = await redis.smembers(`trenchshare:campaign:${campaign.id}:submissions`);

      for (const wallet of submissionWallets) {
        const submissionKey = `trenchshare:submission:${campaign.id}:${wallet}`;
        const submission = await redis.hgetall(submissionKey);

        if (submission && submission.posts) {
          let posts = [];
          try {
            posts = typeof submission.posts === 'string' ? JSON.parse(submission.posts) : submission.posts;
          } catch (e) {
            console.error(`Error parsing posts for ${wallet}:`, e);
            continue;
          }

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
