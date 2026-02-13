import { NextResponse } from 'next/server';
import { list, put } from '@vercel/blob';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const SECTION_BLOB_PATHS = {
  duties: 'vic-duty-roster/duties.json',
  history: 'vic-duty-roster/history.json',
  faculty: 'vic-duty-roster/faculty.json'
} as const;
const LEGACY_BLOB_BACKUP_PATH = 'vic-duty-roster/backup.json';
type BackupSection = keyof typeof SECTION_BLOB_PATHS;
type BackupMeta = Partial<Record<BackupSection, string>>;
type BackupPayload = Partial<Record<BackupSection, unknown>>;
type SectionEnvelope = { updatedAt: string; data: unknown };

export const dynamic = 'force-dynamic';
const isBlobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const getEncryptionKey = () => process.env.BACKUP_ENCRYPTION_KEY || '';

const encryptSectionData = (value: unknown) => {
  const secret = getEncryptionKey();
  if (!secret) return { mode: 'plain' as const, payload: value };
  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const input = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    mode: 'enc' as const,
    payload: {
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: encrypted.toString('base64')
    }
  };
};

const decryptSectionData = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || !('mode' in value)) return value;
  const wrapped = value as { mode?: string; payload?: any };
  if (wrapped.mode !== 'enc') return wrapped.payload;
  const secret = getEncryptionKey();
  if (!secret) return undefined;
  const payload = wrapped.payload || {};
  if (!payload.iv || !payload.tag || !payload.data) return undefined;
  const key = createHash('sha256').update(secret).digest();
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const encrypted = Buffer.from(payload.data, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
};

const getBlobByPath = async (pathname: string) => {
  const result = await list({ prefix: pathname, limit: 10 });
  return result.blobs.find(blob => blob.pathname === pathname) || result.blobs[0];
};

const readBlobJson = async (pathname: string) => {
  try {
    const blob = await getBlobByPath(pathname);
    if (!blob) return { data: undefined, updatedAt: undefined };
    const response = await fetch(blob.url, { cache: 'no-store' });
    if (!response.ok) return { data: undefined, updatedAt: undefined };
    const raw = await response.json();
    if (raw && typeof raw === 'object' && 'data' in raw && 'updatedAt' in raw) {
      const envelope = raw as { data: unknown; updatedAt: string };
      return {
        data: decryptSectionData(envelope.data),
        updatedAt: envelope.updatedAt
      };
    }
    return { data: raw, updatedAt: blob.uploadedAt?.toISOString?.() };
  } catch {
    return { data: undefined, updatedAt: undefined };
  }
};

const writeBlobJson = async (pathname: string, envelope: SectionEnvelope) => {
  const encrypted = encryptSectionData(envelope.data);
  const payload = {
    updatedAt: envelope.updatedAt,
    data: encrypted
  };
  await put(pathname, JSON.stringify(payload), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json'
  });
};

export async function GET() {
  try {
    if (!isBlobConfigured()) {
      return NextResponse.json({ error: 'Blob not configured' }, { status: 404 });
    }

    const [duties, history, faculty] = await Promise.all([
      readBlobJson(SECTION_BLOB_PATHS.duties),
      readBlobJson(SECTION_BLOB_PATHS.history),
      readBlobJson(SECTION_BLOB_PATHS.faculty)
    ]);

    if (duties.data === undefined && history.data === undefined && faculty.data === undefined) {
      const legacy = await readBlobJson(LEGACY_BLOB_BACKUP_PATH);
      if (legacy.data === undefined) {
        return NextResponse.json({ error: 'No backup found' }, { status: 404 });
      }
      return NextResponse.json(legacy.data);
    }

    const payload: BackupPayload = {};
    const meta: BackupMeta = {};
    if (duties.data !== undefined) {
      payload.duties = duties.data;
      if (duties.updatedAt) meta.duties = duties.updatedAt;
    }
    if (history.data !== undefined) {
      payload.history = history.data;
      if (history.updatedAt) meta.history = history.updatedAt;
    }
    if (faculty.data !== undefined) {
      payload.faculty = faculty.data;
      if (faculty.updatedAt) meta.faculty = faculty.updatedAt;
    }
    if (Object.keys(meta).length) {
      (payload as any)._meta = meta;
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Blob backup read failed:', error);
    return NextResponse.json({ error: 'Blob backup read failed' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    if (!isBlobConfigured()) {
      return NextResponse.json({ ok: true, skipped: 'blob_not_configured' });
    }

    const payload = (await request.json()) as BackupPayload & { _meta?: BackupMeta };
    const meta = payload._meta || {};
    const updates: Promise<void>[] = [];
    const updatedSections: BackupSection[] = [];
    const now = new Date().toISOString();

    if ('duties' in payload) {
      updates.push(writeBlobJson(SECTION_BLOB_PATHS.duties, {
        updatedAt: meta.duties || now,
        data: payload.duties
      }));
      updatedSections.push('duties');
    }
    if ('history' in payload) {
      updates.push(writeBlobJson(SECTION_BLOB_PATHS.history, {
        updatedAt: meta.history || now,
        data: payload.history
      }));
      updatedSections.push('history');
    }
    if ('faculty' in payload) {
      updates.push(writeBlobJson(SECTION_BLOB_PATHS.faculty, {
        updatedAt: meta.faculty || now,
        data: payload.faculty
      }));
      updatedSections.push('faculty');
    }

    if (!updates.length) {
      return NextResponse.json({ error: 'No backup section provided' }, { status: 400 });
    }

    await Promise.all(updates);

    return NextResponse.json({ ok: true, updatedSections });
  } catch (error) {
    console.error('Blob backup write failed:', error);
    return NextResponse.json({ error: 'Blob backup write failed' }, { status: 500 });
  }
}
