import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('ADMIN_PASSWORD');
  const isAuthenticated = adminAuth?.value === process.env.ADMIN_PASSWORD;
  return NextResponse.json({ authenticated: isAuthenticated });
}
