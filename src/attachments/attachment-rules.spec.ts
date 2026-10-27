import { validateUpload, sanitizeFilename, MAX_FILE_BYTES } from './attachment-rules';

const file = (name: string, mime: string, bytes: Buffer) => ({ originalname: name, mimetype: mime, size: bytes.length, buffer: bytes });
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe('validateUpload', () => {
  it('accepts real images and documents', () => {
    expect(validateUpload(file('a.png', 'image/png', PNG))).toEqual({ ok: true, mime: 'image/png' });
    expect(validateUpload(file('a.jpg', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]))).ok).toBe(true);
    expect(validateUpload(file('a.gif', 'image/gif', Buffer.from('GIF89a....'))).ok).toBe(true);
    expect(validateUpload(file('a.webp', 'image/webp', Buffer.from('RIFF....WEBPVP8 '))).ok).toBe(true);
    expect(validateUpload(file('a.pdf', 'application/pdf', Buffer.from('%PDF-1.7 ...'))).ok).toBe(true);
    expect(validateUpload(file('notes.txt', 'text/plain', Buffer.from('hello world'))).ok).toBe(true);
  });

  it('treats a Windows-style .csv as csv', () => {
    expect(validateUpload(file('data.csv', 'application/vnd.ms-excel', Buffer.from('a,b\n1,2')))).toEqual({ ok: true, mime: 'text/csv' });
  });

  it('rejects a file whose content does not match its declared type', () => {
    expect(validateUpload(file('evil.png', 'image/png', Buffer.from('MZ\x90\x00 this is an exe'))).ok).toBe(false);
    expect(validateUpload(file('x.pdf', 'application/pdf', Buffer.from('not a pdf'))).ok).toBe(false);
    expect(validateUpload(file('x.txt', 'text/plain', Buffer.from([0x68, 0x69, 0x00, 0x01]))).ok).toBe(false); // binary pretending to be text
  });

  it('rejects types that are not on the list (SVG, HTML, scripts, executables)', () => {
    for (const [n, m] of [['a.svg', 'image/svg+xml'], ['a.html', 'text/html'], ['a.js', 'application/javascript'], ['a.exe', 'application/x-msdownload'], ['a.zip', 'application/zip']]) {
      expect(validateUpload(file(n, m, Buffer.from('<svg onload=alert(1)>'))).ok).toBe(false);
    }
  });

  it('rejects empty and oversized files', () => {
    expect(validateUpload(file('a.txt', 'text/plain', Buffer.alloc(0))).ok).toBe(false);
    const big = file('a.txt', 'text/plain', Buffer.alloc(10));
    big.size = MAX_FILE_BYTES + 1;
    expect(validateUpload(big)).toEqual({ ok: false, reason: 'The file is larger than 2 MB' });
  });
});

describe('sanitizeFilename', () => {
  it('drops folders and special characters', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\me\\report<1>.pdf')).toBe('report1.pdf');
    expect(sanitizeFilename('  my   file ?.png ')).toBe('my file .png');
    expect(sanitizeFilename('bad\u0000name\r\n.txt')).toBe('badname.txt');
  });
  it('never returns an empty or hidden name', () => {
    expect(sanitizeFilename('')).toBe('file');
    expect(sanitizeFilename('....')).toBe('file');
    expect(sanitizeFilename('.env')).toBe('env');
  });
  it('shortens very long names but keeps the extension', () => {
    const out = sanitizeFilename('a'.repeat(300) + '.png');
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out.endsWith('.png')).toBe(true);
  });
});
