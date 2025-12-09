/**
 * Resume Auto Tax Scan
 * Resumes a stopped background scan job
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { resumeJob } from '@/lib/taxScanJobManager';
import { redis } from '@/lib/redis';

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const adminAuth = cookieStore.get('ADMIN_PASSWORD');

    if (adminAuth?.value !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { campaignId } = body;

    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
    }

    const job = await resumeJob(campaignId);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.error) {
      return NextResponse.json({ error: job.error }, { status: 400 });
    }

    // Update campaign config
    const config = await redis.get(`tax-campaign-config:${campaignId}`);
    if (config) {
      await redis.set(`tax-campaign-config:${campaignId}`, {
        ...config,
        autoScanEnabled: true,
        autoScanResumedAt: Date.now(),
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Auto-scan resumed',
      job
    });

  } catch (error) {
    console.error('[Resume-Scan] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
