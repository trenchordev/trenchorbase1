import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { resumeTrbLpJob } from '@/lib/trbLpScanJobManager';

export async function POST() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('ADMIN_PASSWORD');

  if (adminAuth?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const job = await resumeTrbLpJob();
    return NextResponse.json({ ok: true, job });
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
}
