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
    // Delete all tax-related keys
    const configKeys = await redis.keys('tax-campaign-config:*');
    const leaderboardKeys = await redis.keys('tax-leaderboard:*');
    const metaKeys = await redis.keys('tax-leaderboard-meta:*');
    
    const allKeys = [...configKeys, ...leaderboardKeys, ...metaKeys];
    
    if (allKeys.length > 0) {
      await redis.del(...allKeys);
    }

    return NextResponse.json({ 
      success: true, 
      message: `Deleted ${allKeys.length} keys`,
      deletedKeys: allKeys 
    });
  } catch (error) {
    console.error('Error clearing tax data:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
