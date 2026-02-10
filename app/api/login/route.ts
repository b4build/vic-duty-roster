import { NextResponse } from 'next/server';

const AUTH_COOKIE = 'vic_auth';

export async function POST(req: Request) {
  const { password } = await req.json();
  const adminPass = process.env.VIC_ADMIN_PASSWORD;

  if (!adminPass) {
    return NextResponse.json({ error: 'Server not configured.' }, { status: 500 });
  }

  if (password !== adminPass) {
    return NextResponse.json({ error: 'Invalid password.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, 'ok', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });
  return res;
}
