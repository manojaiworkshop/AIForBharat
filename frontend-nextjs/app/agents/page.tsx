'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import AgentInitModal from '../components/AgentInitModal';
import type { SemanticTable } from '../components/SemanticLayerSidebar';

const AGENT_API =
  process.env.NEXT_PUBLIC_AGENT_REPO_URL ??
  'https://wszjxhysdh.execute-api.eu-north-1.amazonaws.com/Prod';

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ??
  'https://sleocl2mk5.execute-api.eu-north-1.amazonaws.com/Prod/chat'
).replace(/\/chat$/, '');

const RAG_API =
  process.env.NEXT_PUBLIC_RAG_API_URL ?? '';

const RAG_WS_URL =
  process.env.NEXT_PUBLIC_RAG_WS_URL ?? '';

// ── Section type ───────────────────────────────────────────────
type Section = 'agents' | 'csv' | 'database' | 'rag' | 'access';

// ── Types ─────────────────────────────────────────────────────
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

interface CsvTable {
  table_id: string;
  pg_table_name: string;
  file_name: string;
  columns: string[];
  row_count?: number;
}

interface DbConnection {
  connection_id: string;
  name: string;
  host: string;
  port?: number;
  database: string;
  username?: string;
}

interface DbTable {
  name: string;
  columns: { name: string }[];
}

interface RagAgentRecord {
  agent_id: string;
  agent_name: string;
  agent_type: 'rag';
  status: string;
  created_at?: string;
  updated_at?: string;
  file_count?: number;
  indexed_files?: number;
  total_chunks?: number;
  qdrant_collection?: string;
  description?: string;
  owner_id?: string;
}

interface RagFileRecord {
  file_id: string;
  agent_id: string;
  filename: string;
  s3_key: string;
  file_size?: number;
  content_type?: string;
  status: string;
  chunk_count?: number;
  created_at?: string;
}

// ── Helpers ───────────────────────────────────────────────────
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fileExt(name: string) {
  const parts = name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'csv';
}

// ── Shared UI ─────────────────────────────────────────────────
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: color + '22', color }}>
      {label}
    </span>
  );
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

function Spinner() {
  return <div className="animate-spin w-7 h-7 rounded-full border-2 border-[var(--accent)] border-t-transparent" />;
}

function SmallSpinner() {
  return <div className="animate-spin w-4 h-4 rounded-full border-2 border-[var(--accent)] border-t-transparent" />;
}

