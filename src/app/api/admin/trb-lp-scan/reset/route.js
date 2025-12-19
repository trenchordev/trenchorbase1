import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function POST() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('ADMIN_PASSWORD');

  if (adminAuth?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const fixedKeys = [
      'trb-lp-leaderboard:buys',
      'trb-lp-leaderboard:sells',
      'trb-lp-leaderboard:net',
      'trb-lp-leaderboard:buys:virtual',
      'trb-lp-leaderboard:sells:virtual',
      'trb-lp-leaderboard:net:virtual',
      'trb-lp-leaderboard:meta',
      'trb-lp-scan-job:trb',
    ];

    const [txCountKeys, seenKeys] = await Promise.all([
      redis.keys('trb-lp-leaderboard:txcount:*'),
      redis.keys('trb-lp:seen:*'),
    ]);

    const keysToDelete = [
      ...fixedKeys,
      ...(Array.isArray(txCountKeys) ? txCountKeys : []),
      ...(Array.isArray(seenKeys) ? seenKeys : []),
    ].filter(Boolean);

    if (keysToDelete.length > 0) {
      // Upstash supports variadic DEL
      await redis.del(...keysToDelete);
    }

    return NextResponse.json({
      ok: true,
      deleted: keysToDelete.length,
    });
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
}
