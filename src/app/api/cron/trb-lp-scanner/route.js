/**
 * TRB LP-like Contract Scanner (External cron-job friendly)
 *
 * Scans TRB Transfer events and classifies buy/sell based on whether
 * the transfer is between the LP-like contract and an EOA.
 */

import { NextResponse } from 'next/server';
import { runTrbLpScanOnce } from '@/lib/trbLpScanner';

export const dynamic = 'force-dynamic';
export const maxDuration = 10; // keep Hobby-safe

function getCronSecretFromRequest(request) {
  const auth = request.headers.get('authorization');
  const xSecret = request.headers.get('x-cron-secret');
  const url = new URL(request.url);
  const qs = url.searchParams.get('secret');

  if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length);
  return xSecret || qs || '';
}

function verifyCronSecret(request) {
  const cronSecret = process.env.CRON_SECRET;

  // If no secret set, allow in development.
  if (!cronSecret) {
    console.warn('[TRB Cron] CRON_SECRET not set, allowing request (dev mode)');
    return true;
  }

  const provided = getCronSecretFromRequest(request);
  if (provided && provided === cronSecret) return true;

  console.error('[TRB Cron] Unauthorized request');
  return false;
}

export async function GET(request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runTrbLpScanOnce({ timeBudgetMs: 9000 });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[TRB Cron] Error:', err);
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
}
