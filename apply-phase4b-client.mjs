#!/usr/bin/env node
// Deskly CLIENT Phase 4b: the bell updates within ~2 seconds (no more waiting for the next check)
// and Settings gets an "Email alerts" switch. Run from the client repo root:   node apply-phase4b-client.mjs          Undo:  node apply-phase4b-client.mjs --revert

import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.cwd();
const BACKUP = path.join(ROOT, '.phase4b-backup');
const MANIFEST = '.phase4b-created.json';
const abs = (p) => path.join(ROOT, p);
const exists = (p) => fs.existsSync(abs(p));
const read = (p) => fs.readFileSync(abs(p), 'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), s); };
const backup = (p) => { const d = path.join(BACKUP, p); if (exists(p) && !fs.existsSync(d)) { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(abs(p), d); } };
const created = [];
const warnings = [];
if (process.argv.includes('--revert')) {
  let n = 0;
  if (fs.existsSync(BACKUP)) (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) w(p); else { fs.copyFileSync(p, abs(path.relative(BACKUP, p))); n++; } } })(BACKUP);
  if (exists(MANIFEST)) { for (const rel of JSON.parse(read(MANIFEST))) if (exists(rel)) { fs.unlinkSync(abs(rel)); n++; } fs.unlinkSync(abs(MANIFEST)); }
  console.log(n ? `Phase 4b removed (${n} files restored/deleted).` : 'Nothing to revert.');
  process.exit(0);
}
function createFile(rel, content) {
  const had = exists(rel);
  if (had && read(rel) === content) return;
  if (!had) created.push(rel); else backup(rel);
  write(rel, content);
}
function edit(rel, label, from, to, doneMarker) {
  if (!exists(rel)) { warnings.push(`${rel} not found (${label})`); return; }
  const s = read(rel);
  if (s.includes(doneMarker)) return;
  if (!s.includes(from)) { warnings.push(`${rel}: could not find the place for "${label}". That part was skipped.`); return; }
  backup(rel); write(rel, s.replace(from, to));
}
function editRe(rel, label, re, to, doneMarker) {
  if (!exists(rel)) { warnings.push(`${rel} not found (${label})`); return; }
  const s = read(rel);
  if (s.includes(doneMarker)) return;
  if (!re.test(s)) { warnings.push(`${rel}: could not find the place for "${label}". That part was skipped.`); return; }
  backup(rel); write(rel, s.replace(re, to));
}

if (!exists('package.json') || !exists('components/NotificationBell.tsx') || !exists('lib/session.ts')) {
  console.error('Run this from the client repo root. It needs the notifications bell (apply-notifications-client.mjs).'); process.exit(1);
}

