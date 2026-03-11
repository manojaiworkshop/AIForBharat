'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';

const SEARCH_API =
  process.env.NEXT_PUBLIC_SEARCH_API_URL ?? '';

// ── Types ──────────────────────────────────────────────────────────────────
interface SearchAgent {
  agent_id: string;
  agent_name: string;
  agent_type: 'search';
  description?: string;
  status: 'ready' | 'error';
  search_provider: 'tavily' | 'duckduckgo';
  max_results: number;
  save_to_s3: boolean;
  s3_bucket?: string;
  s3_prefix?: string;
  owner_id?: string;
  visibility: 'private' | 'public';
  shared_with?: string[];
  created_at?: string;
  updated_at?: string;
}

interface AgentForm {
  agent_name: string;
  description: string;
  search_provider: 'tavily' | 'duckduckgo';
  max_results: number;
  save_to_s3: boolean;
  s3_bucket: string;
  s3_prefix: string;
  visibility: 'private' | 'public';
}

const DEFAULT_FORM: AgentForm = {
  agent_name: '',
  description: '',
  search_provider: 'tavily',
  max_results: 5,
  save_to_s3: false,
  s3_bucket: 'mercury-grid-csv-874382052619',
  s3_prefix: 'search-reports/',
  visibility: 'private',
};

