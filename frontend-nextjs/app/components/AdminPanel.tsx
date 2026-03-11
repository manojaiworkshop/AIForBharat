'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';

const API =
  process.env.NEXT_PUBLIC_API_URL?.replace('/chat', '') ??
  'https://sleocl2mk5.execute-api.eu-north-1.amazonaws.com/Prod';

const AGENT_API =
  process.env.NEXT_PUBLIC_AGENT_REPO_URL ??
  'https://wszjxhysdh.execute-api.eu-north-1.amazonaws.com/Prod';

// ── Types ─────────────────────────────────────────────────────
interface AdminUser {
  user_id: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  created_at?: string;
}

interface AdminConnection {
  connection_id: string;
  type: string;
  name: string;
  host: string;
  port: string;
  database: string;
  username: string;
  has_password: boolean;
  created_at?: string;
}

type Section = 'users' | 'postgres' | 'neo4j' | 'llm' | 'agents' | 'qdrant' | 'redis' | 'agent-permissions';

// ── Shared UI primitives ──────────────────────────────────────
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: color + '22', color }}
    >
      {label}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  return <Badge label={role} color={role === 'superadmin' ? '#f59e0b' : '#6b7280'} />;
}

function PlanBadge({ plan }: { plan: string }) {
  const c: Record<string, string> = { unlimited: '#10b981', pro: '#3b82f6', free: '#6b7280' };
  return <Badge label={plan} color={c[plan] ?? '#6b7280'} />;
}

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
    >
      <div
        className={`w-full ${wide ? 'max-w-lg' : 'max-w-md'} rounded-2xl shadow-2xl flex flex-col`}
        style={{ background: 'var(--main-bg)', border: '1px solid var(--border)', maxHeight: '90vh' }}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 pb-6 space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]';
const inputStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
};

function Input({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <Field label={label}>
      <input {...props} className={inputCls} style={inputStyle} />
    </Field>
  );
}

function Select({ label, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <Field label={label}>
      <select {...props} className={inputCls} style={inputStyle}>
        {children}
      </select>
    </Field>
  );
}

function Btn({
  variant = 'primary',
  loading,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger'; loading?: boolean }) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--accent)', color: '#fff' },
    ghost: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' },
    danger: { background: '#ef4444', color: '#fff' },
  };
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-50"
      style={styles[variant]}
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
}

// ── Admin Sidebar ──────────────────────────────────────────────
const NAV: { id: Section; label: string; icon: React.ReactNode }[] = [
  {
    id: 'users',
    label: 'Users',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    id: 'postgres',
    label: 'PostgreSQL',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
  },
  {
    id: 'neo4j',
    label: 'Neo4j',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="5" cy="12" r="2" />
        <circle cx="19" cy="5" r="2" />
        <circle cx="19" cy="19" r="2" />
        <line x1="7" y1="11" x2="17" y2="6" />
        <line x1="7" y1="13" x2="17" y2="18" />
        <line x1="19" y1="7" x2="19" y2="17" />
      </svg>
    ),
  },
  {
    id: 'llm',
    label: 'LLM Settings',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2a7 7 0 017 7c0 3-1.5 5.5-4 6.7V18a1 1 0 01-1 1h-4a1 1 0 01-1-1v-2.3C6.5 14.5 5 12 5 9a7 7 0 017-7z" />
        <line x1="9" y1="21" x2="15" y2="21" />
      </svg>
    ),
  },
  {
    id: 'agents',
    label: 'SQL Agents',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="12 2 2 7 12 12 22 7 12 2"/>
        <polyline points="2 17 12 22 22 17"/>
        <polyline points="2 12 12 17 22 12"/>
      </svg>
    ),
  },
  {
    id: 'qdrant',
    label: 'Qdrant Vector DB',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
    ),
  },
  {
    id: 'redis' as Section,
    label: 'Redis',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <ellipse cx="12" cy="8" rx="9" ry="3"/>
        <path d="M3 8v4c0 1.66 4 3 9 3s9-1.34 9-3V8"/>
        <path d="M3 12v4c0 1.66 4 3 9 3s9-1.34 9-3v-4"/>
      </svg>
    ),
  },
  {
    id: 'agent-permissions' as Section,
    label: 'Agent Access',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0110 0v4"/>
      </svg>
    ),
  },
];

