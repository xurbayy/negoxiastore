import { NextResponse } from 'next/server';
import { schemaReady } from './db';

// Auth Bearer untuk /api/bot/* - bandingkan constant-time-ish sederhana.
export function verifyBearer(request) {
  const expected = process.env.BOT_API_KEY;
  const got = request.headers.get('authorization') || '';
  if (!expected || got !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

export function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

// Pastikan skema sudah dibuat sebelum query pertama.
export async function ready() {
  await schemaReady();
}
