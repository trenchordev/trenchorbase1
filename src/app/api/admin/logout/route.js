import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'ADMIN_PASSWORD';

export async function POST() {
  const response = NextResponse.json({ success: true });
  const cookieStore = await cookies();
  
  // Clear ADMIN_PASSWORD cookie
  cookieStore.set({
    name: 'ADMIN_PASSWORD',
    value: '',
    expires: new Date(0),
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  
  // Clear admin_session cookie
  cookieStore.set({
    name: 'admin_session',
    value: '',
    expires: new Date(0),
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  
  return response;
}
