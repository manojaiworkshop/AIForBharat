'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';

const CRAWL_API = process.env.NEXT_PUBLIC_CRAWL_API_URL ?? '';

// ── Types ─────────────────────────────────────────────────────────────────
interface CrawlAgent {
  agent_id:      string;
  agent_name:    string;
  agent_type:    'crawl';
  description?:  string;
  urls:          string[];
  product_query: string;
  status:        'ready' | 'error';
  owner_id?:     string;
  visibility:    'private' | 'public';
  shared_with?:  string[];
  created_at?:   string;
  updated_at?:   string;
}

interface AgentForm {
  agent_name:    string;
  description:   string;
  urls:          string[];          // list of vendor URLs
  product_query: string;
  system_prompt: string;
  visibility:    'private' | 'public';
}

const DEFAULT_FORM: AgentForm = {
  agent_name:    '',
  description:   '',
  urls:          [],
  product_query: '',
  system_prompt: '',
  visibility:    'private',
};

export default function CrawlAgentsPage() {
  const { user } = useAuth();
  const router   = useRouter();

  const [agents, setAgents]               = useState<CrawlAgent[]>([]);
  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [form, setForm]                   = useState<AgentForm>(DEFAULT_FORM);
  const [mode, setMode]                   = useState<'view' | 'create' | 'edit'>('view');
  const [loading, setLoading]             = useState(false);
  const [saving, setSaving]               = useState(false);
  const [deleting, setDeleting]           = useState(false);
  const [error, setError]                 = useState('');
  const [testQuery, setTestQuery]         = useState('');
  const [testLoading, setTestLoading]     = useState(false);
  const [testResult, setTestResult]       = useState('');
  const [newUrl, setNewUrl]               = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeTab, setActiveTab]         = useState<'config' | 'test'>('config');

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (user?.token) h['Authorization'] = `Bearer ${user.token}`;
    return h;
  }, [user]);

  const fetchAgents = useCallback(async () => {
    if (!CRAWL_API) return;
    setLoading(true);
    try {
      const r = await fetch(`${CRAWL_API}/crawl/agents`, { headers: headers() });
      const d = await r.json();
      setAgents(d.agents || []);
    } catch (e) {
      setError('Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    fetchAgents();
  }, [user, router, fetchAgents]);

  const selected = agents.find(a => a.agent_id === selectedId) ?? null;

  function selectAgent(a: CrawlAgent) {
    setSelectedId(a.agent_id);
    setForm({
      agent_name:    a.agent_name,
      description:   a.description ?? '',
      urls:          a.urls ?? [],
      product_query: a.product_query ?? '',
      system_prompt: '',
      visibility:    a.visibility ?? 'private',
    });
    setMode('view');
    setError('');
    setTestResult('');
    setActiveTab('config');
  }

  function startCreate() {
    setSelectedId(null);
    setForm(DEFAULT_FORM);
    setMode('create');
    setError('');
    setTestResult('');
  }

  async function saveAgent() {
    setSaving(true); setError('');
    try {
      const isCreate = mode === 'create';
      const url      = isCreate ? `${CRAWL_API}/crawl/agents` : `${CRAWL_API}/crawl/agents/${selectedId}`;
      const method   = isCreate ? 'POST' : 'PUT';
      const r = await fetch(url, { method, headers: headers(), body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Save failed'); return; }
      await fetchAgents();
      setSelectedId(d.agent_id);
      setMode('view');
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function deleteAgent() {
    if (!selectedId) return;
    setDeleting(true); setError('');
    try {
      const r = await fetch(`${CRAWL_API}/crawl/agents/${selectedId}`, { method: 'DELETE', headers: headers() });
      if (!r.ok) { const d = await r.json(); setError(d.error || 'Delete failed'); return; }
      setSelectedId(null);
      setForm(DEFAULT_FORM);
      setMode('view');
      setConfirmDelete(false);
      await fetchAgents();
    } catch (e) {
      setError(String(e));
    } finally {
      setDeleting(false);
    }
  }

  async function runTest() {
    if (!selectedId) return;
    setTestLoading(true); setTestResult('');
    const q = testQuery || `Compare prices for ${form.product_query || form.agent_name}`;
    try {
      const r = await fetch(`${CRAWL_API}/crawl/agents/${selectedId}/chat`, {
        method:  'POST',
        headers: headers(),
        body:    JSON.stringify({ query: q }),
      });
      const d = await r.json();
      setTestResult(d.answer || d.error || 'No result');
    } catch (e) {
      setTestResult(String(e));
    } finally {
      setTestLoading(false);
    }
  }

  function addUrl() {
    const url = newUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) { setError('URL must start with http:// or https://'); return; }
    setForm(f => ({ ...f, urls: [...f.urls, url] }));
    setNewUrl('');
    setError('');
  }

  function removeUrl(i: number) {
    setForm(f => ({ ...f, urls: f.urls.filter((_, idx) => idx !== i) }));
  }

  const VENDOR_PRESETS = [
    { label: 'Amazon India',  url: 'https://www.amazon.in/s?k=' },
    { label: 'Flipkart',      url: 'https://www.flipkart.com/search?q=' },
    { label: 'Snapdeal',      url: 'https://www.snapdeal.com/search?keyword=' },
    { label: 'Myntra',        url: 'https://www.myntra.com/' },
    { label: 'Meesho',        url: 'https://www.meesho.com/search?q=' },
    { label: 'Croma',         url: 'https://www.croma.com/searchB?q=' },
    { label: 'Reliance Digital', url: 'https://www.reliancedigital.in/search?q=' },
  ];

  function addPreset(baseUrl: string) {
    if (!form.urls.includes(baseUrl)) {
      setForm(f => ({ ...f, urls: [...f.urls, baseUrl] }));
    }
  }

  // ── Inline style helpers ───────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)',
    outline: 'none', fontFamily: 'inherit',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em',
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--main-bg)', color: 'var(--text)', fontFamily: 'var(--font-sans, system-ui)', overflow: 'hidden' }}>

      {/* ── LEFT PANEL: agent list ── */}
      <div style={{ width: 280, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, background: 'var(--sidebar-bg)' }}>
        {/* Header */}
        <div style={{ padding: '18px 16px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.push('/')} title="Back to chat"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Crawl Agents</div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>Price &amp; feature comparison</div>
          </div>
          <button onClick={startCreate} title="Create agent"
            style={{ background: '#f97316', border: 'none', borderRadius: 7, padding: '5px 10px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New
          </button>
        </div>

        {/* Agent list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {loading && <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>Loading…</div>}
          {!loading && agents.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
              <span style={{ fontSize: 32, display: 'block', marginBottom: 10 }}>🕷️</span>
              <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>No crawl agents yet.</p>
              <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>Click &ldquo;New&rdquo; to create one.</p>
            </div>
          )}
          {agents.map(a => (
            <div key={a.agent_id} onClick={() => selectAgent(a)}
              style={{
                padding: '10px 12px', borderRadius: 9, cursor: 'pointer', marginBottom: 4,
                background: selectedId === a.agent_id ? '#f9731618' : 'transparent',
                border: `1px solid ${selectedId === a.agent_id ? '#f9731640' : 'transparent'}`,
                transition: 'all 0.1s',
              }}
              onMouseEnter={e => { if (selectedId !== a.agent_id) e.currentTarget.style.background = 'var(--surface)'; }}
              onMouseLeave={e => { if (selectedId !== a.agent_id) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#f97316,#ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>
                  🕷️
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.agent_name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span>{(a.urls || []).length} URLs</span>
                    <span style={{
                      background: a.status === 'ready' ? '#10b98115' : '#ef444415',
                      color: a.status === 'ready' ? '#10b981' : '#ef4444',
                      borderRadius: 3, padding: '0px 4px', fontSize: 9, fontWeight: 700,
                    }}>{a.status}</span>
                    {a.visibility === 'public' && <span style={{ background: '#6366f115', color: '#6366f1', borderRadius: 3, padding: '0px 4px', fontSize: 9, fontWeight: 700 }}>PUBLIC</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Empty state */}
        {mode === 'view' && !selected && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, color: 'var(--text-faint)' }}>
            <span style={{ fontSize: 52, opacity: 0.4 }}>🕷️</span>
            <p style={{ fontSize: 14, margin: 0 }}>Select or create a Crawl Agent</p>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>Agents crawl vendor sites and compare prices automatically</p>
          </div>
        )}

        {/* Create / Edit form */}
        {(mode === 'create' || mode === 'edit') && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
            {/* Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg,#f97316,#ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🕷️</div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                {mode === 'create' ? 'New Crawl Agent' : 'Edit Crawl Agent'}
              </h2>
            </div>

            {error && (
              <div style={{ background: '#ef444410', border: '1px solid #ef444430', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#ef4444' }}>{error}</div>
            )}

            <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Name */}
              <div>
                <label style={labelStyle}>Agent Name *</label>
                <input value={form.agent_name} onChange={e => setForm(f => ({ ...f, agent_name: e.target.value }))}
                  placeholder="e.g. Laptop Price Tracker" style={inputStyle} />
              </div>

              {/* Description */}
              <div>
                <label style={labelStyle}>Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="What product / category does this agent monitor?" style={inputStyle} />
              </div>

              {/* Product Query */}
              <div>
                <label style={labelStyle}>Default Product Keyword</label>
                <input value={form.product_query} onChange={e => setForm(f => ({ ...f, product_query: e.target.value }))}
                  placeholder="e.g. laptop, iPhone 15, Samsung Galaxy S24" style={inputStyle} />
                <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
                  Users can search for any product — this is just the default.
                </p>
              </div>

              {/* Quick-add vendor presets */}
              <div>
                <label style={labelStyle}>Quick Add Vendor</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {VENDOR_PRESETS.map(p => (
                    <button key={p.label} type="button" onClick={() => addPreset(p.url)}
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 11px', fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
                      + {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* URLs */}
              <div>
                <label style={labelStyle}>Vendor Base Search URLs ({form.urls.length})</label>
                <p style={{ fontSize: 11, color: '#f59e0b', marginBottom: 8 }}>
                  ⚡ The product keyword from each user message is injected automatically.
                  Example: <code style={{ background: 'var(--surface)', padding: '1px 5px', borderRadius: 4 }}>https://www.amazon.in/s?k=</code>
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                  {form.urls.map((u, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', borderRadius: 7, padding: '7px 12px' }}>
                      <span style={{ color: '#f97316', fontSize: 10 }}>●</span>
                      <span style={{ flex: 1, fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u}</span>
                      <button onClick={() => removeUrl(i)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>×</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={newUrl} onChange={e => setNewUrl(e.target.value)}
                    placeholder="https://www.amazon.in/s?k=" onKeyDown={e => e.key === 'Enter' && addUrl()}
                    style={{ ...inputStyle, flex: 1, width: 'auto' }} />
                  <button onClick={addUrl}
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 16px', fontSize: 13, color: 'var(--text)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    Add URL
                  </button>
                </div>
              </div>

              {/* System Prompt */}
              <div>
                <label style={labelStyle}>System Prompt (optional)</label>
                <textarea value={form.system_prompt} onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))} rows={3}
                  placeholder="e.g. Focus on budget options under ₹50,000. Highlight warranty differences."
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
              </div>

              {/* Visibility */}
              <div>
                <label style={labelStyle}>Visibility</label>
                <select value={form.visibility} onChange={e => setForm(f => ({ ...f, visibility: e.target.value as 'private' | 'public' }))}
                  style={{ ...inputStyle, width: 'auto' }}>
                  <option value="private">🔒 Private</option>
                  <option value="public">🌐 Public</option>
                </select>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <button onClick={saveAgent} disabled={saving || !form.agent_name.trim()}
                  style={{ background: '#f97316', border: 'none', borderRadius: 8, padding: '8px 24px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving || !form.agent_name.trim() ? 0.6 : 1 }}>
                  {saving ? 'Saving…' : mode === 'create' ? 'Create Agent' : 'Save Changes'}
                </button>
                <button onClick={() => { setMode('view'); setError(''); }}
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View detail */}
        {mode === 'view' && selected && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg,#f97316,#ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🕷️</div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{selected.agent_name}</h2>
                  {selected.description && <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{selected.description}</p>}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <span style={{ background: '#f9731615', color: '#f97316', border: '1px solid #f9731630', borderRadius: 20, padding: '1px 8px', fontSize: 10, fontWeight: 700 }}>crawl agent</span>
                    <span style={{ background: 'var(--surface)', color: 'var(--text-muted)', borderRadius: 20, padding: '1px 8px', fontSize: 10 }}>{selected.visibility}</span>
                    <span style={{
                      background: selected.status === 'ready' ? '#10b98115' : '#ef444415',
                      color: selected.status === 'ready' ? '#10b981' : '#ef4444',
                      borderRadius: 20, padding: '1px 8px', fontSize: 10, fontWeight: 700,
                    }}>{selected.status}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setMode('edit')}
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--text)', fontWeight: 600 }}>Edit</button>
                {confirmDelete ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#ef4444' }}>Confirm?</span>
                    <button onClick={deleteAgent} disabled={deleting}
                      style={{ background: '#ef4444', border: 'none', borderRadius: 7, padding: '5px 14px', fontSize: 12, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                      {deleting ? 'Deleting…' : 'Yes, delete'}
                    </button>
                    <button onClick={() => setConfirmDelete(false)}
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 14px', fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(true)}
                    style={{ background: '#ef444415', border: '1px solid #ef444430', borderRadius: 7, padding: '5px 14px', fontSize: 13, cursor: 'pointer', color: '#ef4444', fontWeight: 600 }}>Delete</button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
              {(['config', 'test'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  style={{ background: 'none', border: 'none', borderBottom: `2px solid ${activeTab === tab ? '#f97316' : 'transparent'}`, padding: '6px 16px', fontSize: 13, fontWeight: activeTab === tab ? 700 : 500, color: activeTab === tab ? '#f97316' : 'var(--text-faint)', cursor: 'pointer', transition: 'all 0.1s', marginBottom: -1 }}>
                  {tab === 'config' ? 'Configuration' : 'Test Run'}
                </button>
              ))}
            </div>

            {activeTab === 'config' && (
              <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Product Query */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Default Product Keyword</div>
                  <p style={{ margin: 0, color: '#f97316', fontWeight: 600, fontSize: 14 }}>
                    {selected.product_query || <span style={{ color: 'var(--text-faint)', fontStyle: 'italic', fontWeight: 400 }}>Not set</span>}
                  </p>
                </div>

                {/* URLs */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Vendor URLs ({(selected.urls || []).length})
                  </div>
                  {(selected.urls || []).length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)', fontStyle: 'italic' }}>No URLs configured. Edit the agent to add vendor URLs.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(selected.urls || []).map((u, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-hover)', borderRadius: 7, padding: '7px 12px' }}>
                          <span style={{ color: '#f97316', fontSize: 10 }}>●</span>
                          <a href={u} target="_blank" rel="noopener noreferrer"
                            style={{ color: 'var(--accent)', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}
                            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
                            {u}
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Metadata */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                  <div>Created: <span style={{ color: 'var(--text)' }}>{selected.created_at?.slice(0, 10)}</span></div>
                  <div>Updated: <span style={{ color: 'var(--text)' }}>{selected.updated_at?.slice(0, 10)}</span></div>
                </div>
              </div>
            )}

            {activeTab === 'test' && (
              <div style={{ maxWidth: 700, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                  Run the crawl agent against its configured URLs and see the comparison report.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={testQuery} onChange={e => setTestQuery(e.target.value)}
                    placeholder={`Compare prices for ${selected.product_query || selected.agent_name}…`}
                    onKeyDown={e => e.key === 'Enter' && runTest()}
                    style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)', outline: 'none', fontFamily: 'inherit' }} />
                  <button onClick={runTest} disabled={testLoading || (selected.urls || []).length === 0}
                    style={{ background: '#f97316', border: 'none', borderRadius: 8, padding: '0 18px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: testLoading ? 'not-allowed' : 'pointer', opacity: testLoading || (selected.urls || []).length === 0 ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                    {testLoading ? 'Crawling…' : '🕷️ Run Crawl'}
                  </button>
                </div>
                {(selected.urls || []).length === 0 && (
                  <p style={{ fontSize: 12, color: '#f59e0b', margin: 0 }}>⚠ Add vendor URLs to the agent before testing.</p>
                )}
                {testResult && (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, maxHeight: 420, overflowY: 'auto' }}>
                    <pre style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{testResult}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// end of file
