import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('ADMIN_PASSWORD');
  const adminSession = cookieStore.get('admin_session');
  
  const isAuthenticated = 
    adminAuth?.value === process.env.ADMIN_PASSWORD ||
    adminSession?.value === 'authenticated';
    
  return NextResponse.json({ authenticated: isAuthenticated });
}
