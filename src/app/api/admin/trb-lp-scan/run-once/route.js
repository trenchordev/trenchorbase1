import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { runTrbLpScanOnce } from '@/lib/trbLpScanner';

export const maxDuration = 10;

export async function POST() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('ADMIN_PASSWORD');

  if (adminAuth?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runTrbLpScanOnce({ timeBudgetMs: 9000 });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
}