createFile("lib/realtime.ts", "import { getToken } from './session';\n\nconst BASE_URL = process.env.NEXT_PUBLIC_API_URL;\n\nexport const sleep = (ms: number, signal?: AbortSignal) =>\n  new Promise<void>((resolve) => {\n    const timer = setTimeout(resolve, ms);\n    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });\n  });\n\nasync function authed(path: string, init: RequestInit = {}) {\n  if (!BASE_URL) throw new Error('API URL not configured');\n  const token = getToken();\n  const res = await fetch(`${BASE_URL}${path}`, {\n    ...init,\n    headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>), ...(token ? { Authorization: `Bearer ${token}` } : {}) },\n    cache: 'no-store',\n  });\n  if (!res.ok) throw new Error(`Request failed (${res.status})`);\n  return res;\n}\n\n// Long poll: resolves as soon as the server has a notification newer than `after` (about 1-2 seconds),\n// or with changed:false after a few seconds, and the caller simply asks again.\nexport async function waitForChange(after: number, signal?: AbortSignal): Promise<{ changed: boolean; latest_id: number }> {\n  return (await authed(`/notifications/wait?after=${after}&timeout=8`, { signal })).json();\n}\n\nexport async function getEmailPreference(): Promise<boolean> {\n  return (await (await authed('/notifications/preferences')).json()).email_notifications;\n}\n\nexport async function setEmailPreference(value: boolean): Promise<boolean> {\n  const res = await authed('/notifications/preferences', { method: 'PATCH', body: JSON.stringify({ email_notifications: value }) });\n  return (await res.json()).email_notifications;\n}\n");
createFile("components/EmailPreference.tsx", "'use client';\nimport { useEffect, useState } from 'react';\nimport { useAuth } from '@/lib/auth-context';\nimport { useToast } from '@/components/Toast';\nimport { getEmailPreference, setEmailPreference } from '@/lib/realtime';\n\n// Settings card: should Deskly also EMAIL you about new tickets and @mentions? (staff only: customers get no such alerts)\nexport default function EmailPreference() {\n  const { user } = useAuth();\n  const { show } = useToast();\n  const isStaff = user?.role === 'admin' || user?.role === 'agent';\n  const [on, setOn] = useState<boolean | null>(null);\n  const [saving, setSaving] = useState(false);\n\n  useEffect(() => {\n    if (!isStaff) return;\n    let alive = true;\n    getEmailPreference()\n      .then((v) => alive && setOn(v))\n      .catch(() => alive && setOn(true));\n    return () => { alive = false; };\n  }, [isStaff]);\n\n  if (!isStaff) return null;\n\n  async function toggle() {\n    if (on === null || saving) return;\n    const next = !on;\n    setOn(next); // optimistic\n    setSaving(true);\n    try {\n      await setEmailPreference(next);\n      show(next ? 'Email alerts turned on' : 'Email alerts turned off');\n    } catch {\n      setOn(!next);\n      show('Could not save your choice', 'error');\n    } finally {\n      setSaving(false);\n    }\n  }\n\n  return (\n    <div className=\"rounded-xl border border-line bg-surface p-6\">\n      <div className=\"flex items-center justify-between gap-4\">\n        <div>\n          <h2 className=\"text-sm font-semibold text-navy\">Email alerts</h2>\n          <p className=\"mt-1 text-sm text-muted\">Email me when a new ticket arrives or someone @mentions me. The bell always works.</p>\n        </div>\n        <button\n          type=\"button\"\n          role=\"switch\"\n          aria-checked={on ?? false}\n          aria-label=\"Email alerts\"\n          disabled={on === null}\n          onClick={toggle}\n          className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:opacity-50 ${on ? 'border-brand-dark bg-brand' : 'border-line bg-navy/10'}`}\n        >\n          <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />\n        </button>\n      </div>\n    </div>\n  );\n}\n");
createFile("__tests__/realtime.test.tsx", "import { render, screen, fireEvent, waitFor } from '@testing-library/react';\nimport '@testing-library/jest-dom';\nimport EmailPreference from '@/components/EmailPreference';\n\nconst show = jest.fn();\nlet role: string | undefined = 'admin';\njest.mock('@/components/Toast', () => ({ useToast: () => ({ show }) }));\njest.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: role ? { id: 1, role, name: 'X' } : null }) }));\njest.mock('@/lib/realtime', () => ({\n  getEmailPreference: jest.fn(),\n  setEmailPreference: jest.fn(),\n  waitForChange: jest.fn(),\n  sleep: jest.fn(),\n}));\nimport { getEmailPreference, setEmailPreference } from '@/lib/realtime';\n\nbeforeEach(() => {\n  jest.clearAllMocks();\n  role = 'admin';\n  (getEmailPreference as jest.Mock).mockResolvedValue(true);\n  (setEmailPreference as jest.Mock).mockImplementation((v) => Promise.resolve(v));\n});\n\ndescribe('EmailPreference', () => {\n  test('shows the current choice and saves a change', async () => {\n    render(<EmailPreference />);\n    const sw = await screen.findByRole('switch', { name: 'Email alerts' });\n    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'));\n    fireEvent.click(sw);\n    await waitFor(() => expect(setEmailPreference).toHaveBeenCalledWith(false));\n    expect(sw).toHaveAttribute('aria-checked', 'false');\n    expect(show).toHaveBeenCalledWith('Email alerts turned off');\n  });\n\n  test('puts the switch back and says so when saving fails', async () => {\n    (setEmailPreference as jest.Mock).mockRejectedValue(new Error('x'));\n    render(<EmailPreference />);\n    const sw = await screen.findByRole('switch');\n    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'));\n    fireEvent.click(sw);\n    await waitFor(() => expect(show).toHaveBeenCalledWith('Could not save your choice', 'error'));\n    expect(sw).toHaveAttribute('aria-checked', 'true');\n  });\n\n  test('customers do not see it (and never call the API)', () => {\n    role = 'customer';\n    const { container } = render(<EmailPreference />);\n    expect(container).toBeEmptyDOMElement();\n    expect(getEmailPreference).not.toHaveBeenCalled();\n  });\n});\n");

const B = 'components/NotificationBell.tsx';
edit(B, 'import', "import { timeAgo } from '@/lib/time';", "import { timeAgo } from '@/lib/time';\nimport { sleep, waitForChange } from '@/lib/realtime';", "from '@/lib/realtime'");
edit(B, 'slower fallback check', 'const POLL_MS = 20000;', 'const POLL_MS = 60000; // fallback only: the live connection below does the real work', 'const POLL_MS = 60000');
edit(B, 'live updates', '  // close on outside click / Escape', `  // Live updates ("long poll"): the server answers as soon as something new arrives (about 1-2 seconds),
  // then we ask again. If the connection fails we back off and the 60-second check above still covers us.
  useEffect(() => {
    if (!isAdmin) return;
    const ctrl = new AbortController();
    let stopped = false;
    (async () => {
      let failures = 0;
      while (!stopped) {
        try {
          const before = lastId.current ?? 0;
          const res = await waitForChange(before, ctrl.signal);
          failures = 0;
          if (stopped) break;
          if (res.changed) {
            await load();
            if ((lastId.current ?? 0) <= before) await sleep(3000, ctrl.signal); // nothing moved: do not spin
          }
        } catch {
          if (stopped) break;
          failures++;
          await sleep(Math.min(30000, 2000 * 2 ** Math.min(failures, 4)), ctrl.signal);
        }
      }
    })();
    return () => {
      stopped = true;
      ctrl.abort();
    };
  }, [isAdmin, load]);

  // close on outside click / Escape`, 'waitForChange(before');

const S = 'app/settings/page.tsx';
if (exists(S)) {
  edit(S, 'import', "import Avatar from '@/components/Avatar';", "import Avatar from '@/components/Avatar';\nimport EmailPreference from '@/components/EmailPreference';", 'import EmailPreference');
  editRe(S, 'Email alerts card', /(\n[ \t]*)(<form onSubmit=\{savePassword\})/, '$1<EmailPreference />$1$2', '<EmailPreference />');
} else warnings.push('app/settings/page.tsx not found (run apply-phase2-client.mjs): the Email alerts switch was not added.');

if (created.length) write(MANIFEST, JSON.stringify(created, null, 2));
console.log('\nPhase 4b client done.');
if (warnings.length) { console.log('\nCheck these (skipped parts):'); warnings.forEach((w) => console.log(' - ' + w)); }
console.log('\nNext: refresh. The backend needs apply-phase4b-backend.mjs + npm run migration:run.');
console.log('Undo anytime:  node apply-phase4b-client.mjs --revert');
