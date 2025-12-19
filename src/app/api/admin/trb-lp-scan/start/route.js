import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createTrbLpJob } from '@/lib/trbLpScanJobManager';

export async function POST(request) {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('ADMIN_PASSWORD');

  if (adminAuth?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const startBlock = body?.startBlock;
    const endBlock = body?.endBlock;
    const blocksPerScan = body?.blocksPerScan;

    if (startBlock === undefined || startBlock === null || startBlock === '') {
      return NextResponse.json({ error: 'startBlock is required' }, { status: 400 });
    }

    const job = await createTrbLpJob({ startBlock, endBlock, blocksPerScan });
    return NextResponse.json({ ok: true, job });
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
}
