import { NextResponse } from 'next/server';
import { list, put } from '@vercel/blob';

const BLOB_BACKUP_PATH = 'vic-duty-roster/backup.json';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await list({ prefix: BLOB_BACKUP_PATH, limit: 10 });
    const backupBlob =
      result.blobs.find(blob => blob.pathname === BLOB_BACKUP_PATH) || result.blobs[0];

    if (!backupBlob) {
      return NextResponse.json({ error: 'No backup found' }, { status: 404 });
    }

    const response = await fetch(backupBlob.url, { cache: 'no-store' });
    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to read backup blob' }, { status: 500 });
    }

    const payload = await response.json();
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Blob backup read failed:', error);
    return NextResponse.json({ error: 'Blob backup read failed' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const payload = await request.json();
    await put(BLOB_BACKUP_PATH, JSON.stringify(payload), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json'
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Blob backup write failed:', error);
    return NextResponse.json({ error: 'Blob backup write failed' }, { status: 500 });
  }
}
