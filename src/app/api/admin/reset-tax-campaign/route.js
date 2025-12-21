import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redis } from '@/lib/redis';

export async function POST(request) {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('ADMIN_PASSWORD');

  if (adminAuth?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { campaignId } = await request.json();

    if (!campaignId) {
      return NextResponse.json({ error: 'Campaign ID is required' }, { status: 400 });
    }

    console.log(`🗑️ Resetting tax campaign data for: ${campaignId}`);

    // Keys to delete
    const keysToDelete = [
      `tax-leaderboard:${campaignId}`,
      `tax-leaderboard-meta:${campaignId}`,
      `tax-campaign:${campaignId}:processed-txs`,
      `tax-campaign-job:${campaignId}`
    ];

    // Check which keys exist
    const existingKeys = [];
    for (const key of keysToDelete) {
      const exists = await redis.exists(key);
      if (exists) {
        existingKeys.push(key);
      }
    }

    if (existingKeys.length > 0) {
      await redis.del(...existingKeys);
    }

    console.log(`✅ Deleted ${existingKeys.length} keys for campaign ${campaignId}`);

    return NextResponse.json({ 
      success: true, 
      message: `Reset complete. Deleted ${existingKeys.length} keys.`,
      deletedKeys: existingKeys 
    });
  } catch (error) {
    console.error('Error resetting tax campaign:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