function AdminSidebar({ active, onSelect, userCount }: { active: Section; onSelect: (s: Section) => void; userCount: number }) {
  const router = useRouter();
  return (
    <aside
      className="flex flex-col h-full w-56 flex-shrink-0"
      style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={() => router.push('/')}
          className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)]"
          style={{ color: 'var(--text-muted)' }}
          title="Back to app"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--accent)', flexShrink: 0 }}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>Admin Panel</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all"
              style={{
                background: isActive ? 'var(--accent)1a' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: isActive ? 600 : 400,
                borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--surface-hover)'; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
              {item.icon}
              <span className="flex-1 text-left">{item.label}</span>
              {item.id === 'users' && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{
                    background: isActive ? 'var(--accent)33' : 'var(--main-bg)',
                    color: isActive ? 'var(--accent)' : 'var(--text-faint)',
                  }}
                >
                  {userCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
        <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Mercury Grid Admin</p>
      </div>
    </aside>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION: USERS
// ═══════════════════════════════════════════════════════════════

function AddUserModal({ token, onClose, onCreated }: { token: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user', plan: 'free' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setSaving(true); setErr('');
    const res = await fetch(`${API}/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setErr(data.error || 'Failed'); return; }
    onCreated();
  }

  return (
    <Modal title="Add new user" onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Full name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Jane Doe" />
          <Input label="Email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="jane@example.com" />
        </div>
        <Input label="Password" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Min. 8 characters" />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Role" value={form.role} onChange={(e) => set('role', e.target.value)}>
            <option value="user">User</option>
            <option value="superadmin">Superadmin</option>
          </Select>
          <Select label="Plan" value={form.plan} onChange={(e) => set('plan', e.target.value)}>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="unlimited">Unlimited</option>
          </Select>
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn loading={saving} onClick={submit}>Create user</Btn>
        </div>
      </div>
    </Modal>
  );
}

function EditUserModal({ user: u, token, onClose, onSaved }: { user: AdminUser; token: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(u.name);
  const [plan, setPlan] = useState(u.plan);
  const [role, setRole] = useState(u.role);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setSaving(true); setErr('');
    const res = await fetch(`${API}/admin/users/${u.user_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, plan, role }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setErr(data.error || 'Failed'); return; }
    onSaved();
  }

  return (
    <Modal title={`Edit — ${u.email}`} onClose={onClose} wide>
      <div className="space-y-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Email (read-only)">
          <input readOnly value={u.email} className={inputCls} style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="user">User</option>
            <option value="superadmin">Superadmin</option>
          </Select>
          <Select label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="unlimited">Unlimited</option>
          </Select>
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn loading={saving} onClick={save}>Save changes</Btn>
        </div>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ user: u, token, onClose }: { user: AdminUser; token: string; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);

  async function reset() {
    if (password.length < 8) { setErr('Min. 8 characters'); return; }
    if (password !== confirm) { setErr('Passwords do not match'); return; }
    setSaving(true); setErr('');
    const res = await fetch(`${API}/admin/users/${u.user_id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ new_password: password }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setErr(data.error || 'Failed'); return; }
    setOk(true);
    setTimeout(onClose, 1000);
  }

  return (
    <Modal title={`Reset password — ${u.name}`} onClose={onClose}>
      {ok ? (
        <p className="text-sm text-green-400 py-2 text-center">Password updated!</p>
      ) : (
        <div className="space-y-3">
          <Input label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" />
          <Input label="Confirm password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {err && <p className="text-xs text-red-400">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn loading={saving} onClick={reset}>Reset password</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

function DeleteUserDialog({ user: u, token, onClose, onDeleted }: { user: AdminUser; token: string; onClose: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');

  async function del() {
    setDeleting(true); setErr('');
    const res = await fetch(`${API}/admin/users/${u.user_id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setDeleting(false);
    if (!res.ok) { setErr(data.error || 'Failed'); return; }
    onDeleted();
  }

  return (
    <Modal title="Delete user" onClose={onClose}>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Delete <strong style={{ color: 'var(--text)' }}>{u.email}</strong>? This cannot be undone.
      </p>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="danger" loading={deleting} onClick={del}>Delete</Btn>
      </div>
    </Modal>
  );
}

function ChangeOwnPasswordSection({ token }: { token: string }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (form.next.length < 8) { setErr('Min. 8 characters'); return; }
    if (form.next !== form.confirm) { setErr('Passwords do not match'); return; }
    setSaving(true); setErr(''); setOk(false);
    const res = await fetch(`${API}/admin/me/change-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ current_password: form.current, new_password: form.next }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setErr(data.error || 'Failed'); return; }
    setOk(true);
    setForm({ current: '', next: '', confirm: '' });
  }

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <h4 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Change my password</h4>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="Current password" type="password" value={form.current} onChange={(e) => set('current', e.target.value)} />
        <Input label="New password" type="password" value={form.next} onChange={(e) => set('next', e.target.value)} placeholder="Min. 8 chars" />
        <Input label="Confirm new" type="password" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} />
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      {ok && <p className="text-xs text-green-400">Password changed!</p>}
      <div className="flex justify-end">
        <Btn loading={saving} onClick={save}>Update password</Btn>
      </div>
    </div>
  );
}

function UsersSection({ token, currentUserId, onCountChange }: { token: string; currentUserId: string; onCountChange: (n: number) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res = await fetch(`${API}/admin/users`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      const list = data.users ?? [];
      setUsers(list);
      onCountChange(list.length);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [token, onCountChange]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="relative">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email…"
              className="pl-8 pr-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] w-64"
              style={inputStyle}
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchUsers} className="p-2 rounded-lg hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-muted)' }} title="Refresh">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0020.49 15"/></svg>
            </button>
            <Btn onClick={() => setShowAdd(true)}>
              <span className="flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add user
              </span>
            </Btn>
          </div>
        </div>

        {/* Change own password */}
        <ChangeOwnPasswordSection token={token} />

        {err && <div className="rounded-lg px-4 py-3 text-sm text-red-400" style={{ background: '#ef444422', border: '1px solid #ef444444' }}>{err}</div>}

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div
              className="grid gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wider"
              style={{ gridTemplateColumns: '1fr 110px 90px 90px 100px', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' }}
            >
              <div>User</div><div>Role</div><div>Plan</div><div>Joined</div><div className="text-right">Actions</div>
            </div>

            {filtered.length === 0 && (
              <p className="px-4 py-6 text-sm text-center" style={{ color: 'var(--text-faint)' }}>No users found</p>
            )}

            {filtered.map((u, i) => (
              <div
                key={u.user_id}
                className="grid gap-2 items-center px-4 py-3 transition-colors hover:bg-[var(--surface-hover)]"
                style={{ gridTemplateColumns: '1fr 110px 90px 90px 100px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, var(--accent), #1a7ab8)' }}>
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{u.name}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-faint)' }}>{u.email}</p>
                  </div>
                </div>
                <div><RoleBadge role={u.role} /></div>
                <div><PlanBadge plan={u.plan} /></div>
                <div className="text-xs" style={{ color: 'var(--text-faint)' }}>
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                </div>
                <div className="flex items-center justify-end gap-1">
                  <button onClick={() => setEditUser(u)} className="p-1.5 rounded-lg hover:bg-[var(--main-bg)]" style={{ color: 'var(--text-muted)' }} title="Edit">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button onClick={() => setResetUser(u)} className="p-1.5 rounded-lg hover:bg-[var(--main-bg)]" style={{ color: 'var(--text-muted)' }} title="Reset password">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  </button>
                  <button
                    onClick={() => currentUserId !== u.user_id && setDeleteUser(u)}
                    disabled={currentUserId === u.user_id}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ color: currentUserId === u.user_id ? 'var(--text-faint)' : '#ef4444' }}
                    title={currentUserId === u.user_id ? "Can't delete yourself" : 'Delete'}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && <AddUserModal token={token} onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); fetchUsers(); }} />}
      {editUser && <EditUserModal user={editUser} token={token} onClose={() => setEditUser(null)} onSaved={() => { setEditUser(null); fetchUsers(); }} />}
      {resetUser && <ResetPasswordModal user={resetUser} token={token} onClose={() => setResetUser(null)} />}
      {deleteUser && <DeleteUserDialog user={deleteUser} token={token} onClose={() => setDeleteUser(null)} onDeleted={() => { setDeleteUser(null); fetchUsers(); }} />}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION: SQL AGENTS
// ═══════════════════════════════════════════════════════════════

interface AgentRecord {
  agent_id: string;
  agent_name: string;
  status: 'initializing' | 'ready' | 'error';
  created_at?: string;
  updated_at?: string;
  ontology_s3_uri?: string;
  neo4j_db_name?: string;
  table_count?: number;
  selected_tables?: Array<{ tableName?: string; table_name?: string; source?: string; sourceName?: string }>;
  connection_info?: Record<string, string>;
  error_message?: string;
  owner_id?: string;
}

function AgentStatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    ready:        ['#10b981', 'Ready'],
    initializing: ['#3b82f6', 'Initializing'],
    error:        ['#ef4444', 'Error'],
  };
  const [color, label] = map[status] ?? ['#6b7280', status];
  return <Badge label={label} color={color} />;
}

function AgentDetailModal({ agent, onClose }: { agent: AgentRecord; onClose: () => void }) {
  const [ontology, setOntology] = useState<string | null>(null);
  const [loadingOntology, setLoadingOntology] = useState(false);

  async function fetchOntology() {
    setLoadingOntology(true);
    try {
      const res = await fetch(`${AGENT_API}/agents/${agent.agent_id}/ontology`);
      const data = await res.json();
      setOntology(data.ontology_yaml || 'No ontology available');
    } catch {
      setOntology('Failed to load ontology');
    }
    setLoadingOntology(false);
  }

  const tables = agent.selected_tables || [];
  const connInfo = agent.connection_info || {};

  return (
    <Modal title={`Agent: ${agent.agent_name}`} onClose={onClose} wide>
      <div className="space-y-4">
        {/* Status + metadata */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg p-3 space-y-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Status</p>
            <AgentStatusBadge status={agent.status} />
          </div>
          <div className="rounded-lg p-3 space-y-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Tables</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{agent.table_count ?? tables.length}</p>
          </div>
          <div className="rounded-lg p-3 space-y-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Source</p>
            <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>
              {connInfo.source_type === 'csv' ? '📄 CSV' : connInfo.source_type === 'database' ? `🗄️ ${connInfo.connectionName || 'Database'}` : '—'}
            </p>
          </div>
          <div className="rounded-lg p-3 space-y-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Created</p>
            <p className="text-xs" style={{ color: 'var(--text)' }}>{agent.created_at ? new Date(agent.created_at).toLocaleString() : '—'}</p>
          </div>
        </div>

        {/* Tables list */}
        {tables.length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>INCLUDED TABLES</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {tables.map((t, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: t.source === 'csv' ? '#10b98120' : '#3b82f620', color: t.source === 'csv' ? '#10b981' : '#3b82f6' }}>
                    {t.source === 'csv' ? 'CSV' : 'DB'}
                  </span>
                  <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>{t.tableName || t.table_name}</span>
                  {t.sourceName && <span className="text-xs ml-auto" style={{ color: 'var(--text-faint)' }}>{t.sourceName}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* S3 URI */}
        {agent.ontology_s3_uri && agent.ontology_s3_uri !== 'memory' && (
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>ONTOLOGY S3 URI</p>
            <p className="text-xs font-mono truncate" style={{ color: 'var(--text-faint)' }}>{agent.ontology_s3_uri}</p>
          </div>
        )}

        {/* Error */}
        {agent.status === 'error' && agent.error_message && (
          <div className="rounded-lg px-3 py-2 text-xs" style={{ background: '#ef444415', border: '1px solid #ef444440', color: '#ef4444' }}>
            {agent.error_message}
          </div>
        )}

        {/* Ontology */}
        <div>
          {ontology ? (
            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>ONTOLOGY YAML</p>
              <pre className="text-xs rounded-lg p-3 overflow-auto max-h-56" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{ontology}</pre>
            </div>
          ) : (
            agent.status === 'ready' && (
              <Btn variant="ghost" loading={loadingOntology} onClick={fetchOntology}>
                View Ontology YAML
              </Btn>
            )
          )}
        </div>

        <div className="flex justify-end pt-1">
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
        </div>
      </div>
    </Modal>
  );
}

function EditAgentModal({ agent, onClose, onSaved }: { agent: AgentRecord; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(agent.agent_name);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!name.trim()) return;
    setSaving(true); setErr('');
    try {
      const res = await fetch(`${AGENT_API}/agents/${agent.agent_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || 'Failed'); return; }
      onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit Agent" onClose={onClose}>
      <div className="space-y-3">
        <Input label="Agent Name" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} autoFocus />
        {err && <p className="text-xs text-red-400">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn loading={saving} onClick={save}>Save</Btn>
        </div>
      </div>
    </Modal>
  );
}

function DeleteAgentDialog({ agent, onClose, onDeleted }: { agent: AgentRecord; onClose: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');

  async function del() {
    setDeleting(true); setErr('');
    try {
      const res = await fetch(`${AGENT_API}/agents/${agent.agent_id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || 'Failed'); return; }
      onDeleted();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal title="Delete Agent" onClose={onClose}>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Delete <strong style={{ color: 'var(--text)' }}>{agent.agent_name}</strong>? This will also remove its ontology from S3.
      </p>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="danger" loading={deleting} onClick={del}>Delete</Btn>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Ontology Editor Drawer
// ─────────────────────────────────────────────────────────────
function OntologyEditorDrawer({ agent, onClose }: { agent: AgentRecord; onClose: () => void }) {
  const [yaml, setYaml] = useState('');
  const [origYaml, setOrigYaml] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [err, setErr] = useState('');

  // search/replace
  const [searchOpen, setSearchOpen] = useState(false);
  const [findVal, setFindVal] = useState('');
  const [replaceVal, setReplaceVal] = useState('');
  const [matchIdx, setMatchIdx] = useState(-1);
  const [matchCount, setMatchCount] = useState(0);
  const [matchCase, setMatchCase] = useState(false);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const lnRef = useRef<HTMLDivElement>(null);
  const findRef = useRef<HTMLInputElement>(null);

  // load
  useEffect(() => {
    (async () => {
      setLoading(true); setErr('');
      try {
        const res = await fetch(`${AGENT_API}/agents/${agent.agent_id}/ontology`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        setYaml(data.ontology_yaml || '');
        setOrigYaml(data.ontology_yaml || '');
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Error loading ontology');
      } finally {
        setLoading(false);
      }
    })();
  }, [agent.agent_id]);

  // sync line numbers on scroll
  const syncScroll = () => {
    if (taRef.current && lnRef.current) {
      lnRef.current.scrollTop = taRef.current.scrollTop;
    }
  };

  const lines = yaml.split('\n');
  const lineCount = Math.max(lines.length, 1);

  // search helpers
  const allMatches = useCallback((text: string, query: string): number[] => {
    if (!query) return [];
    const positions: number[] = [];
    const haystack = matchCase ? text : text.toLowerCase();
    const needle   = matchCase ? query : query.toLowerCase();
    let pos = 0;
    while (true) {
      const idx = haystack.indexOf(needle, pos);
      if (idx === -1) break;
      positions.push(idx);
      pos = idx + 1;
    }
    return positions;
  }, [matchCase]);

  useEffect(() => {
    const positions = allMatches(yaml, findVal);
    setMatchCount(positions.length);
    if (positions.length === 0) setMatchIdx(-1);
    else if (matchIdx >= positions.length) setMatchIdx(0);
  }, [findVal, yaml, allMatches, matchIdx]);

  const findNext = (dir: 1 | -1 = 1) => {
    const positions = allMatches(yaml, findVal);
    if (!positions.length) return;
    const next = matchIdx === -1
      ? (dir === 1 ? 0 : positions.length - 1)
      : (matchIdx + dir + positions.length) % positions.length;
    setMatchIdx(next);
    // highlight in textarea
    const pos = positions[next];
    taRef.current?.focus();
    taRef.current?.setSelectionRange(pos, pos + findVal.length);
    // scroll to match
    const beforeMatch = yaml.slice(0, pos);
    const linesBefore = beforeMatch.split('\n').length - 1;
    const lineHeight = 20; // px per line (text-sm + leading)
    if (taRef.current) {
      taRef.current.scrollTop = Math.max(0, linesBefore * lineHeight - 80);
      syncScroll();
    }
  };

  const replaceSingle = () => {
    const positions = allMatches(yaml, findVal);
    if (!positions.length || matchIdx === -1) return;
    const pos = positions[matchIdx];
    const newYaml = yaml.slice(0, pos) + replaceVal + yaml.slice(pos + findVal.length);
    setYaml(newYaml);
  };

  const replaceAll = () => {
    if (!findVal) return;
    const flags = matchCase ? 'g' : 'gi';
    const escaped = findVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const newYaml = yaml.replace(new RegExp(escaped, flags), replaceVal);
    setYaml(newYaml);
    setMatchIdx(-1);
  };

  const save = async () => {
    setSaving(true); setSaveMsg(''); setErr('');
    try {
      const res = await fetch(`${AGENT_API}/agents/${agent.agent_id}/ontology`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ontology_yaml: yaml }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setOrigYaml(yaml);
      setSaveMsg('Saved ✓');
      setTimeout(() => setSaveMsg(''), 2500);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error saving');
    } finally {
      setSaving(false);
    }
  };

  const isDirty = yaml !== origYaml;

  // close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // open search with Ctrl+F inside textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      setSearchOpen(true);
      setTimeout(() => findRef.current?.focus(), 50);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      save();
    }
  };

  const accentStyle = { color: 'var(--accent)' };

  return (
    <div
      className="fixed inset-0 z-50 flex"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Drawer panel */}
      <div
        className="ml-auto flex flex-col h-full"
        style={{
          width: '820px',
          maxWidth: '96vw',
          background: 'var(--main-bg)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={accentStyle}>
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Ontology Editor</p>
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{agent.agent_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {saveMsg && <span className="text-xs font-semibold" style={{ color: '#22c55e' }}>{saveMsg}</span>}
            {/* Search/Replace toggle */}
            <button
              onClick={() => { setSearchOpen(v => !v); setTimeout(() => findRef.current?.focus(), 50); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background: searchOpen ? 'var(--accent)' : 'var(--surface)', color: searchOpen ? '#fff' : 'var(--text-muted)', border: '1px solid var(--border)' }}
              title="Search & Replace (Ctrl+F)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Search
            </button>
            <button
              onClick={() => { setYaml(origYaml); setSaveMsg(''); setErr(''); }}
              disabled={!isDirty}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background: 'var(--surface)', color: isDirty ? 'var(--text-muted)' : 'var(--text-faint)', border: '1px solid var(--border)', opacity: isDirty ? 1 : 0.4, cursor: isDirty ? 'pointer' : 'default' }}
            >
              Reset
            </button>
            <button
              onClick={save}
              disabled={saving || !isDirty}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{ background: isDirty ? 'var(--accent)' : 'var(--surface)', color: isDirty ? '#fff' : 'var(--text-faint)', border: '1px solid var(--border)', opacity: saving ? 0.7 : 1, cursor: isDirty ? 'pointer' : 'default' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-muted)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* Search/Replace panel */}
        {searchOpen && (
          <div className="px-4 py-3 shrink-0 space-y-2" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  ref={findRef}
                  type="text"
                  placeholder="Find…"
                  value={findVal}
                  onChange={e => setFindVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); findNext(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') setSearchOpen(false); }}
                  className="w-full px-3 py-1.5 text-sm rounded-lg font-mono"
                  style={{ background: 'var(--main-bg)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
                  autoFocus
                />
              </div>
              <button
                onClick={() => setMatchCase(v => !v)}
                title="Match case"
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={{ background: matchCase ? 'var(--accent)' : 'var(--main-bg)', color: matchCase ? '#fff' : 'var(--text-muted)', border: '1px solid var(--border)' }}
              >Aa</button>
              <span className="text-xs shrink-0" style={{ color: 'var(--text-faint)', minWidth: 48 }}>
                {findVal ? (matchCount === 0 ? 'No results' : `${matchIdx + 1}/${matchCount}`) : ''}
              </span>
              <button onClick={() => findNext(-1)} title="Previous (Shift+Enter)" className="p-1.5 rounded-lg hover:bg-[var(--main-bg)]" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>
              </button>
              <button onClick={() => findNext(1)} title="Next (Enter)" className="p-1.5 rounded-lg hover:bg-[var(--main-bg)]" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <button onClick={() => setSearchOpen(false)} className="p-1.5 rounded-lg hover:bg-[var(--main-bg)]" style={{ color: 'var(--text-faint)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Replace with…"
                value={replaceVal}
                onChange={e => setReplaceVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') replaceSingle(); }}
                className="flex-1 px-3 py-1.5 text-sm rounded-lg font-mono"
                style={{ background: 'var(--main-bg)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
              />
              <button
                onClick={replaceSingle}
                disabled={!findVal || matchIdx === -1}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ background: 'var(--main-bg)', color: 'var(--text-muted)', border: '1px solid var(--border)', opacity: (!findVal || matchIdx === -1) ? 0.4 : 1 }}
              >Replace</button>
              <button
                onClick={replaceAll}
                disabled={!findVal || matchCount === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ background: (!findVal || matchCount === 0) ? 'var(--main-bg)' : 'var(--accent)', color: (!findVal || matchCount === 0) ? 'var(--text-muted)' : '#fff', border: '1px solid var(--border)', opacity: (!findVal || matchCount === 0) ? 0.4 : 1 }}
              >Replace All</button>
            </div>
          </div>
        )}

        {/* Error bar */}
        {err && (
          <div className="mx-4 mt-3 px-4 py-2 rounded-lg text-sm shrink-0" style={{ background: '#ef444422', border: '1px solid #ef444444', color: '#f87171' }}>
            {err}
          </div>
        )}

        {/* Editor body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          </div>
        ) : (
          <div className="flex flex-col px-4 pb-4 pt-2" style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden' }}>
            {/* Line count / dirty indicator */}
            <div className="flex items-center justify-between px-1 pb-2 shrink-0">
              <span className="text-xs" style={{ color: 'var(--text-faint)' }}>{lineCount} lines · YAML</span>
              {isDirty && <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>● unsaved changes</span>}
            </div>
            {/* Code editor: line numbers + textarea — fills all remaining space */}
            <div
              className="flex rounded-xl"
              style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden', border: '1px solid var(--border)', background: '#0d0d0d' }}
            >
              {/* Line numbers — scrolls in sync with textarea */}
              <div
                ref={lnRef}
                style={{
                  width: '48px',
                  flexShrink: 0,
                  overflowY: 'hidden',
                  paddingTop: '12px',
                  paddingBottom: '12px',
                  paddingRight: '10px',
                  paddingLeft: '6px',
                  background: '#111',
                  borderRight: '1px solid var(--border)',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  lineHeight: '20px',
                  color: '#444',
                  textAlign: 'right',
                  userSelect: 'none',
                }}
              >
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i + 1}>{i + 1}</div>
                ))}
              </div>
              {/* Textarea — scrolls vertically + horizontally */}
              <textarea
                ref={taRef}
                value={yaml}
                onChange={e => setYaml(e.target.value)}
                onScroll={syncScroll}
                onKeyDown={handleKeyDown}
                spellCheck={false}
                style={{
                  flex: '1 1 0',
                  minWidth: 0,
                  resize: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: '#e2e8f0',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  lineHeight: '20px',
                  padding: '12px 14px',
                  tabSize: 2,
                  whiteSpace: 'pre',
                  overflowWrap: 'normal',
                  overflowX: 'auto',
                  overflowY: 'auto',
                }}
              />
            </div>
            {/* Footer hints */}
            <div className="flex items-center gap-4 mt-2 px-1 shrink-0">
              <span className="text-xs" style={{ color: 'var(--text-faint)' }}>Ctrl+S to save · Ctrl+F to search</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AgentsSection({ token }: { token: string }) {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewAgent, setViewAgent] = useState<AgentRecord | null>(null);
  const [editAgent, setEditAgent] = useState<AgentRecord | null>(null);
  const [deleteAgent, setDeleteAgent] = useState<AgentRecord | null>(null);
  const [ontologyAgent, setOntologyAgent] = useState<AgentRecord | null>(null);
  const [ownerMap, setOwnerMap] = useState<Record<string, string>>({});

  // Fetch all users to build owner id → name map
  useEffect(() => {
    if (!token) return;
    fetch(`${API}/admin/users`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        const map: Record<string, string> = {};
        (data.users ?? []).forEach((u: AdminUser) => { if (u.user_id) map[u.user_id] = u.name || u.email; });
        setOwnerMap(map);
      })
      .catch(() => {/* non-fatal */});
  }, [token]);

  const fetchAgents = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const url = statusFilter === 'all' ? `${AGENT_API}/agents` : `${AGENT_API}/agents?status=${statusFilter}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setAgents(data.agents ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const filtered = agents;

  return (
    <>
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {['all', 'ready', 'initializing', 'error'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize"
                style={{
                  background: statusFilter === s ? 'var(--accent)' : 'var(--surface)',
                  color: statusFilter === s ? '#fff' : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <button onClick={fetchAgents} className="p-2 rounded-lg hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-muted)' }} title="Refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0020.49 15"/></svg>
          </button>
        </div>

        {err && <div className="rounded-lg px-4 py-3 text-sm text-red-400" style={{ background: '#ef444422', border: '1px solid #ef444444' }}>{err}</div>}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="mx-auto" style={{ color: 'var(--text-faint)' }}>
              <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
            </svg>
            <p className="mt-3 text-sm" style={{ color: 'var(--text-faint)' }}>No agents found</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
            {/* Header */}
            <div className="grid gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wider"
              style={{ gridTemplateColumns: '1fr 90px 60px 90px 70px 90px 110px', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' }}>
              <div>Agent</div><div>Status</div><div>Tables</div><div>Source</div><div>Created</div><div>Created by</div><div className="text-right">Actions</div>
            </div>
            {filtered.map((a, i) => {
              const connInfo = a.connection_info || {};
              const sourceLabel = connInfo.source_type === 'csv'
                ? '📄 CSV'
                : connInfo.source_type === 'database'
                  ? `🗄️ ${connInfo.connectionName || 'DB'}`
                  : '—';
              const ownerLabel = a.owner_id ? (ownerMap[a.owner_id] || a.owner_id.slice(0, 8) + '…') : '—';
              return (
                <div key={a.agent_id}
                  className="grid gap-3 items-center px-4 py-3 hover:bg-[var(--surface-hover)] transition-colors"
                  style={{ gridTemplateColumns: '1fr 90px 60px 90px 70px 90px 110px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{a.agent_name}</p>
                    <p className="text-xs truncate font-mono" style={{ color: 'var(--text-faint)' }}>{a.agent_id.slice(0, 8)}…</p>
                  </div>
                  <div><AgentStatusBadge status={a.status} /></div>
                  <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{a.table_count ?? '—'}</div>
                  <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{sourceLabel}</div>
                  <div className="text-xs" style={{ color: 'var(--text-faint)' }}>
                    {a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}
                  </div>
                  <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }} title={a.owner_id || ''}>{ownerLabel}</div>
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setViewAgent(a)} className="p-1.5 rounded-lg hover:bg-[var(--main-bg)]" style={{ color: 'var(--text-muted)' }} title="View details">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <button onClick={() => setEditAgent(a)} className="p-1.5 rounded-lg hover:bg-[var(--main-bg)]" style={{ color: 'var(--text-muted)' }} title="Edit name">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    {a.ontology_s3_uri && a.ontology_s3_uri !== 'memory' && (
                      <button onClick={() => setOntologyAgent(a)} className="p-1.5 rounded-lg hover:bg-[var(--main-bg)]" style={{ color: 'var(--accent)' }} title="Edit ontology YAML">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                      </button>
                    )}
                    <button onClick={() => setDeleteAgent(a)} className="p-1.5 rounded-lg hover:bg-red-500/10" style={{ color: '#ef4444' }} title="Delete">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {viewAgent && <AgentDetailModal agent={viewAgent} onClose={() => setViewAgent(null)} />}
      {editAgent && <EditAgentModal agent={editAgent} onClose={() => setEditAgent(null)} onSaved={() => { setEditAgent(null); fetchAgents(); }} />}
      {deleteAgent && <DeleteAgentDialog agent={deleteAgent} onClose={() => setDeleteAgent(null)} onDeleted={() => { setDeleteAgent(null); fetchAgents(); }} />}
      {ontologyAgent && <OntologyEditorDrawer agent={ontologyAgent} onClose={() => setOntologyAgent(null)} />}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION: CONNECTIONS
// ═══════════════════════════════════════════════════════════════

function AddConnectionModal({ connType, token, onClose, onSaved }: { connType: 'postgres' | 'neo4j'; token: string; onClose: () => void; onSaved: () => void }) {
  const isPg = connType === 'postgres';
  const [form, setForm] = useState({
    name: '',
    host: '',
    port: isPg ? '5432' : '7687',
    database: isPg ? 'postgres' : 'neo4j',
    username: isPg ? 'postgres' : 'neo4j',
    password: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setSaving(true); setErr('');
    const res = await fetch(`${API}/admin/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...form, type: connType }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setErr(data.error || 'Failed'); return; }
    onSaved();
  }

  return (
    <Modal title={`Add ${isPg ? 'PostgreSQL' : 'Neo4j'} connection`} onClose={onClose} wide>
      <div className="space-y-3">
        <Input label="Connection name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Production DB" />
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Input label="Host" value={form.host} onChange={(e) => set('host', e.target.value)} placeholder="localhost" />
          </div>
          <Input label="Port" type="number" value={form.port} onChange={(e) => set('port', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Database" value={form.database} onChange={(e) => set('database', e.target.value)} />
          <Input label="Username" value={form.username} onChange={(e) => set('username', e.target.value)} />
        </div>
        <Input label="Password" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} />
        {err && <p className="text-xs text-red-400">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn loading={saving} onClick={submit}>Save connection</Btn>
        </div>
      </div>
    </Modal>
  );
}

function ConnectionCard({ conn, token, onDeleted }: { conn: AdminConnection; token: string; onDeleted: () => void }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function testConn() {
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch(`${API}/admin/connections/${conn.connection_id}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ success: false, message: 'Network error' });
    } finally {
      setTesting(false);
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setTestResult(null), 7000);
  }

  async function deleteConn() {
    setDeleting(true);
    await fetch(`${API}/admin/connections/${conn.connection_id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setDeleting(false);
    onDeleted();
  }

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{conn.name}</p>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-faint)' }}>
            {conn.host}:{conn.port}{conn.database ? ` / ${conn.database}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={testConn}
            disabled={testing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition-all"
            style={{ background: 'var(--accent)1a', color: 'var(--accent)', border: '1px solid var(--accent)33' }}
          >
            {testing ? (
              <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin inline-block" />
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
            )}
            {testing ? 'Testing…' : 'Test'}
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button onClick={deleteConn} disabled={deleting} className="px-2 py-1 rounded text-xs font-semibold text-white bg-red-500 disabled:opacity-50">
                {deleting ? '…' : 'Yes, delete'}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 rounded text-xs" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors" style={{ color: '#ef4444' }} title="Delete">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--text-faint)' }}>
        <span>User: <span style={{ color: 'var(--text-muted)' }}>{conn.username || '—'}</span></span>
        <span>Password: <span style={{ color: 'var(--text-muted)' }}>{conn.has_password ? '••••••••' : 'not set'}</span></span>
        {conn.created_at && <span className="ml-auto">Added {new Date(conn.created_at).toLocaleDateString()}</span>}
      </div>

      {testResult && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
          style={{
            background: testResult.success ? '#10b98118' : '#ef444418',
            border: `1px solid ${testResult.success ? '#10b98133' : '#ef444433'}`,
            color: testResult.success ? '#10b981' : '#ef4444',
          }}
        >
          {testResult.success ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          )}
          {testResult.message}
        </div>
      )}
    </div>
  );
}

function ConnectionsSection({ connType, token }: { connType: 'postgres' | 'neo4j'; token: string }) {
  const [connections, setConnections] = useState<AdminConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const isPg = connType === 'postgres';

  const fetchConns = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res = await fetch(`${API}/admin/connections?type=${connType}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setConnections(data.connections ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [connType, token]);

  useEffect(() => { fetchConns(); }, [fetchConns]);

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Admin-level {isPg ? 'PostgreSQL' : 'Neo4j'} connections — saved for future application use.
          </p>
          <div className="flex items-center gap-2">
            <button onClick={fetchConns} className="p-2 rounded-lg hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-muted)' }} title="Refresh">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0020.49 15"/></svg>
            </button>
            <Btn onClick={() => setShowAdd(true)}>
              <span className="flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add connection
              </span>
            </Btn>
          </div>
        </div>

        <div
          className="rounded-xl px-4 py-3 text-xs flex items-start gap-2"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-faint)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>
            {isPg
              ? 'Store PostgreSQL connection details for the application. Credentials are saved in DynamoDB. Use Test to verify connectivity.'
              : 'Store Neo4j Bolt connections (bolt://host:7687). Credentials saved in DynamoDB. Use Test to verify before use.'}
          </span>
        </div>

        {err && <div className="rounded-lg px-4 py-3 text-sm text-red-400" style={{ background: '#ef444422', border: '1px solid #ef444444' }}>{err}</div>}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          </div>
        ) : connections.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="mx-auto" style={{ color: 'var(--text-faint)' }}>
              {isPg ? (
                <>
                  <ellipse cx="12" cy="5" rx="9" ry="3"/>
                  <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                </>
              ) : (
                <>
                  <circle cx="5" cy="12" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="19" cy="19" r="2"/>
                  <line x1="7" y1="11" x2="17" y2="6"/><line x1="7" y1="13" x2="17" y2="18"/>
                  <line x1="19" y1="7" x2="19" y2="17"/>
                </>
              )}
            </svg>
            <p className="text-sm" style={{ color: 'var(--text-faint)' }}>No {isPg ? 'PostgreSQL' : 'Neo4j'} connections saved yet</p>
            <Btn onClick={() => setShowAdd(true)}>Add first connection</Btn>
          </div>
        ) : (
          <div className="space-y-3">
            {connections.map((c) => (
              <ConnectionCard key={c.connection_id} conn={c} token={token} onDeleted={fetchConns} />
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <AddConnectionModal
          connType={connType}
          token={token}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); fetchConns(); }}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// LLM SETTINGS SECTION
// ═══════════════════════════════════════════════════════════════

interface LLMConfig {
  active_provider: 'openai' | 'vllm' | 'ollama';
  openai: { api_key: string; model: string; max_tokens: number };
  vllm: { api_key: string; base_url: string; model: string; max_tokens: number };
  ollama: { base_url: string; model: string; max_tokens: number };
}

const defaultLLMConfig: LLMConfig = {
  active_provider: 'openai',
  openai: { api_key: '', model: 'gpt-4o-mini', max_tokens: 2048 },
  vllm:   { api_key: '', base_url: 'http://localhost:8000', model: 'meta-llama/Llama-3-8b-instruct', max_tokens: 2048 },
  ollama: { base_url: 'http://localhost:11434', model: 'llama3', max_tokens: 2048 },
};

type LLMTab = 'general' | 'openai' | 'vllm' | 'ollama';

const LLM_TABS: { id: LLMTab; label: string; desc: string }[] = [
  { id: 'general', label: 'General',       desc: 'Select active provider' },
  { id: 'openai',  label: 'OpenAI',        desc: 'GPT models via API key' },
  { id: 'vllm',    label: 'vLLM',          desc: 'Self-hosted OpenAI-compatible' },
  { id: 'ollama',  label: 'Ollama',        desc: 'Local models (llama3, mistral…)' },
];

const PROVIDER_INFO: Record<string, { color: string; description: string }> = {
  openai: { color: '#10b981', description: 'Use OpenAI API (GPT-4o, GPT-4o-mini, etc.)' },
  vllm:   { color: '#3b82f6', description: 'Connect to a self-hosted vLLM inference server' },
  ollama: { color: '#f59e0b', description: 'Use Ollama running locally or on your server' },
};

function LLMSettingsSection({ token }: { token: string }) {
  const [cfg, setCfg] = useState<LLMConfig>(defaultLLMConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<LLMTab>('general');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`${API}/admin/llm-settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      let data: Record<string, unknown> = {};
      try { data = await res.json(); } catch { /* empty body */ }
      if (res.ok && data.settings) {
        setCfg({ ...defaultLLMConfig, ...(data.settings as Partial<LLMConfig>) });
      } else if (!res.ok) {
        setMsg({ type: 'err', text: `Error ${res.status}: ${(data.error as string) ?? res.statusText}` });
      }
      // 200 with no settings yet = first load, use defaults — that's fine
    } catch (e) {
      setMsg({ type: 'err', text: `Network error — ${String(e)}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (patch?: Partial<LLMConfig>) => {
    setSaving(true);
    setMsg(null);
    try {
      const body = { ...cfg, ...(patch ?? {}) };
      const res = await fetch(`${API}/admin/llm-settings`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setCfg(body as LLMConfig);
        setMsg({ type: 'ok', text: 'Settings saved successfully' });
        setTimeout(() => setMsg(null), 4000);
      } else {
        setMsg({ type: 'err', text: data.error ?? 'Save failed' });
      }
    } catch {
      setMsg({ type: 'err', text: 'Network error — could not save settings' });
    } finally {
      setSaving(false);
    }
  };

  const updateProv = <P extends keyof LLMConfig>(prov: P, key: string, val: string | number) =>
    setCfg(prev => ({ ...prev, [prov]: { ...(prev[prov] as object), [key]: val } }));

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm" style={{ color: 'var(--text-muted)' }}>
        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 11-6.219-8.56" />
        </svg>
        Loading LLM settings…
      </div>
    );
  }

  const activeInfo = PROVIDER_INFO[cfg.active_provider];

  return (
    <div className="space-y-0 w-full">
      {/* Tab bar */}
      <div
        className="flex items-center gap-1 p-1 rounded-xl mb-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {LLM_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
            style={
              activeTab === tab.id
                ? { background: 'var(--accent)', color: '#fff' }
                : { background: 'transparent', color: 'var(--text-muted)' }
            }
          >
            {tab.label}
            {tab.id !== 'general' && cfg.active_provider === tab.id && (
              <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-green-400 align-middle" />
            )}
          </button>
        ))}
      </div>

      {/* Status message */}
      {msg && (
        <div
          className="px-4 py-2.5 rounded-lg text-sm mb-4 flex items-center gap-2"
          style={{
            background: msg.type === 'ok' ? '#10b98118' : '#ef444418',
            color: msg.type === 'ok' ? '#10b981' : '#ef4444',
            border: `1px solid ${msg.type === 'ok' ? '#10b98144' : '#ef444444'}`,
          }}
        >
          {msg.type === 'ok'
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
          }
          {msg.text}
        </div>
      )}

      {/* ── GENERAL TAB ─────────────────────────────────── */}
      {activeTab === 'general' && (
        <div className="space-y-4">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Choose which LLM provider the application uses for all chat responses. Configure credentials in each provider tab before switching.
          </p>

          {/* Current active badge */}
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: activeInfo.color + '14', border: `1px solid ${activeInfo.color}44` }}
          >
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: activeInfo.color }} />
            <div>
              <p className="text-xs font-bold" style={{ color: activeInfo.color }}>
                Active: {cfg.active_provider.toUpperCase()}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{activeInfo.description}</p>
            </div>
          </div>

          {/* Provider selector cards */}
          <div className="grid grid-cols-1 gap-3">
            {(['openai', 'vllm', 'ollama'] as const).map(prov => {
              const info = PROVIDER_INFO[prov];
              const isActive = cfg.active_provider === prov;
              const provLabels: Record<string, string[]> = {
                openai: ['OpenAI', 'GPT-4o, GPT-4o-mini, o1…'],
                vllm:   ['vLLM', 'Llama, Mistral, Qwen, Phi…'],
                ollama: ['Ollama', 'llama3, mistral, phi3, gemma…'],
              };
              return (
                <div
                  key={prov}
                  className="flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all"
                  style={{
                    background: isActive ? info.color + '14' : 'var(--surface)',
                    border: isActive ? `2px solid ${info.color}` : '1px solid var(--border)',
                  }}
                  onClick={() => !isActive && save({ active_provider: prov })}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: info.color }} />
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{provLabels[prov][0]}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{provLabels[prov][1]}</p>
                    </div>
                  </div>
                  {isActive ? (
                    <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: info.color, color: '#fff' }}>Active</span>
                  ) : (
                    <button
                      className="text-xs px-3 py-1 rounded-lg font-medium transition-opacity hover:opacity-80"
                      style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                      onClick={e => { e.stopPropagation(); save({ active_provider: prov }); }}
                    >
                      {saving ? 'Switching…' : 'Use this'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-xs pt-1" style={{ color: 'var(--text-muted)' }}>
            Tip: Click a provider tab above to configure its credentials, then come back here to activate it.
          </p>
        </div>
      )}

      {/* ── OPENAI TAB ──────────────────────────────────── */}
      {activeTab === 'openai' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: PROVIDER_INFO.openai.color }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {PROVIDER_INFO.openai.description}. Get your key at{' '}
              <a href="https://platform.openai.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>platform.openai.com</a>.
            </p>
          </div>
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <Field label="API Key">
              <input
                type="password"
                className={inputCls}
                style={inputStyle}
                value={cfg.openai.api_key}
                onChange={e => updateProv('openai', 'api_key', e.target.value)}
                placeholder="sk-…"
                autoComplete="off"
              />
            </Field>
            <Field label="Model">
              <select className={inputCls} style={inputStyle} value={cfg.openai.model} onChange={e => updateProv('openai', 'model', e.target.value)}>
                <option value="gpt-4o-mini">gpt-4o-mini (fast, cheap)</option>
                <option value="gpt-4o">gpt-4o (best quality)</option>
                <option value="gpt-4-turbo">gpt-4-turbo</option>
                <option value="gpt-3.5-turbo">gpt-3.5-turbo (legacy)</option>
                <option value="o1-mini">o1-mini (reasoning)</option>
                <option value="o1">o1 (advanced reasoning)</option>
              </select>
            </Field>
            <Field label="Max Tokens (response length)">
              <input
                type="number"
                className={inputCls}
                style={inputStyle}
                value={cfg.openai.max_tokens}
                onChange={e => updateProv('openai', 'max_tokens', parseInt(e.target.value) || 2048)}
                min={128} max={32768} step={128}
              />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <Btn loading={saving} onClick={() => save()}>Save OpenAI Settings</Btn>
            {cfg.active_provider !== 'openai' && (
              <Btn variant="ghost" loading={saving} onClick={() => save({ active_provider: 'openai' })}>
                Save &amp; Set Active
              </Btn>
            )}
          </div>
        </div>
      )}

      {/* ── vLLM TAB ────────────────────────────────────── */}
      {activeTab === 'vllm' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: PROVIDER_INFO.vllm.color }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {PROVIDER_INFO.vllm.description}. Exposes an OpenAI-compatible <code>/v1/chat/completions</code> endpoint.
            </p>
          </div>
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <Field label="Server Base URL">
              <input
                className={inputCls}
                style={inputStyle}
                value={cfg.vllm.base_url}
                onChange={e => updateProv('vllm', 'base_url', e.target.value)}
                placeholder="http://your-server:8000"
              />
            </Field>
            <Field label="Model ID">
              <input
                className={inputCls}
                style={inputStyle}
                value={cfg.vllm.model}
                onChange={e => updateProv('vllm', 'model', e.target.value)}
                placeholder="meta-llama/Llama-3-8b-instruct"
              />
            </Field>
            <Field label="API Key (optional — leave blank if not required)">
              <input
                type="password"
                className={inputCls}
                style={inputStyle}
                value={cfg.vllm.api_key}
                onChange={e => updateProv('vllm', 'api_key', e.target.value)}
                placeholder="Leave empty if not required"
                autoComplete="off"
              />
            </Field>
            <Field label="Max Tokens (response length)">
              <input
                type="number"
                className={inputCls}
                style={inputStyle}
                value={cfg.vllm.max_tokens}
                onChange={e => updateProv('vllm', 'max_tokens', parseInt(e.target.value) || 2048)}
                min={128} max={32768} step={128}
              />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <Btn loading={saving} onClick={() => save()}>Save vLLM Settings</Btn>
            {cfg.active_provider !== 'vllm' && (
              <Btn variant="ghost" loading={saving} onClick={() => save({ active_provider: 'vllm' })}>
                Save &amp; Set Active
              </Btn>
            )}
          </div>
        </div>
      )}

      {/* ── OLLAMA TAB ──────────────────────────────────── */}
      {activeTab === 'ollama' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: PROVIDER_INFO.ollama.color }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {PROVIDER_INFO.ollama.description}. Make sure Ollama is running and accessible from the Lambda function network.
            </p>
          </div>
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <Field label="Ollama Base URL">
              <input
                className={inputCls}
                style={inputStyle}
                value={cfg.ollama.base_url}
                onChange={e => updateProv('ollama', 'base_url', e.target.value)}
                placeholder="http://localhost:11434"
              />
            </Field>
            <Field label="Model">
              <input
                className={inputCls}
                style={inputStyle}
                value={cfg.ollama.model}
                onChange={e => updateProv('ollama', 'model', e.target.value)}
                placeholder="llama3"
              />
            </Field>
            <Field label="Max Tokens (response length)">
              <input
                type="number"
                className={inputCls}
                style={inputStyle}
                value={cfg.ollama.max_tokens}
                onChange={e => updateProv('ollama', 'max_tokens', parseInt(e.target.value) || 2048)}
                min={128} max={32768} step={128}
              />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <Btn loading={saving} onClick={() => save()}>Save Ollama Settings</Btn>
            {cfg.active_provider !== 'ollama' && (
              <Btn variant="ghost" loading={saving} onClick={() => save({ active_provider: 'ollama' })}>
                Save &amp; Set Active
              </Btn>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION: QDRANT CONFIG
// ═══════════════════════════════════════════════════════════════

function QdrantConfigSection({ token }: { token: string }) {
  const [url, setUrl]             = useState('');
  const [apiKey, setApiKey]       = useState('');
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [testing, setTesting]     = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [msg, setMsg]             = useState('');
  const [err, setErr]             = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/admin/qdrant-settings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        const s = d?.settings || {};
        setUrl(s.url || '');
        setApiKey(s.api_key || '');
      })
      .catch(() => setErr('Failed to load Qdrant settings'))
      .finally(() => setLoading(false));
  }, [token]);

  async function save() {
    setSaving(true); setMsg(''); setErr('');
    try {
      const res = await fetch(`${API}/admin/qdrant-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url, api_key: apiKey }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d?.error || 'Save failed'); return; }
      setMsg('✅ Qdrant settings saved successfully');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true); setTestResult(null); setMsg(''); setErr('');
    try {
      const res = await fetch(`${API}/admin/qdrant-settings/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      setTestResult({ success: d?.success === true, message: d?.message || 'Unknown result' });
    } catch (e: any) {
      setTestResult({ success: false, message: 'Network error: ' + e.message });
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>;

  return (
    <div className="max-w-lg space-y-5">
      {/* Info card */}
      <div className="rounded-xl p-4 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Qdrant Vector Database</span>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Configure your Qdrant vector database connection. This is used by RAG agents to store and
          search document embeddings. You can use Qdrant Cloud or a self-hosted instance.
        </p>
      </div>

      {/* Form */}
      <div className="rounded-xl p-5 border space-y-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Qdrant URL *</label>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://your-cluster.qdrant.io:6333"
            className="w-full px-3 py-2 rounded-lg text-sm border"
            style={{ background: 'var(--main-bg)', borderColor: 'var(--border)', color: 'var(--text)', outline: 'none' }}
          />
          <p className="text-xs" style={{ color: 'var(--text-faint)' }}>For Qdrant Cloud: https://&lt;cluster-id&gt;.qdrant.io:6333</p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>API Key (optional for local)</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="Your Qdrant API key"
            className="w-full px-3 py-2 rounded-lg text-sm border"
            style={{ background: 'var(--main-bg)', borderColor: 'var(--border)', color: 'var(--text)', outline: 'none' }}
          />
        </div>

        {msg && <p className="text-xs font-medium" style={{ color: 'var(--success, #22c55e)' }}>{msg}</p>}
        {err && <p className="text-xs font-medium" style={{ color: 'var(--error, #ef4444)' }}>{err}</p>}

        {testResult && (
          <div
            className="rounded-lg px-3 py-2 text-xs font-medium"
            style={{
              background: testResult.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color: testResult.success ? '#16a34a' : '#dc2626',
              border: `1px solid ${testResult.success ? '#bbf7d0' : '#fecaca'}`,
            }}
          >
            {testResult.success ? '✅ ' : '❌ '}{testResult.message}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={testConnection}
            disabled={testing || !url}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--surface-2, #374151)', color: 'var(--text)', border: '1px solid var(--border)' }}
          >
            {testing ? 'Testing…' : '🔌 Test Connection'}
          </button>
          <button
            onClick={save}
            disabled={saving || !url}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            {saving ? 'Saving…' : 'Save Qdrant Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION: REDIS CONFIG
// ═══════════════════════════════════════════════════════════════

function RedisConfigSection({ token }: { token: string }) {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('6379');
  const [password, setPassword] = useState('');
  const [db, setDb] = useState('0');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch(`${API}/admin/redis-settings`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        const s = d.settings || {};
        setHost(s.host || '');
        setPort(s.port || '6379');
        setPassword(s.password || '');
        setDb(s.db || '0');
      })
      .catch(() => setErr('Failed to load Redis settings'))
      .finally(() => setLoading(false));
  }, [token]);

  async function save() {
    setSaving(true); setMsg(''); setErr('');
    try {
      const res = await fetch(`${API}/admin/redis-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ host, port, password, db }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d?.error || 'Save failed'); return; }
      setMsg('✅ Redis settings saved successfully');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true); setTestResult(null); setMsg(''); setErr('');
    try {
      const res = await fetch(`${API}/admin/redis-settings/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      setTestResult({ success: d?.success === true, message: d?.message || 'Unknown result' });
    } catch (e: unknown) {
      setTestResult({ success: false, message: 'Network error: ' + (e instanceof Error ? e.message : String(e)) });
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>;

  return (
    <div className="max-w-lg space-y-5">
      {/* Info card */}
      <div className="rounded-xl p-4 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
            <ellipse cx="12" cy="8" rx="9" ry="3"/>
            <path d="M3 8v4c0 1.66 4 3 9 3s9-1.34 9-3V8"/>
            <path d="M3 12v4c0 1.66 4 3 9 3s9-1.34 9-3v-4"/>
          </svg>
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Redis Cache</span>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Configure your Redis connection for caching, session storage, or pub/sub messaging.
          Supports Redis 6+ with optional authentication.
        </p>
      </div>

      {/* Form */}
      <div className="rounded-xl p-5 border space-y-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Host *</label>
            <input
              value={host}
              onChange={e => setHost(e.target.value)}
              placeholder="localhost or redis.example.com"
              className="w-full px-3 py-2 rounded-lg text-sm border"
              style={{ background: 'var(--main-bg)', borderColor: 'var(--border)', color: 'var(--text)', outline: 'none' }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Port</label>
            <input
              value={port}
              onChange={e => setPort(e.target.value)}
              placeholder="6379"
              type="number"
              className="w-full px-3 py-2 rounded-lg text-sm border"
              style={{ background: 'var(--main-bg)', borderColor: 'var(--border)', color: 'var(--text)', outline: 'none' }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Password (optional)</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Redis AUTH password"
              className="w-full px-3 py-2 rounded-lg text-sm border"
              style={{ background: 'var(--main-bg)', borderColor: 'var(--border)', color: 'var(--text)', outline: 'none' }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>DB Index</label>
            <input
              value={db}
              onChange={e => setDb(e.target.value)}
              placeholder="0"
              type="number"
              min="0"
              max="15"
              className="w-full px-3 py-2 rounded-lg text-sm border"
              style={{ background: 'var(--main-bg)', borderColor: 'var(--border)', color: 'var(--text)', outline: 'none' }}
            />
          </div>
        </div>

        {msg && <p className="text-xs font-medium" style={{ color: 'var(--success, #22c55e)' }}>{msg}</p>}
        {err && <p className="text-xs font-medium" style={{ color: 'var(--error, #ef4444)' }}>{err}</p>}

        {testResult && (
          <div
            className="rounded-lg px-3 py-2 text-xs font-medium"
            style={{
              background: testResult.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color: testResult.success ? '#16a34a' : '#dc2626',
              border: `1px solid ${testResult.success ? '#bbf7d0' : '#fecaca'}`,
            }}
          >
            {testResult.success ? '✅ ' : '❌ '}{testResult.message}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={testConnection}
            disabled={testing || !host}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--surface-2, #374151)', color: 'var(--text)', border: '1px solid var(--border)' }}
          >
            {testing ? 'Testing…' : '🔌 Test Connection'}
          </button>
          <button
            onClick={save}
            disabled={saving || !host}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            {saving ? 'Saving…' : 'Save Redis Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION: AGENT PERMISSIONS
// ═══════════════════════════════════════════════════════════════

interface AgentPermission {
  agent_id: string;
  visibility: 'public' | 'private';
  shared_with: string[];
  updated_at?: string;
}

function AgentPermissionsSection({ token }: { token: string }) {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [permsMap, setPermsMap] = useState<Record<string, AgentPermission>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [shareTarget, setShareTarget] = useState<AgentRecord | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  const [shareErr, setShareErr] = useState('');
  const [shareLoading, setShareLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      // Fetch agents and permissions independently so one failure doesn't kill both
      const agentsRes = await fetch(`${AGENT_API}/agents`);
      const agentsData = await agentsRes.json();
      setAgents(agentsData.agents ?? []);
    } catch (e: unknown) {
      setErr('Failed to load agents: ' + (e instanceof Error ? e.message : String(e)));
    }
    try {
      const permsRes = await fetch(`${API}/admin/agent-permissions`, { headers: { Authorization: `Bearer ${token}` } });
      const permsData = await permsRes.json();
      const map: Record<string, AgentPermission> = {};
      (permsData.permissions ?? []).forEach((p: AgentPermission) => { map[p.agent_id] = p; });
      setPermsMap(map);
    } catch { /* non-fatal — perms will show as private */ }
    setLoading(false);
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);

  async function toggleVisibility(agent: AgentRecord, current: 'public' | 'private') {
    const next = current === 'public' ? 'private' : 'public';
    setSavingId(agent.agent_id);
    try {
      const res = await fetch(`${API}/admin/agent-permissions/${agent.agent_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ visibility: next }),
      });
      if (res.ok) {
        setPermsMap(prev => ({ ...prev, [agent.agent_id]: { ...(prev[agent.agent_id] || { agent_id: agent.agent_id, shared_with: [] }), visibility: next } }));
      }
    } finally {
      setSavingId(null);
    }
  }

  async function addShare() {
    if (!shareTarget || !shareEmail.trim()) return;
    setShareLoading(true); setShareErr('');
    try {
      const res = await fetch(`${API}/admin/agent-permissions/${shareTarget.agent_id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_email: shareEmail.trim() }),
      });
      const d = await res.json();
      if (!res.ok) { setShareErr(d?.error || 'Failed'); return; }
      setPermsMap(prev => ({ ...prev, [shareTarget.agent_id]: { ...(prev[shareTarget.agent_id] || { agent_id: shareTarget.agent_id, visibility: 'private' }), shared_with: d.shared_with } }));
      setShareEmail('');
    } catch (e: unknown) {
      setShareErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setShareLoading(false);
    }
  }

  async function removeShare(agentId: string, userRef: string) {
    try {
      const res = await fetch(`${API}/admin/agent-permissions/${agentId}/share`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_email: userRef }),
      });
      const d = await res.json();
      if (res.ok) {
        setPermsMap(prev => ({ ...prev, [agentId]: { ...(prev[agentId] || { agent_id: agentId, visibility: 'private' }), shared_with: d.shared_with } }));
      }
    } catch { /* non-fatal */ }
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="animate-spin w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent" />
    </div>
  );

  return (
    <>
      <div className="space-y-4">
        {/* Info banner */}
        <div className="rounded-xl p-4 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Control which agents are <strong>public</strong> (visible to all users) or <strong>private</strong> (only visible to shared users).
            Click the visibility badge to toggle, or click <em>Share</em> to grant access to specific emails.
          </p>
        </div>

        {err && <div className="rounded-lg px-4 py-3 text-sm text-red-400" style={{ background: '#ef444422', border: '1px solid #ef444444' }}>{err}</div>}

        {agents.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm" style={{ color: 'var(--text-faint)' }}>No agents found</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div className="grid gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wider"
              style={{ gridTemplateColumns: '1fr 110px 1fr 90px', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' }}>
              <div>Agent</div><div>Visibility</div><div>Shared with</div><div className="text-right">Actions</div>
            </div>
            {agents.map((a, i) => {
              const perm = permsMap[a.agent_id] || { agent_id: a.agent_id, visibility: 'private', shared_with: [] };
              const isPublic = perm.visibility === 'public';
              return (
                <div key={a.agent_id}
                  className="grid gap-3 items-start px-4 py-3 hover:bg-[var(--surface-hover)] transition-colors"
                  style={{ gridTemplateColumns: '1fr 110px 1fr 90px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{a.agent_name}</p>
                    <p className="text-xs font-mono" style={{ color: 'var(--text-faint)' }}>{a.agent_id.slice(0, 8)}…</p>
                  </div>
                  <div className="pt-0.5">
                    <button
                      onClick={() => toggleVisibility(a, perm.visibility as 'public' | 'private')}
                      disabled={savingId === a.agent_id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all disabled:opacity-50"
                      style={{
                        background: isPublic ? '#10b98122' : '#6b728022',
                        color: isPublic ? '#10b981' : '#9ca3af',
                        border: `1px solid ${isPublic ? '#10b98133' : '#6b728033'}`,
                      }}
                    >
                      {savingId === a.agent_id ? (
                        <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
                      ) : isPublic ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                      )}
                      {isPublic ? 'Public' : 'Private'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-0.5 min-w-0">
                    {perm.shared_with.length === 0 ? (
                      <span className="text-xs" style={{ color: 'var(--text-faint)' }}>—</span>
                    ) : perm.shared_with.map(u => (
                      <span key={u} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                        style={{ background: 'var(--accent)1a', color: 'var(--accent)', border: '1px solid var(--accent)33' }}>
                        {u}
                        <button onClick={() => removeShare(a.agent_id, u)} className="hover:text-red-400 transition-colors ml-0.5">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex justify-end pt-0.5">
                    <button
                      onClick={() => { setShareTarget(a); setShareEmail(''); setShareErr(''); }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                      style={{ background: 'var(--accent)1a', color: 'var(--accent)', border: '1px solid var(--accent)33' }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                      Share
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Share modal */}
      {shareTarget && (
        <Modal title={`Share "${shareTarget.agent_name}"`} onClose={() => setShareTarget(null)}>
          <div className="space-y-3">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Enter a user&apos;s email address to grant them access to this agent.
            </p>
            <div className="flex gap-2">
              <input
                value={shareEmail}
                onChange={e => setShareEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addShare()}
                placeholder="user@example.com"
                className="flex-1 px-3 py-2 rounded-lg text-sm border"
                style={{ background: 'var(--main-bg)', borderColor: 'var(--border)', color: 'var(--text)', outline: 'none' }}
              />
              <Btn loading={shareLoading} onClick={addShare} disabled={!shareEmail.trim()}>Add</Btn>
            </div>
            {shareErr && <p className="text-xs text-red-400">{shareErr}</p>}

            {/* Current shares */}
            {(() => {
              const perm = permsMap[shareTarget.agent_id];
              const list = perm?.shared_with ?? [];
              if (list.length === 0) return null;
              return (
                <div className="space-y-1">
                  <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Currently shared with:</p>
                  {list.map(u => (
                    <div key={u} className="flex items-center justify-between px-3 py-2 rounded-lg"
                      style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                      <span className="text-xs" style={{ color: 'var(--text)' }}>{u}</span>
                      <button onClick={() => removeShare(shareTarget.agent_id, u)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="flex justify-end">
              <Btn variant="ghost" onClick={() => setShareTarget(null)}>Done</Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════

export default function AdminPanel() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<Section>('users');
  const [userCount, setUserCount] = useState(0);

  const token = user?.token ?? '';
  const currentUserId = user?.id ?? '';

  const TITLES: Record<Section, string> = {
    users: 'Users',
    postgres: 'PostgreSQL Connections',
    neo4j: 'Neo4j Connections',
    llm: 'LLM Settings',
    agents: 'SQL Agents',
    qdrant: 'Qdrant Vector DB',
    redis: 'Redis Cache',
    'agent-permissions': 'Agent Access Control',
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--main-bg)' }}>
      <AdminSidebar active={activeSection} onSelect={setActiveSection} userCount={userCount} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex items-center px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>{TITLES[activeSection]}</h2>
        </header>
        <main className="flex-1 overflow-y-auto px-6 py-5">
          {activeSection === 'users' && <UsersSection token={token} currentUserId={currentUserId} onCountChange={setUserCount} />}
          {activeSection === 'postgres' && <ConnectionsSection connType="postgres" token={token} />}
          {activeSection === 'neo4j' && <ConnectionsSection connType="neo4j" token={token} />}
          {activeSection === 'llm' && <LLMSettingsSection token={token} />}
          {activeSection === 'agents' && <AgentsSection token={token} />}
          {activeSection === 'qdrant' && <QdrantConfigSection token={token} />}
          {activeSection === 'redis' && <RedisConfigSection token={token} />}
          {activeSection === 'agent-permissions' && <AgentPermissionsSection token={token} />}
        </main>
      </div>
    </div>
  );
}
