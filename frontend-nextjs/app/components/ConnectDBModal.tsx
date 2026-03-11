'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthProvider';

const BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  'https://sleocl2mk5.execute-api.eu-north-1.amazonaws.com/Prod/chat'
).replace(/\/chat$/, '');

// ── Types ─────────────────────────────────────────────────────
export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
}

export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
}

interface SavedConnection {
  connection_id: string;
  name: string;
  host: string;
  port: string;
  database: string;
  username: string;
  ssl: boolean;
  created_at: string;
}

interface ConnectDBModalProps {
  onClose: () => void;
  onConnected?: (connectionId: string, name: string, tables: TableInfo[]) => void;
}

// ── Icons ─────────────────────────────────────────────────────
const DatabaseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <ellipse cx="12" cy="5" rx="9" ry="3"/>
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const XIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
  >
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

const EyeIcon = ({ visible }: { visible: boolean }) => visible ? (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
) : (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
  </svg>
);

const SpinnerIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    style={{ animation: 'spin 0.8s linear infinite' }}>
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
  </svg>
);

// ── ColumnBadge ───────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const short = type.replace('character varying', 'varchar').replace('timestamp without time zone', 'timestamp').replace('timestamp with time zone', 'timestamptz').replace('double precision', 'float8');
  const color = /int|serial|numeric|float|decimal/.test(type) ? '#3b82f6'
    : /char|text|json/.test(type) ? '#10b981'
    : /bool/.test(type) ? '#f59e0b'
    : /time|date/.test(type) ? '#8b5cf6'
    : '#6b7280';
  return (
    <span style={{ color, fontSize: '10px', fontWeight: 600, padding: '1px 6px', background: `${color}18`, borderRadius: '4px', fontFamily: 'monospace' }}>
      {short}
    </span>
  );
}

