import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { password } = await req.json() as { password: string };
  const correct = process.env.DASHBOARD_PASSWORD;

  if (correct && password !== correct) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('uxgsol_auth', '1', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });
  return res;
}
