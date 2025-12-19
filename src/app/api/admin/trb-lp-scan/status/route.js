import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getTrbLpJob } from '@/lib/trbLpScanJobManager';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('ADMIN_PASSWORD');

  if (adminAuth?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [job, meta] = await Promise.all([
      getTrbLpJob(),
      redis.hgetall('trb-lp-leaderboard:meta'),
    ]);

    return NextResponse.json({ ok: true, job, meta: meta || {} });
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
}