// ── TableRow ──────────────────────────────────────────────────
function TableRow({ table, connectionId }: { table: TableInfo; connectionId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '4px' }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors"
        style={{ background: open ? 'var(--surface)' : 'transparent', color: 'var(--text)' }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'var(--surface-hover)'; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent'; }}
      >
        <div className="flex items-center gap-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--accent)' }}>
            <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/>
          </svg>
          <span style={{ fontWeight: 500 }}>{table.name}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>{table.columns.length} col{table.columns.length !== 1 ? 's' : ''}</span>
        </div>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--main-bg)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0', fontSize: '11px' }}>
            {/* Header */}
            <div style={{ padding: '5px 12px', color: 'var(--text-faint)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Column</div>
            <div style={{ padding: '5px 12px', color: 'var(--text-faint)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Type</div>
            <div style={{ padding: '5px 12px', color: 'var(--text-faint)', fontWeight: 600, borderBottom: '1px solid var(--border)', textAlign: 'center' }}>Null</div>
            {/* Rows */}
            {table.columns.map((col, i) => (
              <>
                <div key={`n${i}`} style={{ padding: '4px 12px', color: 'var(--text)', fontFamily: 'monospace', borderBottom: i < table.columns.length - 1 ? '1px solid var(--border)' : 'none' }}>{col.name}</div>
                <div key={`t${i}`} style={{ padding: '4px 12px', borderBottom: i < table.columns.length - 1 ? '1px solid var(--border)' : 'none' }}><TypeBadge type={col.type} /></div>
                <div key={`nl${i}`} style={{ padding: '4px 12px', textAlign: 'center', color: col.nullable ? '#10b981' : 'var(--text-faint)', borderBottom: i < table.columns.length - 1 ? '1px solid var(--border)' : 'none' }}>{col.nullable ? '✓' : '—'}</div>
              </>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────
export default function ConnectDBModal({ onClose, onConnected }: ConnectDBModalProps) {
  const { user } = useAuth();
  const token = user?.token ?? null;

  // Form state
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('5432');
  const [database, setDatabase] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [ssl, setSsl] = useState(false);
  const [showPass, setShowPass] = useState(false);

  // UI state
  const [status, setStatus] = useState<null | { type: 'success' | 'error' | 'info'; message: string }>(null);
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [savedConns, setSavedConns] = useState<SavedConnection[]>([]);
  const [loadingConns, setLoadingConns] = useState(false);
  const [view, setView] = useState<'form' | 'tables'>('form');
  const [searchTable, setSearchTable] = useState('');

  const overlayRef = useRef<HTMLDivElement>(null);

  const headers = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  });

  // Load saved connections
  const loadConnections = useCallback(async () => {
    if (!token) return;
    setLoadingConns(true);
    try {
      const res = await fetch(`${BASE_URL}/db/connections`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setSavedConns(data.connections || []);
      }
    } catch {
      // silently ignore
    } finally {
      setLoadingConns(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { loadConnections(); }, [loadConnections]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const populateForm = (conn: SavedConnection) => {
    setHost(conn.host);
    setPort(conn.port);
    setDatabase(conn.database);
    setUsername(conn.username);
    setSsl(conn.ssl);
    setName(conn.name);
    setPassword('');
    setView('form');
    setStatus({ type: 'info', message: 'Fill in the password and click Connect.' });
  };

  const handleTest = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const res = await fetch(`${BASE_URL}/db/test`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ host, port: parseInt(port) || 5432, database, username, password, ssl, name }),
      });
      const data = await res.json();
      setStatus({
        type: data.success ? 'success' : 'error',
        message: data.message || (data.success ? 'Connection successful!' : 'Connection failed.'),
      });
    } catch {
      setStatus({ type: 'error', message: 'Network error. Please try again.' });
    } finally {
      setTesting(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setStatus(null);
    try {
      const res = await fetch(`${BASE_URL}/db/connect`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ host, port: parseInt(port) || 5432, database, username, password, ssl, name }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setStatus({ type: 'error', message: data.error || 'Connection failed.' });
        return;
      }
      setActiveConnectionId(data.connection_id);
      setTables(data.tables || []);
      setView('tables');
      setStatus({ type: 'success', message: `Connected! ${data.tables?.length ?? 0} table(s) found.` });
      loadConnections();
      // Notify parent so it can open the DB sidebar
      onConnected?.(data.connection_id, data.name || name, data.tables || []);
    } catch {
      setStatus({ type: 'error', message: 'Network error. Please try again.' });
    } finally {
      setConnecting(false);
    }
  };

  const handleDeleteConnection = async (connId: string) => {
    try {
      await fetch(`${BASE_URL}/db/connection?connection_id=${connId}`, {
        method: 'DELETE',
        headers: headers(),
      });
      setSavedConns(prev => prev.filter(c => c.connection_id !== connId));
      if (activeConnectionId === connId) {
        setActiveConnectionId(null);
        setTables([]);
        setView('form');
      }
    } catch {
      // silently ignore
    }
  };

  const handleLoadTables = async (connId: string) => {
    setStatus(null);
    setConnecting(true);
    try {
      const res = await fetch(`${BASE_URL}/db/tables?connection_id=${connId}`, { headers: headers() });
      const data = await res.json();
      if (res.ok) {
        setActiveConnectionId(connId);
        setTables(data.tables || []);
        setView('tables');
        setStatus({ type: 'success', message: `${data.tables?.length ?? 0} table(s) loaded.` });
        // Notify parent — same as a fresh Connect — so DBSidebar opens
        const connMeta = savedConns.find(c => c.connection_id === connId);
        onConnected?.(connId, connMeta?.name || connId, data.tables || []);
      } else {
        setStatus({ type: 'error', message: data.error || 'Failed to load tables.' });
      }
    } catch {
      setStatus({ type: 'error', message: 'Network error.' });
    } finally {
      setConnecting(false);
    }
  };

  const filteredTables = tables.filter(t =>
    !searchTable || t.name.toLowerCase().includes(searchTable.toLowerCase())
  );

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text)',
    fontSize: '13px',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        ref={overlayRef}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {/* Modal */}
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'relative',
            width: '680px',
            maxWidth: 'calc(100vw - 32px)',
            maxHeight: '90vh',
            background: 'var(--main-bg)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            boxShadow: 'var(--shadow)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* ── Header ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '16px 20px', borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '8px',
              background: 'linear-gradient(135deg, var(--accent), #1a7ab8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
              flexShrink: 0,
            }}>
              <DatabaseIcon />
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>Connect Database</h2>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-faint)' }}>PostgreSQL connection manager</p>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', background: 'var(--surface)', borderRadius: '8px', padding: '3px' }}>
              {(['form', 'tables'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setView(tab)}
                  style={{
                    padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                    background: view === tab ? 'var(--accent)' : 'transparent',
                    color: view === tab ? 'white' : 'var(--text-muted)',
                    transition: 'all 0.15s',
                    cursor: 'pointer', border: 'none',
                  }}
                >
                  {tab === 'form' ? 'Connect' : `Tables${tables.length ? ` (${tables.length})` : ''}`}
                </button>
              ))}
            </div>

            <button
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', borderRadius: '6px' }}
            >
              <XIcon size={18} />
            </button>
          </div>

          {/* ── Body ── */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

            {/* Status banner */}
            {status && (
              <div style={{
                margin: '12px 20px 0',
                padding: '9px 12px',
                borderRadius: '8px',
                fontSize: '13px',
                display: 'flex', alignItems: 'center', gap: '8px',
                background: status.type === 'success' ? '#10b98118' : status.type === 'error' ? '#ef444418' : 'var(--surface)',
                border: `1px solid ${status.type === 'success' ? '#10b981' : status.type === 'error' ? '#ef4444' : 'var(--border)'}`,
                color: status.type === 'success' ? '#10b981' : status.type === 'error' ? '#ef4444' : 'var(--text)',
                flexShrink: 0,
              }}>
                {status.type === 'success' && <CheckIcon />}
                {status.type === 'error' && <XIcon size={14} />}
                <span style={{ flex: 1 }}>{status.message}</span>
                <button onClick={() => setStatus(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, color: 'inherit' }}>
                  <XIcon size={12} />
                </button>
              </div>
            )}

            {view === 'form' && (
              <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Saved connections */}
                {savedConns.length > 0 && (
                  <div>
                    <p style={{ ...labelStyle, marginBottom: '8px' }}>Saved connections</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {savedConns.map(conn => (
                        <div
                          key={conn.connection_id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '8px 10px', borderRadius: '8px',
                            background: activeConnectionId === conn.connection_id ? 'rgba(var(--accent-rgb, 30 130 180) / 0.1)' : 'var(--surface)',
                            border: `1px solid ${activeConnectionId === conn.connection_id ? 'var(--accent)' : 'var(--border)'}`,
                          }}
                        >
                          {activeConnectionId === conn.connection_id && (
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: '13px', fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conn.name}</p>
                            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-faint)', fontFamily: 'monospace' }}>
                              {conn.host}:{conn.port}/{conn.database}
                            </p>
                          </div>
                          <button
                            onClick={() => handleLoadTables(conn.connection_id)}
                            disabled={connecting}
                            style={{
                              padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                              background: 'var(--accent)', color: 'white', border: 'none', cursor: 'pointer',
                              opacity: connecting ? 0.5 : 1,
                            }}
                          >
                            Open
                          </button>
                          <button
                            onClick={() => populateForm(conn)}
                            style={{
                              padding: '4px 8px', borderRadius: '6px', fontSize: '11px',
                              background: 'var(--surface-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer',
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteConnection(conn.connection_id)}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      ))}
                    </div>
                    <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '12px 0 0' }} />
                  </div>
                )}

                {/* Connection name */}
                <div>
                  <label style={labelStyle}>Connection name (optional)</label>
                  <input
                    style={inputStyle}
                    placeholder="e.g. My Production DB"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                  />
                </div>

                {/* Host + Port */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Host *</label>
                    <input style={inputStyle} placeholder="localhost or db.example.com" value={host}
                      onChange={e => setHost(e.target.value)}
                      onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                      onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Port</label>
                    <input style={inputStyle} placeholder="5432" value={port}
                      onChange={e => setPort(e.target.value)}
                      onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                      onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                    />
                  </div>
                </div>

                {/* Database */}
                <div>
                  <label style={labelStyle}>Database name *</label>
                  <input style={inputStyle} placeholder="postgres" value={database}
                    onChange={e => setDatabase(e.target.value)}
                    onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                  />
                </div>

                {/* Username + Password */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Username *</label>
                    <input style={inputStyle} placeholder="postgres" value={username}
                      onChange={e => setUsername(e.target.value)} autoComplete="username"
                      onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                      onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Password *</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        style={{ ...inputStyle, paddingRight: '36px' }}
                        type={showPass ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        autoComplete="current-password"
                        onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                        onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(v => !v)}
                        style={{
                          position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px',
                        }}
                      >
                        <EyeIcon visible={showPass} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* SSL toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setSsl(v => !v)}
                    style={{
                      width: '36px', height: '20px', borderRadius: '10px', border: 'none',
                      background: ssl ? 'var(--accent)' : 'var(--border)',
                      position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: '3px', left: ssl ? '19px' : '3px',
                      width: '14px', height: '14px', borderRadius: '50%', background: 'white',
                      transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }} />
                  </button>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>SSL / TLS</span>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '8px', paddingTop: '4px' }}>
                  <button
                    onClick={handleTest}
                    disabled={testing || !host || !database || !username || !password}
                    style={{
                      flex: 1, padding: '9px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                      background: 'var(--surface)', color: 'var(--text)',
                      border: '1px solid var(--border)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      opacity: (!host || !database || !username || !password) ? 0.5 : 1,
                    }}
                  >
                    {testing ? <SpinnerIcon /> : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                      </svg>
                    )}
                    {testing ? 'Testing…' : 'Test Connection'}
                  </button>

                  <button
                    onClick={handleConnect}
                    disabled={connecting || !host || !database || !username || !password}
                    style={{
                      flex: 1, padding: '9px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                      background: 'var(--accent)', color: 'white', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      opacity: (!host || !database || !username || !password) ? 0.5 : 1,
                    }}
                  >
                    {connecting ? <SpinnerIcon /> : <DatabaseIcon />}
                    {connecting ? 'Connecting…' : 'Connect'}
                  </button>
                </div>
              </div>
            )}

            {view === 'tables' && (
              <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {tables.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-faint)' }}>
                    <DatabaseIcon />
                    <p style={{ marginTop: '8px' }}>No tables found</p>
                  </div>
                ) : (
                  <>
                    {/* Search */}
                    <input
                      style={{ ...inputStyle }}
                      placeholder="Search tables…"
                      value={searchTable}
                      onChange={e => setSearchTable(e.target.value)}
                      onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                      onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                    />

                    {/* Summary row */}
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-faint)' }}>
                      {filteredTables.length} of {tables.length} table{tables.length !== 1 ? 's' : ''}
                      {activeConnectionId && (
                        <span style={{ marginLeft: '8px', color: '#10b981', fontWeight: 600 }}>● Connected</span>
                      )}
                    </p>

                    {/* Tables */}
                    <div>
                      {filteredTables.map(table => (
                        <TableRow key={table.name} table={table} connectionId={activeConnectionId || ''} />
                      ))}
                    </div>

                    {/* Reload button */}
                    {activeConnectionId && (
                      <button
                        onClick={() => handleLoadTables(activeConnectionId)}
                        disabled={connecting}
                        style={{
                          padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                          background: 'var(--surface)', color: 'var(--text-muted)',
                          border: '1px solid var(--border)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        }}
                      >
                        {connecting ? <SpinnerIcon /> : (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                          </svg>
                        )}
                        Refresh tables
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div style={{
            padding: '10px 20px', borderTop: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-faint)' }}>PostgreSQL · pg8000 driver</p>
            <button
              onClick={onClose}
              style={{
                padding: '6px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
                background: 'var(--surface)', color: 'var(--text-muted)',
                border: '1px solid var(--border)', cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