// ── Component ──────────────────────────────────────────────────────────────
export default function SearchAgentsPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [agents, setAgents]               = useState<SearchAgent[]>([]);
  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [form, setForm]                   = useState<AgentForm>(DEFAULT_FORM);
  const [mode, setMode]                   = useState<'view' | 'create' | 'edit'>('view');
  const [loading, setLoading]             = useState(false);
  const [saving, setSaving]               = useState(false);
  const [deleting, setDeleting]           = useState(false);
  const [error, setError]                 = useState('');
  const [shareEmail, setShareEmail]       = useState('');
  const [shareLoading, setShareLoading]   = useState(false);
  const [shareError, setShareError]       = useState('');
  const [shareSuccess, setShareSuccess]   = useState('');
  const [activeTab, setActiveTab]         = useState<'config' | 'access'>('config');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (user?.token) h['Authorization'] = `Bearer ${user.token}`;
    return h;
  }, [user]);

  // ── Fetch agents ───────────────────────────────────────────────────────
  const fetchAgents = useCallback(async () => {
    if (!SEARCH_API) return;
    setLoading(true);
    try {
      const res = await fetch(`${SEARCH_API}/search/agents`, { headers: headers() });
      const data = await res.json();
      setAgents(data.agents || []);
    } catch {
      setError('Failed to load search agents.');
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  // ── Select agent ────────────────────────────────────────────────────────
  const selectAgent = (agent: SearchAgent) => {
    setSelectedId(agent.agent_id);
    setForm({
      agent_name:      agent.agent_name,
      description:     agent.description || '',
      search_provider: agent.search_provider,
      max_results:     agent.max_results,
      save_to_s3:      agent.save_to_s3,
      s3_bucket:       agent.s3_bucket || 'mercury-grid-csv-874382052619',
      s3_prefix:       agent.s3_prefix || 'search-reports/',
      visibility:      agent.visibility,
    });
    setMode('view');
    setActiveTab('config');
    setShareEmail('');
    setShareError('');
    setShareSuccess('');
    setConfirmDelete(false);
  };

  // ── Create / Update ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.agent_name.trim()) { setError('Agent name is required.'); return; }
    setSaving(true); setError('');
    try {
      const isCreate = mode === 'create';
      const url  = isCreate
        ? `${SEARCH_API}/search/agents`
        : `${SEARCH_API}/search/agents/${selectedId}`;
      const method = isCreate ? 'POST' : 'PUT';
      const res  = await fetch(url, { method, headers: headers(), body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      await fetchAgents();
      const saved = data.agent || data;
      if (saved.agent_id) {
        const updated = agents.find(a => a.agent_id === saved.agent_id) || saved as SearchAgent;
        selectAgent({ ...updated, ...form, agent_id: saved.agent_id, agent_type: 'search', status: 'ready' });
      }
      setMode('view');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!selectedId) return;
    setDeleting(true); setError('');
    try {
      const res = await fetch(`${SEARCH_API}/search/agents/${selectedId}`, {
        method: 'DELETE', headers: headers(),
      });
      if (!res.ok) throw new Error('Delete failed');
      setAgents(prev => prev.filter(a => a.agent_id !== selectedId));
      setSelectedId(null);
      setMode('view');
      setForm(DEFAULT_FORM);
      setConfirmDelete(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  // ── Share ────────────────────────────────────────────────────────────────
  const handleShare = async () => {
    if (!shareEmail.trim() || !selectedId) return;
    setShareLoading(true); setShareError(''); setShareSuccess('');
    try {
      const agent = agents.find(a => a.agent_id === selectedId);
      const sharedWith = [...(agent?.shared_with || [])];
      if (!sharedWith.includes(shareEmail.trim())) sharedWith.push(shareEmail.trim());
      const res = await fetch(`${SEARCH_API}/search/agents/${selectedId}`, {
        method: 'PUT', headers: headers(),
        body: JSON.stringify({ shared_with: sharedWith }),
      });
      if (!res.ok) throw new Error('Sharing failed');
      setShareSuccess(`Shared with ${shareEmail.trim()}`);
      setShareEmail('');
      await fetchAgents();
    } catch (e: unknown) {
      setShareError(e instanceof Error ? e.message : 'Share failed');
    } finally {
      setShareLoading(false);
    }
  };

  const handleUnshare = async (email: string) => {
    if (!selectedId) return;
    const agent = agents.find(a => a.agent_id === selectedId);
    const sharedWith = (agent?.shared_with || []).filter(e => e !== email);
    try {
      await fetch(`${SEARCH_API}/search/agents/${selectedId}`, {
        method: 'PUT', headers: headers(),
        body: JSON.stringify({ shared_with: sharedWith }),
      });
      await fetchAgents();
    } catch { /* silent */ }
  };

  const selectedAgent = agents.find(a => a.agent_id === selectedId) ?? null;

  // ── No SEARCH_API configured ─────────────────────────────────────────────
  if (!SEARCH_API) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-faint)', flexDirection: 'column', gap: 12 }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <p style={{ fontSize: 14 }}>NEXT_PUBLIC_SEARCH_API_URL is not configured.</p>
        <button onClick={() => router.push('/')} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>← Back to chat</button>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-sans, system-ui)', overflow: 'hidden' }}>

      {/* ── LEFT PANEL: agent list ─────────────────────────────────────── */}
      <div style={{ width: 280, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

        {/* Header */}
        <div style={{ padding: '18px 16px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.push('/')} title="Back to chat"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', flex: 1 }}>Search Agents</div>
          <button
            onClick={() => { setMode('create'); setSelectedId(null); setForm(DEFAULT_FORM); setError(''); setActiveTab('config'); }}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: 7, padding: '5px 10px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New
          </button>
        </div>

        {/* Agent list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {loading && <div style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>Loading…</div>}
          {!loading && agents.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.5" style={{ margin: '0 auto 10px', display: 'block' }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>No search agents yet.</p>
              <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>Click &ldquo;New&rdquo; to create one.</p>
            </div>
          )}
          {agents.map(agent => (
            <div key={agent.agent_id}
              onClick={() => selectAgent(agent)}
              style={{
                padding: '10px 12px', borderRadius: 9, cursor: 'pointer', marginBottom: 4,
                background: selectedId === agent.agent_id ? 'var(--accent)18' : 'transparent',
                border: `1px solid ${selectedId === agent.agent_id ? 'var(--accent)40' : 'transparent'}`,
                transition: 'all 0.1s',
              }}
              onMouseEnter={e => { if (selectedId !== agent.agent_id) e.currentTarget.style.background = 'var(--surface)'; }}
              onMouseLeave={e => { if (selectedId !== agent.agent_id) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#0ea5e9,#0284c7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.agent_name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1, display: 'flex', gap: 5, alignItems: 'center' }}>
                    <span style={{ textTransform: 'capitalize' }}>{agent.search_provider}</span>
                    {agent.save_to_s3 && <span style={{ background: '#10b98115', color: '#10b981', borderRadius: 3, padding: '0px 4px', fontSize: 9, fontWeight: 700 }}>S3</span>}
                    {agent.visibility === 'public' && <span style={{ background: '#6366f115', color: '#6366f1', borderRadius: 3, padding: '0px 4px', fontSize: 9, fontWeight: 700 }}>PUBLIC</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Empty state */}
        {mode === 'view' && !selectedAgent && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, color: 'var(--text-faint)' }}>
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: 0.4 }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
            <p style={{ fontSize: 14, margin: 0 }}>Select an agent or create a new one</p>
          </div>
        )}

        {/* View / Edit / Create form */}
        {(mode === 'create' || (mode !== 'view') || selectedAgent) && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>

            {/* Title row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg,#0ea5e9,#0284c7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                {mode === 'create' ? 'New Search Agent' : (mode === 'edit' ? 'Edit Agent' : selectedAgent?.agent_name)}
              </h2>
              {mode === 'view' && selectedAgent && (
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button onClick={() => { setMode('edit'); setError(''); }}
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--text)', fontWeight: 600 }}>Edit</button>
                  <button onClick={() => setConfirmDelete(true)}
                    style={{ background: '#ef444415', border: '1px solid #ef444430', borderRadius: 7, padding: '5px 14px', fontSize: 13, cursor: 'pointer', color: '#ef4444', fontWeight: 600 }}>Delete</button>
                </div>
              )}
            </div>

            {/* Delete confirmation */}
            {confirmDelete && (
              <div style={{ background: '#ef444410', border: '1px solid #ef444430', borderRadius: 10, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: '#ef4444', flex: 1 }}>Delete &ldquo;{selectedAgent?.agent_name}&rdquo;? This cannot be undone.</span>
                <button onClick={handleDelete} disabled={deleting}
                  style={{ background: '#ef4444', border: 'none', borderRadius: 7, padding: '5px 14px', fontSize: 12, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                  {deleting ? 'Deleting…' : 'Yes, Delete'}
                </button>
                <button onClick={() => setConfirmDelete(false)}
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 14px', fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            )}

            {error && (
              <div style={{ background: '#ef444410', border: '1px solid #ef444430', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#ef4444' }}>{error}</div>
            )}

            {/* Tabs (only in edit/view with agent selected) */}
            {(mode !== 'create') && selectedAgent && (
              <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
                {(['config', 'access'] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    style={{ background: 'none', border: 'none', borderBottom: `2px solid ${activeTab === tab ? 'var(--accent)' : 'transparent'}`, padding: '6px 16px', fontSize: 13, fontWeight: activeTab === tab ? 700 : 500, color: activeTab === tab ? 'var(--accent)' : 'var(--text-faint)', cursor: 'pointer', transition: 'all 0.1s', textTransform: 'capitalize', marginBottom: -1 }}>
                    {tab === 'config' ? 'Configuration' : 'Access'}
                  </button>
                ))}
              </div>
            )}

            {/* ── Config Tab / Create Form ─────────────────────────────── */}
            {(mode === 'create' || activeTab === 'config') && (
              <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 18 }}>

                <Field label="Agent Name" required>
                  <input value={form.agent_name}
                    readOnly={mode === 'view'}
                    onChange={e => setForm(f => ({ ...f, agent_name: e.target.value }))}
                    placeholder="e.g. Research Assistant"
                    style={inputStyle(mode === 'view')}
                  />
                </Field>

                <Field label="Description">
                  <textarea value={form.description}
                    readOnly={mode === 'view'}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="What does this agent search for?"
                    rows={3}
                    style={{ ...inputStyle(mode === 'view'), resize: 'vertical', lineHeight: 1.5 }}
                  />
                </Field>

                <Field label="Search Provider">
                  <select value={form.search_provider}
                    disabled={mode === 'view'}
                    onChange={e => setForm(f => ({ ...f, search_provider: e.target.value as 'tavily' | 'duckduckgo' }))}
                    style={inputStyle(mode === 'view')}>
                    <option value="tavily">Tavily AI (recommended — requires API key in Settings)</option>
                    <option value="duckduckgo">DuckDuckGo (free, no key needed)</option>
                  </select>
                </Field>

                <Field label="Max Results">
                  <input type="number" min={1} max={20} value={form.max_results}
                    readOnly={mode === 'view'}
                    onChange={e => setForm(f => ({ ...f, max_results: Math.max(1, Math.min(20, parseInt(e.target.value) || 5)) }))}
                    style={{ ...inputStyle(mode === 'view'), width: 100 }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 6 }}>results fetched per query (1–20)</span>
                </Field>

                {/* S3 save toggle */}
                <Field label="Save Reports to S3">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: mode === 'view' ? 'default' : 'pointer' }}>
                    <div
                      onClick={() => { if (mode !== 'view') setForm(f => ({ ...f, save_to_s3: !f.save_to_s3 })); }}
                      style={{
                        width: 36, height: 20, borderRadius: 10, transition: 'background 0.2s',
                        background: form.save_to_s3 ? 'var(--accent)' : 'var(--border)',
                        position: 'relative', cursor: mode === 'view' ? 'default' : 'pointer', flexShrink: 0,
                      }}>
                      <div style={{ position: 'absolute', top: 2, left: form.save_to_s3 ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--text)' }}>
                      {form.save_to_s3 ? 'Enabled — reports are saved to S3' : 'Disabled (default)'}
                    </span>
                  </label>
                </Field>

                {form.save_to_s3 && (
                  <>
                    <Field label="S3 Bucket">
                      <input value={form.s3_bucket}
                        readOnly={mode === 'view'}
                        onChange={e => setForm(f => ({ ...f, s3_bucket: e.target.value }))}
                        style={inputStyle(mode === 'view')}
                      />
                    </Field>
                    <Field label="S3 Prefix">
                      <input value={form.s3_prefix}
                        readOnly={mode === 'view'}
                        onChange={e => setForm(f => ({ ...f, s3_prefix: e.target.value }))}
                        placeholder="search-reports/"
                        style={inputStyle(mode === 'view')}
                      />
                    </Field>
                  </>
                )}

                {(mode === 'create' || mode === 'edit') && (
                  <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                    <button onClick={handleSave} disabled={saving}
                      style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 24px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                      {saving ? 'Saving…' : mode === 'create' ? 'Create Agent' : 'Save Changes'}
                    </button>
                    <button onClick={() => { if (mode === 'create') { setMode('view'); setSelectedId(null); } else { setMode('view'); } setError(''); }}
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Access Tab ────────────────────────────────────────────── */}
            {mode !== 'create' && activeTab === 'access' && selectedAgent && (
              <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Visibility */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Visibility</div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {(['private', 'public'] as const).map(v => (
                      <button key={v} onClick={async () => {
                        if (mode === 'view') {
                          try {
                            await fetch(`${SEARCH_API}/search/agents/${selectedAgent.agent_id}`, {
                              method: 'PUT', headers: headers(), body: JSON.stringify({ visibility: v }),
                            });
                            await fetchAgents();
                          } catch { /* silent */ }
                        }
                      }}
                        style={{
                          padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          background: form.visibility === v ? 'var(--accent)' : 'var(--surface)',
                          color: form.visibility === v ? '#fff' : 'var(--text)',
                          border: `1px solid ${form.visibility === v ? 'var(--accent)' : 'var(--border)'}`,
                        } as React.CSSProperties}>
                        {v === 'private' ? '🔒 Private' : '🌐 Public'}
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>
                    {selectedAgent.visibility === 'public'
                      ? 'Any logged-in user can use this agent.'
                      : 'Only you and explicitly shared users can use this agent.'}
                  </p>
                </div>

                {/* Share with users */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Share with Users</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={shareEmail} onChange={e => setShareEmail(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleShare(); }}
                      placeholder="user@example.com"
                      style={{ ...inputStyle(false), flex: 1 }}
                    />
                    <button onClick={handleShare} disabled={shareLoading || !shareEmail.trim()}
                      style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '0 16px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: shareLoading ? 'not-allowed' : 'pointer', opacity: shareLoading || !shareEmail.trim() ? 0.6 : 1 }}>
                      {shareLoading ? '…' : 'Share'}
                    </button>
                  </div>
                  {shareError   && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>{shareError}</p>}
                  {shareSuccess && <p style={{ fontSize: 12, color: '#10b981', marginTop: 6 }}>{shareSuccess}</p>}

                  {/* Shared users list */}
                  {(selectedAgent.shared_with || []).length > 0 && (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(selectedAgent.shared_with || []).map(email => (
                        <div key={email} style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', borderRadius: 7, padding: '6px 12px', gap: 10 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{email}</span>
                          <button onClick={() => handleUnshare(email)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 12, padding: '2px 6px', borderRadius: 4 }}
                            title="Remove access">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {(selectedAgent.shared_with || []).length === 0 && (
                    <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 8 }}>Not shared with anyone yet.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helper components ──────────────────────────────────────────────────────
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
      </div>
      {children}
    </div>
  );
}

function inputStyle(readOnly: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '8px 12px',
    fontSize: 13,
    background: readOnly ? 'var(--surface)' : 'var(--bg)',
    border: `1px solid var(--border)`,
    borderRadius: 8,
    color: 'var(--text)',
    outline: 'none',
    boxSizing: 'border-box',
    opacity: readOnly ? 0.75 : 1,
    cursor: readOnly ? 'default' : 'text',
  };
}
