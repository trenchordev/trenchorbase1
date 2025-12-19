/**
 * Get Auto Scan Job Status
 * Returns detailed status and statistics for a scan job
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getJobStats, getActiveJobs } from '@/lib/taxScanJobManager';

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const adminAuth = cookieStore.get('ADMIN_PASSWORD');

    if (adminAuth?.value !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('campaignId');

    if (campaignId) {
      // Get specific job status
      const jobStats = await getJobStats(campaignId);

      if (!jobStats) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      return NextResponse.json(jobStats);
    } else {
      // Get all active jobs
      const activeJobs = await getActiveJobs();
      
      const jobsWithStats = [];
      for (const job of activeJobs) {
        const stats = await getJobStats(job.campaignId);
        if (stats) {
          jobsWithStats.push(stats);
        }
      }

      return NextResponse.json({
        activeJobsCount: jobsWithStats.length,
        jobs: jobsWithStats
      });
    }

  } catch (error) {
    console.error('[Job-Status] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
