export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB per file
export const MAX_FILES_PER_TICKET = 10;
export const MAX_TOTAL_BYTES = 10 * 1024 * 1024; // 10 MB per ticket

const startsWith = (b: Buffer, bytes: number[], at = 0) => bytes.every((v, i) => b[at + i] === v);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

// Allowed types. Where possible the file's first bytes must match too, so a renamed .exe cannot pass as a .png.
// SVG is deliberately NOT allowed (it can carry scripts).
const SIGNATURES: Record<string, ((b: Buffer) => boolean) | null> = {
  'image/png': (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  'image/gif': (b) => startsWith(b, ascii('GIF87a')) || startsWith(b, ascii('GIF89a')),
  'image/webp': (b) => startsWith(b, ascii('RIFF')) && startsWith(b, ascii('WEBP'), 8),
  'application/pdf': (b) => startsWith(b, ascii('%PDF-')),
  'text/plain': null,
  'text/csv': null,
};

export type UploadCheck = { ok: true; mime: string } | { ok: false; reason: string };

function resolveMime(file: UploadedFileLike): string {
  const declared = (file.mimetype || '').toLowerCase().split(';')[0].trim();
  // Windows reports .csv files as application/vnd.ms-excel
  if (/\.csv$/i.test(file.originalname) && ['application/vnd.ms-excel', 'application/csv', 'text/csv'].includes(declared)) {
    return 'text/csv';
  }
  return declared;
}

export function validateUpload(file: UploadedFileLike): UploadCheck {
  if (!file.buffer || file.size <= 0) return { ok: false, reason: 'The file is empty' };
  if (file.size > MAX_FILE_BYTES) return { ok: false, reason: 'The file is larger than 2 MB' };

  const mime = resolveMime(file);
  if (!(mime in SIGNATURES)) {
    return { ok: false, reason: 'This file type is not allowed. Use an image (PNG, JPG, GIF, WebP), PDF, TXT or CSV' };
  }
  const sig = SIGNATURES[mime];
  if (sig && !sig(file.buffer)) return { ok: false, reason: 'The file content does not match its type' };
  if (!sig && file.buffer.subarray(0, 8000).includes(0)) {
    return { ok: false, reason: 'The file content does not match its type' }; // "text" with binary bytes
  }
  return { ok: true, mime };
}

// Keeps only a safe display name: no folders, no control or special characters, limited length, extension kept.
export function sanitizeFilename(original: string): string {
  const base = (original || '').split(/[\\/]/).pop() ?? '';
  let name = base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');
  if (name.length > 120) {
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : '';
    name = name.slice(0, 120 - ext.length) + ext;
  }
  return name || 'file';
}