// ── Left Sidebar ──────────────────────────────────────────────
function AgentSidebar({
  agentCount, userName, userInitial, active, onSelect,
}: {
  agentCount: number;
  userName: string;
  userInitial: string;
  active: Section;
  onSelect: (s: Section) => void;
}) {
  const router = useRouter();

  const navItems: { id: Section; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      id: 'agents',
      label: 'SQL Agents',
      badge: agentCount,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="12 2 2 7 12 12 22 7 12 2"/>
          <polyline points="2 17 12 22 22 17"/>
          <polyline points="2 12 12 17 22 12"/>
        </svg>
      ),
    },
    {
      id: 'rag',
      label: 'RAG Agents',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
      ),
    },
    {
      id: 'csv',
      label: 'Upload CSV',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="16 16 12 12 8 16"/>
          <line x1="12" y1="12" x2="12" y2="21"/>
          <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
        </svg>
      ),
    },
    {
      id: 'database',
      label: 'Connect Database',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <ellipse cx="12" cy="5" rx="9" ry="3"/>
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
        </svg>
      ),
    },
    {
      id: 'access' as Section,
      label: 'Agent Access',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
      ),
    },
  ];

  return (
    <aside className="flex flex-col h-full w-56 flex-shrink-0"
      style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => router.push('/')}
          className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
          style={{ color: 'var(--text-muted)' }} title="Back to chat">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ color: 'var(--accent)', flexShrink: 0 }}>
          <polygon points="12 2 2 7 12 12 22 7 12 2"/>
          <polyline points="2 17 12 22 22 17"/>
          <polyline points="2 12 12 17 22 12"/>
        </svg>
        <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>My Agents</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navItems.map(item => {
          const isActive = active === item.id;
          return (
            <button key={item.id}
              onClick={() => onSelect(item.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
              style={{
                background: isActive ? 'var(--accent)1a' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: isActive ? 600 : 400,
                borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              }}>
              {item.icon}
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge !== undefined && (
                <span className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{
                    background: isActive ? 'var(--accent)33' : 'var(--border)',
                    color: isActive ? 'var(--accent)' : 'var(--text-faint)',
                  }}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--accent), #1a7ab8)' }}>
            {userInitial}
          </div>
          <p className="text-xs truncate font-medium" style={{ color: 'var(--text-muted)' }}>{userName}</p>
        </div>
      </div>
    </aside>
  );
}

// ── Agent Detail Modal ─────────────────────────────────────────
function AgentDetailModal({ agent, onClose }: { agent: AgentRecord; onClose: () => void }) {
  const [ontology, setOntology]               = useState<string | null>(null);
  const [loadingOntology, setLoadingOntology] = useState(true);

  useEffect(() => {
    fetch(`${AGENT_API}/agents/${agent.agent_id}/ontology`)
      .then(r => r.json())
      .then(d => setOntology(d.ontology_yaml || 'No ontology available'))
      .catch(() => setOntology('Error loading ontology'))
      .finally(() => setLoadingOntology(false));
  }, []);

  const connInfo = agent.connection_info || {};
  const tables   = agent.selected_tables || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="rounded-xl w-full max-w-2xl flex flex-col"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>{agent.agent_name}</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--text-muted)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {([
              ['Agent ID',   agent.agent_id],
              ['Status',     agent.status],
              ['Created',    agent.created_at ? new Date(agent.created_at).toLocaleString() : '—'],
              ['Source',     connInfo.source_type ?? '—'],
              ['Connection', connInfo.connectionName || connInfo.source_type || '—'],
              ['Neo4j DB',   agent.neo4j_db_name || '—'],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="rounded-lg px-3 py-2" style={{ background: 'var(--main-bg)' }}>
                <p className="text-xs mb-0.5 font-medium" style={{ color: 'var(--text-faint)' }}>{k}</p>
                <p className="text-xs font-mono break-all" style={{ color: 'var(--text-muted)' }}>{v}</p>
              </div>
            ))}
          </div>
          {tables.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-faint)' }}>
                Selected Tables ({tables.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {tables.map((t, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-md text-xs font-mono"
                    style={{ background: 'var(--main-bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    {t.tableName || t.table_name || '—'}
                  </span>
                ))}
              </div>
            </div>
          )}
          {agent.error_message && (
            <div className="rounded-lg px-4 py-3 text-xs text-red-400"
              style={{ background: '#ef444422', border: '1px solid #ef444444' }}>
              {agent.error_message}
            </div>
          )}
          <div>
            <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-faint)' }}>Ontology YAML</p>
            {loadingOntology ? (
              <div className="flex justify-center py-4"><Spinner /></div>
            ) : (
              <pre className="rounded-lg px-4 py-3 text-xs overflow-auto"
                style={{ background: 'var(--main-bg)', color: 'var(--text-muted)', maxHeight: '240px', fontFamily: 'monospace', border: '1px solid var(--border)' }}>
                {ontology}
              </pre>
            )}
          </div>
        </div>
        <div className="px-5 py-3 flex justify-end flex-shrink-0"
          style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--surface-hover)] transition-colors"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Ontology YAML Editor Drawer ────────────────────────────────
function OntologyEditorDrawer({ agent, onClose }: { agent: AgentRecord; onClose: () => void }) {
  const [yaml, setYaml]             = useState('');
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [replace, setReplace]       = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef   = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch(`${AGENT_API}/agents/${agent.agent_id}/ontology`)
      .then(r => r.json())
      .then(d => { setYaml(d.ontology_yaml ?? ''); setLoading(false); })
      .catch(() => { setError('Failed to load ontology'); setLoading(false); });
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); setSearchOpen(v => !v); }
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [yaml]);

  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);

  async function handleSave() {
    setSaving(true); setError('');
    try {
      const res = await fetch(`${AGENT_API}/agents/${agent.agent_id}/ontology`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ontology_yaml: yaml }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error saving');
    } finally { setSaving(false); }
  }

  function doReplace() {
    if (!search) return;
    setYaml(prev => prev.split(search).join(replace));
  }

  return (
    <div className="fixed inset-0 z-50 flex" style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}>
      <div className="ml-auto flex flex-col w-full max-w-2xl h-full shadow-2xl"
        style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>Edit Ontology YAML</p>
            <p className="text-xs truncate" style={{ color: 'var(--text-faint)' }}>{agent.agent_name}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={() => setSearchOpen(v => !v)}
              className="px-2.5 py-1.5 rounded-lg text-xs hover:bg-[var(--surface-hover)] transition-colors flex items-center gap-1.5"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              title="Search & Replace (Ctrl+F)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              Find
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ background: saved ? '#10b981' : 'var(--accent)', color: '#fff' }}>
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save  Ctrl+S'}
            </button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-[var(--surface-hover)]"
              style={{ color: 'var(--text-muted)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Search/Replace */}
        {searchOpen && (
          <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0"
            style={{ background: 'var(--main-bg)', borderBottom: '1px solid var(--border)' }}>
            <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Find…" className="flex-1 rounded px-2 py-1 text-xs"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }} />
            <input value={replace} onChange={e => setReplace(e.target.value)}
              placeholder="Replace with…" className="flex-1 rounded px-2 py-1 text-xs"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }} />
            <button onClick={doReplace}
              className="px-2.5 py-1 rounded text-xs font-semibold flex-shrink-0"
              style={{ background: 'var(--accent)', color: '#fff' }}>
              Replace all
            </button>
          </div>
        )}

        {error && (
          <div className="mx-4 mt-3 px-3 py-2 rounded text-xs text-red-400 flex-shrink-0"
            style={{ background: '#ef444422', border: '1px solid #ef444444' }}>
            {error}
          </div>
        )}

        {/* Textarea */}
        <div style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '12px 16px' }}>
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : (
            <textarea ref={textareaRef} value={yaml} onChange={e => setYaml(e.target.value)}
              spellCheck={false}
              style={{
                flex: '1 1 0', minHeight: 0, overflowY: 'auto', resize: 'none',
                fontFamily: 'ui-monospace, monospace', fontSize: '12px', lineHeight: '1.6',
                background: 'var(--main-bg)', color: 'var(--text)',
                border: '1px solid var(--border)', borderRadius: '8px',
                padding: '12px', outline: 'none',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Rename Modal ───────────────────────────────────────────────
function RenameModal({ agent, onClose, onSaved }: {
  agent: AgentRecord; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName]     = useState(agent.agent_name);
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) { setErr('Name required'); return; }
    setSaving(true); setErr('');
    try {
      const res = await fetch(`${AGENT_API}/agents/${agent.agent_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_name: trimmed }),
      });
      if (!res.ok) throw new Error('Failed to rename');
      onSaved();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="rounded-xl w-full max-w-md p-5 space-y-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Rename agent</h2>
        <input autoFocus value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--main-bg)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }} />
        {err && <p className="text-xs text-red-400">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'var(--accent)' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Dialog ──────────────────────────────────────────────
function DeleteDialog({ agent, onClose, onDeleted }: {
  agent: AgentRecord; onClose: () => void; onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [err, setErr]           = useState('');

  async function confirm() {
    setDeleting(true); setErr('');
    try {
      const res = await fetch(`${AGENT_API}/agents/${agent.agent_id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      onDeleted();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Error'); setDeleting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="rounded-xl w-full max-w-md p-5 space-y-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Delete agent?</h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          <strong>{agent.agent_name}</strong> will be permanently deleted including its ontology and Neo4j database.
        </p>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancel</button>
          <button onClick={confirm} disabled={deleting}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#ef4444' }}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Agent Visibility Types ────────────────────────────────────
interface AgentPermItem {
  agent_id: string;
  visibility: 'public' | 'private';
  shared_with: string[];
}

// ── Agents List (right-panel content) ─────────────────────────
function AgentsListSection({
  userId,
  token,
  onCountChange,
}: {
  userId: string;
  token: string;
  onCountChange: (n: number) => void;
}) {
  const [agents, setAgents]               = useState<AgentRecord[]>([]);
  const [loading, setLoading]             = useState(true);
  const [err, setErr]                     = useState('');
  const [statusFilter, setStatusFilter]   = useState('all');
  const [viewAgent, setViewAgent]         = useState<AgentRecord | null>(null);
  const [renameAgent, setRenameAgent]     = useState<AgentRecord | null>(null);
  const [deleteAgent, setDeleteAgent]     = useState<AgentRecord | null>(null);
  const [ontologyAgent, setOntologyAgent] = useState<AgentRecord | null>(null);
  const [permsMap, setPermsMap]           = useState<Record<string, AgentPermItem>>({});
  const [shareTarget, setShareTarget]     = useState<AgentRecord | null>(null);
  const [shareEmail, setShareEmail]       = useState('');
  const [shareErr, setShareErr]           = useState('');
  const [shareLoading, setShareLoading]   = useState(false);
  const [savingPermId, setSavingPermId]   = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      let url = `${AGENT_API}/agents?owner_id=${encodeURIComponent(userId)}`;
      if (statusFilter !== 'all') url += `&status=${statusFilter}`;
      const res  = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      const list: AgentRecord[] = data.agents ?? [];
      setAgents(list);
      onCountChange(list.length);
      // Load permissions for all agents
      if (list.length > 0) {
        // Fetch each agent's permission in parallel using the /admin/agent-permissions/{id} route
        const permResults = await Promise.allSettled(
          list.map((a: AgentRecord) =>
            fetch(`${API_BASE}/admin/agent-permissions/${a.agent_id}`, {
              headers: { Authorization: `Bearer ${token}` },
            }).then(r => r.json())
          )
        );
        const map: Record<string, AgentPermItem> = {};
        list.forEach((a: AgentRecord, idx: number) => {
          const r = permResults[idx];
          if (r.status === 'fulfilled' && r.value?.permissions) {
            map[a.agent_id] = r.value.permissions;
          } else {
            map[a.agent_id] = { agent_id: a.agent_id, visibility: 'private', shared_with: [] };
          }
        });
        setPermsMap(map);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error loading agents');
    } finally { setLoading(false); }
  }, [userId, statusFilter, onCountChange, token]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  async function toggleVisibility(agent: AgentRecord, current: 'public' | 'private') {
    const next = current === 'public' ? 'private' : 'public';
    setSavingPermId(agent.agent_id);
    try {
      const res = await fetch(`${API_BASE}/admin/agent-permissions/${agent.agent_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ visibility: next }),
      });
      if (res.ok) {
        setPermsMap(prev => ({ ...prev, [agent.agent_id]: { ...(prev[agent.agent_id] || { agent_id: agent.agent_id, shared_with: [] }), visibility: next } }));
      }
    } finally {
      setSavingPermId(null);
    }
  }

  async function addShare() {
    if (!shareTarget || !shareEmail.trim()) return;
    setShareLoading(true); setShareErr('');
    try {
      const res = await fetch(`${API_BASE}/admin/agent-permissions/${shareTarget.agent_id}/share`, {
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
      const res = await fetch(`${API_BASE}/admin/agent-permissions/${agentId}/share`, {
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

  return (
    <>
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {['all', 'ready', 'initializing', 'error'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize"
                style={{
                  background: statusFilter === s ? 'var(--accent)' : 'var(--surface)',
                  color:      statusFilter === s ? '#fff' : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                }}>
                {s}
              </button>
            ))}
          </div>
          <button onClick={fetchAgents}
            className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
            style={{ color: 'var(--text-muted)' }} title="Refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
        </div>

        {err && (
          <div className="rounded-lg px-4 py-3 text-sm text-red-400"
            style={{ background: '#ef444422', border: '1px solid #ef444444' }}>
            {err}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"
              style={{ color: 'var(--text-faint)' }}>
              <polygon points="12 2 2 7 12 12 22 7 12 2"/>
              <polyline points="2 17 12 22 22 17"/>
              <polyline points="2 12 12 17 22 12"/>
            </svg>
            <p className="text-sm" style={{ color: 'var(--text-faint)' }}>
              No agents yet — create one from Upload CSV or Connect Database
            </p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden"
            style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
            {/* Header row */}
            <div className="grid gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wider"
              style={{ gridTemplateColumns: '1fr 80px 50px 90px 70px 100px 130px', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' }}>
              <div>Agent</div>
              <div>Status</div>
              <div>Tables</div>
              <div>Source</div>
              <div>Created</div>
              <div>Visibility</div>
              <div className="text-right">Actions</div>
            </div>

            {agents.map((a, i) => {
              const connInfo    = a.connection_info || {};
              const sourceLabel = connInfo.source_type === 'csv'
                ? '📄 CSV'
                : connInfo.source_type === 'database'
                  ? `🗄️ ${connInfo.connectionName || 'DB'}`
                  : '—';
              const perm = permsMap[a.agent_id] || { agent_id: a.agent_id, visibility: 'private', shared_with: [] };
              const isPublic = perm.visibility === 'public';
              return (
                <div key={a.agent_id}
                  className="grid gap-3 items-center px-4 py-3 hover:bg-[var(--surface-hover)] transition-colors"
                  style={{ gridTemplateColumns: '1fr 80px 50px 90px 70px 100px 130px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>

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

                  {/* Visibility toggle */}
                  <div>
                    <button
                      onClick={() => toggleVisibility(a, perm.visibility as 'public' | 'private')}
                      disabled={savingPermId === a.agent_id}
                      title={isPublic ? 'Click to make Private' : 'Click to make Public'}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold transition-all disabled:opacity-50"
                      style={{
                        background: isPublic ? '#10b98120' : '#6b728018',
                        color: isPublic ? '#10b981' : '#9ca3af',
                        border: `1px solid ${isPublic ? '#10b98133' : '#6b728033'}`,
                      }}
                    >
                      {savingPermId === a.agent_id ? (
                        <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
                      ) : isPublic ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                      )}
                      {isPublic ? 'Public' : 'Private'}
                    </button>
                  </div>

                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => { setShareTarget(a); setShareEmail(''); setShareErr(''); }}
                      className="p-1.5 rounded-lg hover:bg-[var(--main-bg)] transition-colors"
                      style={{ color: 'var(--accent)' }} title="Share agent">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                    </button>
                    <button onClick={() => setViewAgent(a)}
                      className="p-1.5 rounded-lg hover:bg-[var(--main-bg)] transition-colors"
                      style={{ color: 'var(--text-muted)' }} title="View details">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    </button>
                    <button onClick={() => setRenameAgent(a)}
                      className="p-1.5 rounded-lg hover:bg-[var(--main-bg)] transition-colors"
                      style={{ color: 'var(--text-muted)' }} title="Rename">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    {a.ontology_s3_uri && a.ontology_s3_uri !== 'memory' && (
                      <button onClick={() => setOntologyAgent(a)}
                        className="p-1.5 rounded-lg hover:bg-[var(--main-bg)] transition-colors"
                        style={{ color: 'var(--accent)' }} title="Edit ontology YAML">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                          <line x1="16" y1="13" x2="8" y2="13"/>
                          <line x1="16" y1="17" x2="8" y2="17"/>
                        </svg>
                      </button>
                    )}
                    <button onClick={() => setDeleteAgent(a)}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                      style={{ color: '#ef4444' }} title="Delete">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                        <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {viewAgent     && <AgentDetailModal    agent={viewAgent}    onClose={() => setViewAgent(null)} />}
      {renameAgent   && <RenameModal         agent={renameAgent}  onClose={() => setRenameAgent(null)} onSaved={() => { setRenameAgent(null); fetchAgents(); }} />}
      {deleteAgent   && <DeleteDialog        agent={deleteAgent}  onClose={() => setDeleteAgent(null)} onDeleted={() => { setDeleteAgent(null); fetchAgents(); }} />}
      {ontologyAgent && <OntologyEditorDrawer agent={ontologyAgent} onClose={() => setOntologyAgent(null)} />}

      {/* Share modal */}
      {shareTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-xl w-full max-w-md p-5 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Share &quot;{shareTarget.agent_name}&quot;</h2>
              <button onClick={() => setShareTarget(null)} className="p-1 rounded hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-muted)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Enter a user&apos;s email to grant them access to this agent.
            </p>
            <div className="flex gap-2">
              <input
                value={shareEmail}
                onChange={e => setShareEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addShare()}
                placeholder="user@example.com"
                className="flex-1 px-3 py-2 rounded-lg text-sm border outline-none"
                style={{ background: 'var(--main-bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
              />
              <button
                onClick={addShare}
                disabled={shareLoading || !shareEmail.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {shareLoading ? '…' : 'Add'}
              </button>
            </div>
            {shareErr && <p className="text-xs text-red-400">{shareErr}</p>}

            {(() => {
              const list = permsMap[shareTarget.agent_id]?.shared_with ?? [];
              if (list.length === 0) return null;
              return (
                <div className="space-y-1">
                  <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Shared with:</p>
                  {list.map(u => (
                    <div key={u} className="flex items-center justify-between px-3 py-2 rounded-lg"
                      style={{ background: 'var(--main-bg)', border: '1px solid var(--border)' }}>
                      <span className="text-xs" style={{ color: 'var(--text)' }}>{u}</span>
                      <button onClick={() => removeShare(shareTarget.agent_id, u)}
                        className="text-xs text-red-400 hover:text-red-300">Remove</button>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="flex justify-end">
              <button onClick={() => setShareTarget(null)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              >Done</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── CSV Upload Section ─────────────────────────────────────────
function CsvSection({ userId, token }: { userId: string; token: string }) {
  const [tables, setTables]       = useState<CsvTable[]>([]);
  const [loading, setLoading]     = useState(true);
  const [err, setErr]             = useState('');
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [dragging, setDragging]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const [showInit, setShowInit]   = useState(false);
  const fileInputRef              = useRef<HTMLInputElement>(null);

  const fetchTables = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res  = await fetch(`${API_BASE}/csv/tables`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load tables');
      setTables(data.tables ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchTables(); }, [fetchTables]);

  function toggleTable(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function uploadFiles(files: File[]) {
    setUploading(true); setUploadErr('');
    const MAX_MB = 50;
    for (const file of files) {
      if (file.size > MAX_MB * 1024 * 1024) {
        setUploadErr(`${file.name} exceeds ${MAX_MB}MB limit`);
        continue;
      }
      try {
        const b64 = await fileToBase64(file);
        const res = await fetch(`${API_BASE}/csv/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            file_name:    file.name,
            file_content: b64,
            file_type:    fileExt(file.name),
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          setUploadErr(d.error || `Upload failed: ${res.status}`);
        }
      } catch (e: unknown) {
        setUploadErr(e instanceof Error ? e.message : 'Upload error');
      }
    }
    setUploading(false);
    fetchTables();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.name.endsWith('.csv') || f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
    );
    if (files.length) uploadFiles(files);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) uploadFiles(files);
    e.target.value = '';
  }

  const selectedTables: SemanticTable[] = tables
    .filter(t => selected.has(t.table_id))
    .map(t => ({
      id: `csv:${t.table_id}`,
      source: 'csv' as const,
      tableName: t.pg_table_name,
      sourceName: t.file_name,
      columns: t.columns ?? [],
      rowCount: t.row_count,
    }));

  return (
    <>
      <div className="space-y-5">
        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => fileInputRef.current?.click()}
          className="rounded-xl cursor-pointer transition-colors flex flex-col items-center justify-center gap-3 py-10"
          style={{
            border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
            background: dragging ? 'var(--accent)08' : 'var(--surface)',
          }}>
          {uploading ? (
            <Spinner />
          ) : (
            <>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                style={{ color: dragging ? 'var(--accent)' : 'var(--text-faint)' }}>
                <polyline points="16 16 12 12 8 16"/>
                <line x1="12" y1="12" x2="12" y2="21"/>
                <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
              </svg>
              <div className="text-center">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Drop CSV / Excel files here
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>or click to browse · max 50 MB per file</p>
              </div>
            </>
          )}
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" multiple className="hidden"
            onChange={handleFileInput} />
        </div>

        {uploadErr && (
          <div className="rounded-lg px-4 py-3 text-sm text-red-400"
            style={{ background: '#ef444422', border: '1px solid #ef444444' }}>
            {uploadErr}
          </div>
        )}

        {/* Tables list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              Your CSV Tables {tables.length > 0 && <span style={{ color: 'var(--text-faint)' }}>({tables.length})</span>}
            </h3>
            <button onClick={fetchTables} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
              style={{ color: 'var(--text-muted)' }} title="Refresh">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10"/>
                <polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0114.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0020.49 15"/>
              </svg>
            </button>
          </div>

          {err && (
            <div className="rounded-lg px-4 py-3 text-sm text-red-400 mb-3"
              style={{ background: '#ef444422', border: '1px solid #ef444444' }}>
              {err}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : tables.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"
                style={{ color: 'var(--text-faint)' }}>
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <p className="text-sm" style={{ color: 'var(--text-faint)' }}>No CSV tables yet — upload one above</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden"
              style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div className="grid gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                style={{ gridTemplateColumns: '32px 1fr 1fr 80px 80px', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' }}>
                <div />
                <div>File Name</div>
                <div>Table Name</div>
                <div>Columns</div>
                <div>Rows</div>
              </div>
              {tables.map((t, i) => (
                <div key={t.table_id}
                  className="grid gap-3 items-center px-4 py-3 hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                  style={{ gridTemplateColumns: '32px 1fr 1fr 80px 80px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}
                  onClick={() => toggleTable(t.table_id)}>
                  <div>
                    <div className="w-4 h-4 rounded border-2 flex items-center justify-center transition-colors"
                      style={{
                        background: selected.has(t.table_id) ? 'var(--accent)' : 'transparent',
                        borderColor: selected.has(t.table_id) ? 'var(--accent)' : 'var(--border)',
                      }}>
                      {selected.has(t.table_id) && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </div>
                  </div>
                  <div className="text-sm truncate" style={{ color: 'var(--text)' }}>{t.file_name}</div>
                  <div className="text-xs font-mono truncate" style={{ color: 'var(--text-muted)' }}>{t.pg_table_name}</div>
                  <div className="text-xs" style={{ color: 'var(--text-faint)' }}>{t.columns?.length ?? '—'}</div>
                  <div className="text-xs" style={{ color: 'var(--text-faint)' }}>{t.row_count?.toLocaleString() ?? '—'}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create Agent Button */}
        {selected.size > 0 && (
          <div className="flex items-center justify-between rounded-xl px-4 py-3"
            style={{ background: 'var(--accent)11', border: '1px solid var(--accent)44' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
              {selected.size} table{selected.size > 1 ? 's' : ''} selected
            </p>
            <button
              onClick={() => setShowInit(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
              style={{ background: 'var(--accent)' }}>
              Create Agent →
            </button>
          </div>
        )}
      </div>

      {showInit && (
        <AgentInitModal
          selectedTables={selectedTables}
          connectionInfo={{ source_type: 'csv' }}
          userId={userId}
          onClose={() => setShowInit(false)}
          onAgentCreated={() => { setShowInit(false); setSelected(new Set()); }}
        />
      )}
    </>
  );
}

// ── Connect Database Section ───────────────────────────────────
function DatabaseSection({ userId, token }: { userId: string; token: string }) {
  const [connections, setConnections]     = useState<DbConnection[]>([]);
  const [loadingConns, setLoadingConns]   = useState(true);
  const [connErr, setConnErr]             = useState('');
  const [activeConn, setActiveConn]       = useState<DbConnection | null>(null);
  const [dbTables, setDbTables]           = useState<DbTable[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [tableErr, setTableErr]           = useState('');
  const [selected, setSelected]           = useState<Set<string>>(new Set());
  const [showInit, setShowInit]           = useState(false);

  const fetchConnections = useCallback(async () => {
    setLoadingConns(true); setConnErr('');
    try {
      const res  = await fetch(`${API_BASE}/db/connections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load connections');
      setConnections(data.connections ?? []);
    } catch (e: unknown) {
      setConnErr(e instanceof Error ? e.message : 'Error');
    } finally { setLoadingConns(false); }
  }, [token]);

  useEffect(() => { fetchConnections(); }, [fetchConnections]);

  async function selectConnection(conn: DbConnection) {
    setActiveConn(conn);
    setDbTables([]); setSelected(new Set());
    setLoadingTables(true); setTableErr('');
    try {
      const res  = await fetch(`${API_BASE}/db/tables?connection_id=${conn.connection_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load tables');
      setDbTables(data.tables ?? []);
    } catch (e: unknown) {
      setTableErr(e instanceof Error ? e.message : 'Error');
    } finally { setLoadingTables(false); }
  }

  function toggleTable(name: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  const selectedTables: SemanticTable[] = activeConn
    ? dbTables
        .filter(t => selected.has(t.name))
        .map(t => ({
          id: `db:${activeConn.connection_id}:${t.name}`,
          source: 'database' as const,
          tableName: t.name,
          sourceName: activeConn.name,
          columns: t.columns.map(c => c.name),
        }))
    : [];

  return (
    <>
      <div className="space-y-5">
        {/* Connections */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              Saved Connections {connections.length > 0 && <span style={{ color: 'var(--text-faint)' }}>({connections.length})</span>}
            </h3>
            <button onClick={fetchConnections} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
              style={{ color: 'var(--text-muted)' }} title="Refresh">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10"/>
                <polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0114.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0020.49 15"/>
              </svg>
            </button>
          </div>

          {connErr && (
            <div className="rounded-lg px-4 py-3 text-sm text-red-400 mb-3"
              style={{ background: '#ef444422', border: '1px solid #ef444444' }}>
              {connErr}
            </div>
          )}

          {loadingConns ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : connections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"
                style={{ color: 'var(--text-faint)' }}>
                <ellipse cx="12" cy="5" rx="9" ry="3"/>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
              </svg>
              <p className="text-sm" style={{ color: 'var(--text-faint)' }}>No saved connections — add one from the chat window</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {connections.map(conn => {
                const isActive = activeConn?.connection_id === conn.connection_id;
                return (
                  <button key={conn.connection_id}
                    onClick={() => selectConnection(conn)}
                    className="w-full rounded-xl px-4 py-3 text-left transition-all"
                    style={{
                      background: isActive ? 'var(--accent)11' : 'var(--surface)',
                      border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                    }}>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0"
                        style={{ background: isActive ? 'var(--accent)22' : 'var(--main-bg)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          style={{ color: isActive ? 'var(--accent)' : 'var(--text-faint)' }}>
                          <ellipse cx="12" cy="5" rx="9" ry="3"/>
                          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate"
                          style={{ color: isActive ? 'var(--accent)' : 'var(--text)' }}>
                          {conn.name}
                        </p>
                        <p className="text-xs truncate" style={{ color: 'var(--text-faint)' }}>
                          {conn.host}:{conn.port ?? 5432} / {conn.database}
                        </p>
                      </div>
                      {isActive && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          style={{ color: 'var(--accent)', flexShrink: 0 }}>
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Tables for active connection */}
        {activeConn && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ color: 'var(--accent)' }}>
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
                <line x1="3" y1="15" x2="21" y2="15"/>
                <line x1="9" y1="9" x2="9" y2="21"/>
              </svg>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                Tables in <span style={{ color: 'var(--accent)' }}>{activeConn.name}</span>
                {dbTables.length > 0 && <span style={{ color: 'var(--text-faint)' }}> ({dbTables.length})</span>}
              </h3>
              {loadingTables && <SmallSpinner />}
            </div>

            {tableErr && (
              <div className="rounded-lg px-4 py-3 text-sm text-red-400 mb-3"
                style={{ background: '#ef444422', border: '1px solid #ef444444' }}>
                {tableErr}
              </div>
            )}

            {!loadingTables && dbTables.length === 0 && !tableErr && (
              <p className="text-sm text-center py-8" style={{ color: 'var(--text-faint)' }}>
                No tables found in this database
              </p>
            )}

            {dbTables.length > 0 && (
              <div className="rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <div className="grid gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                  style={{ gridTemplateColumns: '32px 1fr 80px', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' }}>
                  <div />
                  <div>Table Name</div>
                  <div>Columns</div>
                </div>
                {dbTables.map((t, i) => (
                  <div key={t.name}
                    className="grid gap-3 items-center px-4 py-3 hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                    style={{ gridTemplateColumns: '32px 1fr 80px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}
                    onClick={() => toggleTable(t.name)}>
                    <div>
                      <div className="w-4 h-4 rounded border-2 flex items-center justify-center transition-colors"
                        style={{
                          background: selected.has(t.name) ? 'var(--accent)' : 'transparent',
                          borderColor: selected.has(t.name) ? 'var(--accent)' : 'var(--border)',
                        }}>
                        {selected.has(t.name) && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </div>
                    </div>
                    <div className="text-sm font-mono truncate" style={{ color: 'var(--text)' }}>{t.name}</div>
                    <div className="text-xs" style={{ color: 'var(--text-faint)' }}>{t.columns?.length ?? '—'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Create Agent */}
        {selected.size > 0 && activeConn && (
          <div className="flex items-center justify-between rounded-xl px-4 py-3"
            style={{ background: 'var(--accent)11', border: '1px solid var(--accent)44' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
              {selected.size} table{selected.size > 1 ? 's' : ''} selected
            </p>
            <button
              onClick={() => setShowInit(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
              style={{ background: 'var(--accent)' }}>
              Create Agent →
            </button>
          </div>
        )}
      </div>

      {showInit && activeConn && (
        <AgentInitModal
          selectedTables={selectedTables}
          connectionInfo={{
            source_type:    'database',
            connectionId:   activeConn.connection_id,
            connectionName: activeConn.name,
            has_csv_tables: false,
          }}
          userId={userId}
          onClose={() => setShowInit(false)}
          onAgentCreated={() => { setShowInit(false); setSelected(new Set()); }}
        />
      )}
    </>
  );
}

// ── RAG Section ────────────────────────────────────────────────
function RagSection({ userId, token }: { userId: string; token: string }) {
  const [agents, setAgents]           = useState<RagAgentRecord[]>([]);
  const [loading, setLoading]         = useState(true);
  const [creating, setCreating]       = useState(false);
  const [newName, setNewName]         = useState('');
  const [selected, setSelected]       = useState<RagAgentRecord | null>(null);
  const [files, setFiles]             = useState<RagFileRecord[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [indexing, setIndexing]       = useState(false);
  const [indexLog, setIndexLog]       = useState<string[]>([]);
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [tab, setTab]                 = useState<'files' | 'chat'>('files');
  const [uploadErr, setUploadErr]     = useState('');
  const [err, setErr]                 = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  const baseUrl = RAG_API.replace(/\/$/, '');

  function notConfigured() { return !RAG_API; }

  async function loadAgents() {
    if (notConfigured()) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`${baseUrl}/rag/agents?owner_id=${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      setAgents(d.agents || []);
    } catch { setErr('Failed to load RAG agents'); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadAgents(); }, [userId]);

  async function createAgent() {
    if (!newName.trim() || notConfigured()) return;
    setCreating(true);
    try {
      const res = await fetch(`${baseUrl}/rag/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ agent_name: newName.trim(), user_id: userId }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error || 'Create failed'); return; }
      setNewName('');
      await loadAgents();
    } catch (e: any) { setErr(e.message); }
    finally { setCreating(false); }
  }

  async function deleteAgent(agentId: string) {
    if (!confirm('Delete this RAG agent and all its data?')) return;
    await fetch(`${baseUrl}/rag/agents/${agentId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    if (selected?.agent_id === agentId) setSelected(null);
    await loadAgents();
  }

  async function selectAgent(agent: RagAgentRecord) {
    setSelected(agent); setTab('files');
    setFilesLoading(true); setChatHistory([]); setIndexLog([]);
    try {
      const res = await fetch(`${baseUrl}/rag/agents/${agent.agent_id}/files`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      setFiles(d.files || []);
    } catch { setFiles([]); }
    finally { setFilesLoading(false); }
  }

  async function uploadFiles(fileList: FileList) {
    if (!selected) return;
    setUploading(true); setUploadErr('');
    const ALLOWED = ['pdf', 'docx', 'doc', 'txt', 'png', 'jpg', 'jpeg', 'webp', 'tiff'];
    for (const file of Array.from(fileList)) {
      const ext = fileExt(file.name);
      if (!ALLOWED.includes(ext)) { setUploadErr(`Unsupported: ${file.name}`); continue; }
      try {
        const b64 = await fileToBase64(file);
        await fetch(`${baseUrl}/rag/agents/${selected.agent_id}/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            filename: file.name,
            content_type: file.type || 'application/octet-stream',
            file_data: b64,
            file_size: file.size,
          }),
        });
      } catch { setUploadErr(`Upload failed: ${file.name}`); }
    }
    // Refresh file list
    const res2 = await fetch(`${baseUrl}/rag/agents/${selected.agent_id}/files`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d2 = await res2.json();
    setFiles(d2.files || []);
    setUploading(false);
  }

  async function deleteFile(fileId: string) {
    if (!selected) return;
    await fetch(`${baseUrl}/rag/agents/${selected.agent_id}/files/${fileId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    setFiles(prev => prev.filter(f => f.file_id !== fileId));
  }

  async function triggerIndex() {
    if (!selected || indexing) return;
    setIndexing(true); setIndexLog(['🚀 Starting indexing…']);

    // Use REST if no WS configured
    if (!RAG_WS_URL) {
      try {
        await fetch(`${baseUrl}/rag/agents/${selected.agent_id}/index`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({}),
        });
        setIndexLog(prev => [...prev, '✅ Indexing triggered. Check back in a minute.']);
      } catch (e: any) {
        setIndexLog(prev => [...prev, `❌ ${e.message}`]);
      }
      setIndexing(false);
      return;
    }

    // WebSocket path
    const ws = new WebSocket(`${RAG_WS_URL}?user_id=${encodeURIComponent(userId)}`);
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({
        action: 'start_rag_init',
        agent_id: selected.agent_id,
        user_id: userId,
      }));
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        const text = msg.message || JSON.stringify(msg);
        setIndexLog(prev => [...prev, text]);
        if (msg.type === 'agent_ready') {
          setIndexing(false);
          loadAgents();
          // Refresh selected
          if (selected) fetch(`${baseUrl}/rag/agents/${selected.agent_id}`, {
            headers: { Authorization: `Bearer ${token}` },
          }).then(r => r.json()).then(d => setSelected(d));
        }
        if (msg.type === 'agent_error') setIndexing(false);
      } catch {}
    };
    ws.onerror = () => {
      setIndexLog(prev => [...prev, '❌ WebSocket error']);
      setIndexing(false);
    };
  }

  async function sendChat() {
    if (!selected || !chatQuestion.trim() || chatLoading) return;
    const question = chatQuestion.trim();
    setChatQuestion('');
    setChatLoading(true);
    setChatHistory(prev => [...prev, { role: 'user', content: question }]);
    try {
      const res = await fetch(`${baseUrl}/rag/agents/${selected.agent_id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question, history: chatHistory }),
      });
      const d = await res.json();
      if (!res.ok) {
        setChatHistory(prev => [...prev, { role: 'assistant', content: `❌ ${d.error || 'Error'}` }]);
      } else {
        setChatHistory(prev => [...prev, { role: 'assistant', content: d.answer || '' }]);
      }
    } catch (e: any) {
      setChatHistory(prev => [...prev, { role: 'assistant', content: `❌ ${e.message}` }]);
    }
    setChatLoading(false);
  }

  function statusColor(s: string) {
    if (s === 'ready') return '#10b981';
    if (s === 'indexing') return '#3b82f6';
    if (s === 'error') return '#ef4444';
    return '#6b7280';
  }

  if (notConfigured()) return (
    <div className="rounded-xl p-6 border max-w-md" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>RAG API not configured</p>
      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
        Set <code>NEXT_PUBLIC_RAG_API_URL</code> in your environment to enable RAG agents.
      </p>
    </div>
  );

  return (
    <div className="flex gap-5 h-full">
      {/* Agents list */}
      <div className="flex flex-col gap-3 w-72 flex-shrink-0">
        {/* Create */}
        <div className="rounded-xl p-4 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>New RAG Agent</p>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createAgent()}
              placeholder="Agent name…"
              className="flex-1 px-2.5 py-1.5 rounded-lg text-sm border"
              style={{ background: 'var(--main-bg)', borderColor: 'var(--border)', color: 'var(--text)', outline: 'none' }}
            />
            <button
              onClick={createAgent}
              disabled={creating || !newName.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {creating ? '…' : '+'}
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex flex-col gap-2">
          {loading ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : agents.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>No RAG agents yet</p>
          ) : agents.map(agent => (
            <button
              key={agent.agent_id}
              onClick={() => selectAgent(agent)}
              className="w-full text-left rounded-xl p-3 border transition-colors"
              style={{
                background: selected?.agent_id === agent.agent_id ? 'var(--accent)1a' : 'var(--surface)',
                borderColor: selected?.agent_id === agent.agent_id ? 'var(--accent)' : 'var(--border)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                  {agent.agent_name}
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                  style={{ background: statusColor(agent.status) + '22', color: statusColor(agent.status) }}>
                  {agent.status}
                </span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                {agent.file_count || 0} file(s) · {agent.total_chunks || 0} chunks
              </p>
              <button
                onClick={e => { e.stopPropagation(); deleteAgent(agent.agent_id); }}
                className="mt-1 text-xs opacity-50 hover:opacity-100"
                style={{ color: '#ef4444' }}
              >
                Delete
              </button>
            </button>
          ))}
        </div>
        {err && <p className="text-xs" style={{ color: '#ef4444' }}>{err}</p>}
      </div>

      {/* Agent detail */}
      {selected ? (
        <div className="flex-1 flex flex-col min-w-0 gap-4 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>{selected.agent_name}</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Collection: {selected.qdrant_collection} · {selected.total_chunks || 0} chunks indexed
              </p>
            </div>
            {/* Tab switcher */}
            <div className="ml-auto flex gap-1 rounded-lg p-0.5" style={{ background: 'var(--main-bg)' }}>
              {(['files', 'chat'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className="px-3 py-1 rounded-md text-xs font-medium transition-colors"
                  style={{
                    background: tab === t ? 'var(--accent)' : 'transparent',
                    color: tab === t ? '#fff' : 'var(--text-muted)',
                  }}>
                  {t === 'files' ? '📄 Files' : '💬 Chat'}
                </button>
              ))}
            </div>
          </div>

          {/* Files tab */}
          {tab === 'files' && (
            <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
              {/* Upload area */}
              <div className="rounded-xl p-4 border flex flex-col gap-3"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Upload Files (PDF, DOCX, TXT, Images)
                </p>
                <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors hover:border-[var(--accent)]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  {uploading ? <SmallSpinner /> : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
                        <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
                      </svg>
                      <span className="text-sm">Click to upload files</span>
                    </>
                  )}
                  <input type="file" multiple accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg,.webp,.tiff"
                    className="hidden" onChange={e => e.target.files && uploadFiles(e.target.files)} />
                </label>
                {uploadErr && <p className="text-xs" style={{ color: '#ef4444' }}>{uploadErr}</p>}
                <button
                  onClick={triggerIndex}
                  disabled={indexing || files.length === 0}
                  className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  {indexing ? <><SmallSpinner /> Indexing…</> : '⚡ Index All Files'}
                </button>
                {indexLog.length > 0 && (
                  <div className="rounded-lg p-3 font-mono text-xs space-y-1 max-h-32 overflow-y-auto"
                    style={{ background: 'var(--main-bg)', color: 'var(--text-muted)' }}>
                    {indexLog.map((l, i) => <div key={i}>{l}</div>)}
                  </div>
                )}
              </div>

              {/* File list */}
              {filesLoading ? (
                <div className="flex justify-center py-4"><SmallSpinner /></div>
              ) : files.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No files uploaded yet</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {files.map(f => (
                    <div key={f.file_id} className="flex items-center justify-between rounded-lg px-3 py-2.5 border"
                      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{f.filename}</p>
                        <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                          {f.status} · {f.chunk_count || 0} chunks
                          {f.file_size ? ` · ${(f.file_size / 1024).toFixed(1)} KB` : ''}
                        </p>
                      </div>
                      <button onClick={() => deleteFile(f.file_id)}
                        className="text-xs ml-3 opacity-50 hover:opacity-100"
                        style={{ color: '#ef4444', flexShrink: 0 }}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Chat tab */}
          {tab === 'chat' && (
            <div className="flex flex-col flex-1 overflow-hidden gap-3">
              {selected.status !== 'ready' && (
                <div className="rounded-lg px-4 py-2 text-xs" style={{ background: '#f59e0b22', color: '#f59e0b' }}>
                  ⚠ Agent is not ready (status: {selected.status}). Please index files first.
                </div>
              )}
              {/* History */}
              <div className="flex-1 overflow-y-auto flex flex-col gap-3 rounded-xl p-4"
                style={{ background: 'var(--surface)' }}>
                {chatHistory.length === 0 && (
                  <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>
                    Ask a question about your documents…
                  </p>
                )}
                {chatHistory.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[80%] rounded-xl px-4 py-2.5 text-sm"
                      style={{
                        background: m.role === 'user' ? 'var(--accent)' : 'var(--main-bg)',
                        color: m.role === 'user' ? '#fff' : 'var(--text)',
                      }}>
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="rounded-xl px-4 py-2.5" style={{ background: 'var(--main-bg)' }}>
                      <SmallSpinner />
                    </div>
                  </div>
                )}
              </div>
              {/* Input */}
              <div className="flex gap-2">
                <input
                  value={chatQuestion}
                  onChange={e => setChatQuestion(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                  placeholder="Ask about your documents…"
                  disabled={chatLoading || selected.status !== 'ready'}
                  className="flex-1 px-3 py-2 rounded-lg text-sm border disabled:opacity-50"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)', outline: 'none' }}
                />
                <button
                  onClick={sendChat}
                  disabled={chatLoading || !chatQuestion.trim() || selected.status !== 'ready'}
                  className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
              className="mx-auto mb-3" style={{ color: 'var(--text-faint)' }}>
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Select a RAG agent to manage files and chat</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Agent Access Section (dedicated full view) ───────────────
function AgentAccessSection({ userId, token }: { userId: string; token: string }) {
  const [agents, setAgents]           = useState<AgentRecord[]>([]);
  const [ragAgents, setRagAgents]     = useState<RagAgentRecord[]>([]);
  const [permsMap, setPermsMap]       = useState<Record<string, AgentPermItem>>({});
  const [loading, setLoading]         = useState(true);
  const [err, setErr]                 = useState('');
  const [shareTarget, setShareTarget] = useState<{ agent_id: string; agent_name: string } | null>(null);
  const [shareEmail, setShareEmail]   = useState('');
  const [shareErr, setShareErr]       = useState('');
  const [shareLoading, setShareLoading] = useState(false);
  const [savingId, setSavingId]       = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [sqlRes, ragRes] = await Promise.all([
        fetch(`${AGENT_API}/agents?owner_id=${encodeURIComponent(userId)}`),
        RAG_API ? fetch(`${RAG_API}/rag/agents?owner_id=${encodeURIComponent(userId)}`) : Promise.resolve(null),
      ].map(p => (p as Promise<Response | null>).catch(() => null)));

      const sqlData = sqlRes ? await sqlRes.json().catch(() => ({})) : {};
      const ragData = ragRes ? await ragRes.json().catch(() => ({})) : {};
      const sqlList: AgentRecord[] = sqlData.agents ?? [];
      const ragList: RagAgentRecord[] = ragData.agents ?? [];
      setAgents(sqlList);
      setRagAgents(ragList);

      const allIds = [...sqlList.map(a => a.agent_id), ...ragList.map(a => a.agent_id)];
      if (allIds.length > 0) {
        const permResults = await Promise.allSettled(
          allIds.map(id =>
            fetch(`${API_BASE}/admin/agent-permissions/${id}`, {
              headers: { Authorization: `Bearer ${token}` },
            }).then(r => r.json())
          )
        );
        const map: Record<string, AgentPermItem> = {};
        allIds.forEach((id, idx) => {
          const r = permResults[idx];
          map[id] = (r.status === 'fulfilled' && r.value?.permissions)
            ? r.value.permissions
            : { agent_id: id, visibility: 'private', shared_with: [] };
        });
        setPermsMap(map);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [userId, token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function toggleVisibility(agentId: string, current: 'public' | 'private') {
    const next = current === 'public' ? 'private' : 'public';
    setSavingId(agentId);
    try {
      const res = await fetch(`${API_BASE}/admin/agent-permissions/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ visibility: next }),
      });
      if (res.ok) {
        setPermsMap(prev => ({ ...prev, [agentId]: { ...(prev[agentId] || { agent_id: agentId, shared_with: [] }), visibility: next } }));
      }
    } finally { setSavingId(null); }
  }

  async function addShare() {
    if (!shareTarget || !shareEmail.trim()) return;
    setShareLoading(true); setShareErr('');
    try {
      const res = await fetch(`${API_BASE}/admin/agent-permissions/${shareTarget.agent_id}/share`, {
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
    } finally { setShareLoading(false); }
  }

  async function removeShare(agentId: string, userRef: string) {
    try {
      const res = await fetch(`${API_BASE}/admin/agent-permissions/${agentId}/share`, {
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

  const allRows = [
    ...agents.map(a => ({ agent_id: a.agent_id, agent_name: a.agent_name, type: 'SQL' as const })),
    ...ragAgents.map(a => ({ agent_id: a.agent_id, agent_name: a.agent_name, type: 'RAG' as const })),
  ];

  if (loading) return (
    <div className="flex justify-center py-16"><Spinner /></div>
  );

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-xl p-4 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Control who can see each agent. <strong>Public</strong> agents are visible to all users.
            <strong> Private</strong> agents are only visible to you and people you share with.
            Click the visibility badge to toggle, or use <em>Share</em> to add specific emails.
          </p>
        </div>

        {err && <div className="rounded-lg px-4 py-3 text-sm text-red-400" style={{ background: '#ef444422', border: '1px solid #ef444444' }}>{err}</div>}

        {allRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ color: 'var(--text-faint)' }}>
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
            <p className="text-sm" style={{ color: 'var(--text-faint)' }}>No agents to manage</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div className="grid gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wider"
              style={{ gridTemplateColumns: '1fr 50px 120px 1fr 90px', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' }}>
              <div>Agent</div><div>Type</div><div>Visibility</div><div>Shared with</div><div className="text-right">Share</div>
            </div>
            {allRows.map((row, i) => {
              const perm = permsMap[row.agent_id] || { agent_id: row.agent_id, visibility: 'private', shared_with: [] };
              const isPublic = perm.visibility === 'public';
              return (
                <div key={row.agent_id}
                  className="grid gap-3 items-start px-4 py-3 hover:bg-[var(--surface-hover)] transition-colors"
                  style={{ gridTemplateColumns: '1fr 50px 120px 1fr 90px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>

                  <div className="min-w-0 pt-0.5">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{row.agent_name}</p>
                    <p className="text-xs font-mono" style={{ color: 'var(--text-faint)' }}>{row.agent_id.slice(0, 8)}…</p>
                  </div>

                  <div className="pt-1">
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                      style={{ background: row.type === 'SQL' ? '#f59e0b22' : '#10b98122', color: row.type === 'SQL' ? '#f59e0b' : '#10b981' }}>
                      {row.type}
                    </span>
                  </div>

                  <div className="pt-0.5">
                    <button
                      onClick={() => toggleVisibility(row.agent_id, perm.visibility as 'public' | 'private')}
                      disabled={savingId === row.agent_id}
                      title={isPublic ? 'Click to make Private' : 'Click to make Public'}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
                      style={{
                        background: isPublic ? '#10b98120' : '#6b728018',
                        color: isPublic ? '#10b981' : '#9ca3af',
                        border: `1px solid ${isPublic ? '#10b98140' : '#6b728040'}`,
                      }}
                    >
                      {savingId === row.agent_id ? (
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
                        style={{ background: 'var(--accent)18', color: 'var(--accent)', border: '1px solid var(--accent)30' }}>
                        {u}
                        <button onClick={() => removeShare(row.agent_id, u)} className="hover:text-red-400 transition-colors ml-0.5">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </span>
                    ))}
                  </div>

                  <div className="flex justify-end pt-0.5">
                    <button
                      onClick={() => { setShareTarget(row); setShareEmail(''); setShareErr(''); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                      style={{ background: 'var(--accent)18', color: 'var(--accent)', border: '1px solid var(--accent)30' }}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
          <div className="rounded-2xl w-full max-w-md shadow-2xl" style={{ background: 'var(--main-bg)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Share &quot;{shareTarget.agent_name}&quot;</h2>
              <button onClick={() => setShareTarget(null)} className="p-1 rounded hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-muted)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="px-6 pb-6 space-y-4">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Enter an email address to grant access to this agent.</p>
              <div className="flex gap-2">
                <input
                  value={shareEmail}
                  onChange={e => setShareEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addShare()}
                  placeholder="user@example.com"
                  className="flex-1 px-3 py-2 rounded-lg text-sm border outline-none"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
                />
                <button
                  onClick={addShare}
                  disabled={shareLoading || !shareEmail.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  {shareLoading ? '…' : 'Add'}
                </button>
              </div>
              {shareErr && <p className="text-xs text-red-400">{shareErr}</p>}

              {(() => {
                const list = permsMap[shareTarget.agent_id]?.shared_with ?? [];
                if (list.length === 0) return (
                  <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Not shared with anyone yet.</p>
                );
                return (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Currently shared with:</p>
                    {list.map(u => (
                      <div key={u} className="flex items-center justify-between px-3 py-2 rounded-lg"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        <span className="text-xs" style={{ color: 'var(--text)' }}>{u}</span>
                        <button onClick={() => removeShare(shareTarget.agent_id, u)}
                          className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors">Remove</button>
                      </div>
                    ))}
                  </div>
                );
              })()}

              <div className="flex justify-end pt-1">
                <button onClick={() => setShareTarget(null)}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                >Done</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Section headers ────────────────────────────────────────────
const SECTION_TITLES: Record<Section, string> = {
  agents:   'SQL Agents',
  csv:      'Upload CSV',
  database: 'Connect Database',
  rag:      'RAG Agents',
  access:   'Agent Access',
};

// ── Page ───────────────────────────────────────────────────────
export default function MyAgentsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [agentCount, setAgentCount] = useState(0);
  const [section, setSection]       = useState<Section>('agents');

  useEffect(() => {
    if (!authLoading && !user) router.replace('/');
  }, [user, authLoading, router]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--main-bg)' }}>
        <Spinner />
      </div>
    );
  }

  const userName    = user.name || user.email || 'User';
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--main-bg)' }}>
      <AgentSidebar
        agentCount={agentCount}
        userName={userName}
        userInitial={userInitial}
        active={section}
        onSelect={setSection}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex items-center px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>
            {SECTION_TITLES[section]}
          </h2>
        </header>
        <main className="flex-1 overflow-y-auto px-6 py-5">
          {section === 'agents' && (
            <AgentsListSection userId={user.id} token={user.token} onCountChange={setAgentCount} />
          )}
          {section === 'rag' && (
            <RagSection userId={user.id} token={user.token} />
          )}
          {section === 'csv' && (
            <CsvSection userId={user.id} token={user.token} />
          )}
          {section === 'database' && (
            <DatabaseSection userId={user.id} token={user.token} />
          )}
          {section === 'access' && (
            <AgentAccessSection userId={user.id} token={user.token} />
          )}
        </main>
      </div>
    </div>
  );
}
