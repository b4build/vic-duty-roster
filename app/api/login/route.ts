import { NextResponse } from 'next/server';
import { AUTH_COOKIE, createAuthToken } from '@/lib/auth';

export async function POST(req: Request) {
  const { password } = await req.json();
  const adminPass = process.env.VIC_ADMIN_PASSWORD;
  const authSecret = process.env.AUTH_SECRET;

  if (!adminPass || !authSecret) {
    return NextResponse.json({ error: 'Server not configured.' }, { status: 500 });
  }

  if (password !== adminPass) {
    return NextResponse.json({ error: 'Invalid password.' }, { status: 401 });
  }

  const token = await createAuthToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7
  });
  return res;
}
