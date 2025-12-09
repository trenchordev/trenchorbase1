import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Redis } from '@upstash/redis';

const COOKIE_NAME = 'ADMIN_PASSWORD';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function GET() {
  try {
    const cookieStore = await cookies();
    const authCookie = cookieStore.get(COOKIE_NAME);
    if (authCookie?.value !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Tüm leaderboard verilerini sil
    await redis.del('leaderboard:volume');

    // Tüm user key'lerini bul ve sil
    const keys = await redis.keys('user:*');

    if (keys && keys.length > 0) {
      await redis.del(...keys);
    }

    return NextResponse.json({
      success: true,
      message: 'Redis temizlendi!',
      deletedKeys: keys ? keys.length : 0
    });

  } catch (error) {
    console.error('Clear error:', error);
    return NextResponse.json({
      error: error.message
    }, { status: 500 });
  }
}
