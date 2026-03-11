'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import dynamic from 'next/dynamic';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const ReactECharts = dynamic(() => import('echarts-for-react'), {
  ssr: false,
  loading: () => (
    <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>
      Loading chart…
    </div>
  ),
});

const ANALYST_API = process.env.NEXT_PUBLIC_ANALYST_API_URL ?? '';

// ── Brand colour ──────────────────────────────────────────────────────────
const ACCENT = '#2A93D5';
const ACCENT_DIM = '#2A93D522';
const ACCENT_BORDER = '#2A93D540';

// ── Types ─────────────────────────────────────────────────────────────────
interface AnalystAgent {
  agent_id:      string;
  agent_name:    string;
  agent_type:    'analyst';
  description?:  string;
  domain:        string;
  focus_areas:   string[];
  data_format:   string;
  system_prompt?: string;
  save_to_s3?:   boolean;
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
  domain:        string;
  focus_areas:   string[];
  data_format:   string;
  system_prompt: string;
  visibility:    'private' | 'public';
}

const ALL_FOCUS = ['pricing', 'trends', 'forecasting', 'risk', 'revenue', 'competitive', 'kpi', 'market'];
const DOMAIN_OPTS = ['general', 'ecommerce', 'finance', 'retail', 'saas', 'manufacturing', 'healthcare', 'real estate'];
const FORMAT_OPTS = ['auto', 'csv', 'json', 'table', 'text'];

const DEFAULT_FORM: AgentForm = {
  agent_name:    '',
  description:   '',
  domain:        'general',
  focus_areas:   ['pricing', 'trends', 'forecasting', 'risk'],
  data_format:   'auto',
  system_prompt: '',
  visibility:    'private',
};

export default function AnalystAgentsPage() {
  const { user } = useAuth();
  const router   = useRouter();

  const [agents, setAgents]               = useState<AnalystAgent[]>([]);
  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [form, setForm]                   = useState<AgentForm>(DEFAULT_FORM);
  const [mode, setMode]                   = useState<'view' | 'create' | 'edit'>('view');
  const [loading, setLoading]             = useState(false);
  const [saving, setSaving]               = useState(false);
  const [deleting, setDeleting]           = useState(false);
  const [error, setError]                 = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeTab, setActiveTab]         = useState<'config' | 'test'>('config');

  // Test tab state
  const [testQuery, setTestQuery]   = useState('');
  const [testData, setTestData]     = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [testCharts, setTestCharts] = useState<Record<string, any>[]>([]);

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (user?.token) h['Authorization'] = `Bearer ${user.token}`;
    return h;
  }, [user]);

  const fetchAgents = useCallback(async () => {
    if (!ANALYST_API) return;
    setLoading(true);
    try {
      const r = await fetch(`${ANALYST_API}/analyst/agents`, { headers: headers() });
      const d = await r.json();
      setAgents(d.agents || []);
    } catch {
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

  function selectAgent(a: AnalystAgent) {
    setSelectedId(a.agent_id);
    setForm({
      agent_name:    a.agent_name,
      description:   a.description ?? '',
      domain:        a.domain ?? 'general',
      focus_areas:   a.focus_areas ?? [],
      data_format:   a.data_format ?? 'auto',
      system_prompt: a.system_prompt ?? '',
      visibility:    a.visibility ?? 'private',
    });
    setMode('view');
    setError('');
    setTestResult('');
    setTestCharts([]);
    setActiveTab('config');
  }

  function startCreate() {
    setSelectedId(null);
    setForm(DEFAULT_FORM);
    setMode('create');
    setError('');
    setTestResult('');
    setTestCharts([]);
  }

  function toggleFocus(f: string) {
    setForm(prev => ({
      ...prev,
      focus_areas: prev.focus_areas.includes(f)
        ? prev.focus_areas.filter(x => x !== f)
        : [...prev.focus_areas, f],
    }));
  }

  async function saveAgent() {
    setSaving(true); setError('');
    try {
      const isCreate = mode === 'create';
      const url    = isCreate
        ? `${ANALYST_API}/analyst/agents`
        : `${ANALYST_API}/analyst/agents/${selectedId}`;
      const method = isCreate ? 'POST' : 'PUT';
      const r = await fetch(url, { method, headers: headers(), body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Save failed'); return; }
      await fetchAgents();
      const id = d.agent?.agent_id ?? selectedId;
      setSelectedId(id);
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
      const r = await fetch(`${ANALYST_API}/analyst/agents/${selectedId}`, { method: 'DELETE', headers: headers() });
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

  async function runAnalysis() {
    if (!selectedId || !testQuery.trim()) return;
    setTestLoading(true); setTestResult(''); setTestCharts([]);
    try {
      const r = await fetch(`${ANALYST_API}/analyst/agents/${selectedId}/chat`, {
        method:  'POST',
        headers: headers(),
        body:    JSON.stringify({ query: testQuery, context: testData }),
      });
      const d = await r.json();
      setTestResult(d.answer || d.error || 'No result returned');
      if (Array.isArray(d.charts) && d.charts.length > 0) setTestCharts(d.charts);
    } catch (e) {
      setTestResult(String(e));
    } finally {
      setTestLoading(false);
    }
  }

  // ── styles ─────────────────────────────────────────────────────────────
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

      {/* ── LEFT PANEL: agent list ─────────────────────────────────────── */}
      <div style={{ width: 280, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, background: 'var(--sidebar-bg)' }}>

        {/* Header */}
        <div style={{ padding: '18px 16px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.push('/')} title="Back"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Analyst Agents</div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>Business intelligence &amp; forecasting</div>
          </div>
          <button onClick={startCreate} title="Create agent"
            style={{ background: ACCENT, border: 'none', borderRadius: 7, padding: '5px 10px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New
          </button>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {loading && <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>Loading…</div>}
          {!loading && agents.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
              <span style={{ fontSize: 32, display: 'block', marginBottom: 10 }}>📊</span>
              <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>No analyst agents yet.</p>
              <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>Click &ldquo;New&rdquo; to create one.</p>
            </div>
          )}
          {agents.map(a => (
            <div key={a.agent_id} onClick={() => selectAgent(a)}
              style={{
                padding: '10px 12px', borderRadius: 9, cursor: 'pointer', marginBottom: 4,
                background: selectedId === a.agent_id ? ACCENT_DIM : 'transparent',
                border: `1px solid ${selectedId === a.agent_id ? ACCENT_BORDER : 'transparent'}`,
                transition: 'all 0.1s',
              }}
              onMouseEnter={e => { if (selectedId !== a.agent_id) e.currentTarget.style.background = 'var(--surface)'; }}
              onMouseLeave={e => { if (selectedId !== a.agent_id) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: `linear-gradient(135deg,${ACCENT},#1a6fa0)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>
                  📈
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.agent_name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span>{a.domain}</span>
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

      {/* ── RIGHT PANEL ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Empty state */}
        {mode === 'view' && !selected && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, color: 'var(--text-faint)' }}>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity={0.3}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            <p style={{ fontSize: 14, margin: 0 }}>Select or create an Analyst Agent</p>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>Agents analyse business data and forecast trends, prices &amp; KPIs</p>
          </div>
        )}

        {/* Create / Edit form */}
        {(mode === 'create' || mode === 'edit') && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: `linear-gradient(135deg,${ACCENT},#1a6fa0)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📈</div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                {mode === 'create' ? 'New Analyst Agent' : 'Edit Analyst Agent'}
              </h2>
            </div>

            {error && (
              <div style={{ background: '#ef444410', border: '1px solid #ef444430', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#ef4444' }}>{error}</div>
            )}

            <div style={{ maxWidth: 580, display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Name */}
              <div>
                <label style={labelStyle}>Agent Name *</label>
                <input value={form.agent_name} onChange={e => setForm(f => ({ ...f, agent_name: e.target.value }))}
                  placeholder="e.g. E-commerce Price Analyst" style={inputStyle} />
              </div>

              {/* Description */}
              <div>
                <label style={labelStyle}>Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="What business problems does this agent solve?" style={inputStyle} />
              </div>

              {/* Domain */}
              <div>
                <label style={labelStyle}>Business Domain</label>
                <select value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
                  style={{ ...inputStyle, width: 'auto' }}>
                  {DOMAIN_OPTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {/* Focus areas */}
              <div>
                <label style={labelStyle}>Focus Areas</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {ALL_FOCUS.map(f => {
                    const on = form.focus_areas.includes(f);
                    return (
                      <button key={f} type="button" onClick={() => toggleFocus(f)}
                        style={{
                          background: on ? ACCENT_DIM : 'var(--surface)',
                          border: `1px solid ${on ? ACCENT_BORDER : 'var(--border)'}`,
                          color: on ? ACCENT : 'var(--text-muted)',
                          borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: on ? 600 : 400,
                          cursor: 'pointer', transition: 'all 0.1s',
                        }}>
                        {f}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Input data format */}
              <div>
                <label style={labelStyle}>Expected Input Data Format</label>
                <select value={form.data_format} onChange={e => setForm(f => ({ ...f, data_format: e.target.value }))}
                  style={{ ...inputStyle, width: 'auto' }}>
                  {FORMAT_OPTS.map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
                </select>
                <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
                  AUTO will detect CSV, JSON, markdown tables or plain text automatically.
                </p>
              </div>

              {/* System Prompt */}
              <div>
                <label style={labelStyle}>System Prompt (optional)</label>
                <textarea value={form.system_prompt} onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))} rows={4}
                  placeholder={`e.g. "Focus on Southeast Asian markets. Always compare against industry benchmarks. Highlight month-over-month changes."`}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
                <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
                  This supplements the built-in analyst instructions. Leave blank for defaults.
                </p>
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
                  style={{ background: ACCENT, border: 'none', borderRadius: 8, padding: '8px 24px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving || !form.agent_name.trim() ? 0.6 : 1 }}>
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

            {/* Agent header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: `linear-gradient(135deg,${ACCENT},#1a6fa0)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📈</div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{selected.agent_name}</h2>
                  {selected.description && <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{selected.description}</p>}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ background: ACCENT_DIM, color: ACCENT, border: `1px solid ${ACCENT_BORDER}`, borderRadius: 20, padding: '1px 8px', fontSize: 10, fontWeight: 700 }}>analyst agent</span>
                    <span style={{ background: 'var(--surface)', color: 'var(--text-muted)', borderRadius: 20, padding: '1px 8px', fontSize: 10 }}>{selected.domain}</span>
                    <span style={{ background: 'var(--surface)', color: 'var(--text-muted)', borderRadius: 20, padding: '1px 8px', fontSize: 10 }}>{selected.visibility}</span>
                    <span style={{
                      background: selected.status === 'ready' ? '#10b98115' : '#ef444415',
                      color: selected.status === 'ready' ? '#10b981' : '#ef4444',
                      borderRadius: 20, padding: '1px 8px', fontSize: 10, fontWeight: 700,
                    }}>{selected.status}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
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
                  style={{
                    background: 'none', border: 'none',
                    borderBottom: `2px solid ${activeTab === tab ? ACCENT : 'transparent'}`,
                    padding: '6px 16px', fontSize: 13,
                    fontWeight: activeTab === tab ? 700 : 500,
                    color: activeTab === tab ? ACCENT : 'var(--text-faint)',
                    cursor: 'pointer', transition: 'all 0.1s', marginBottom: -1,
                  }}>
                  {tab === 'config' ? 'Configuration' : 'Test Analysis'}
                </button>
              ))}
            </div>

            {/* ── Config tab ─────────────────────────────────────────────── */}
            {activeTab === 'config' && (
              <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Focus areas */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Focus Areas</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(selected.focus_areas || []).map(f => (
                      <span key={f} style={{ background: ACCENT_DIM, color: ACCENT, border: `1px solid ${ACCENT_BORDER}`, borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 500 }}>{f}</span>
                    ))}
                    {(selected.focus_areas || []).length === 0 && <span style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic' }}>None set</span>}
                  </div>
                </div>

                {/* Domain & data format */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Domain</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{selected.domain}</div>
                  </div>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Input Format</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{(selected.data_format || 'auto').toUpperCase()}</div>
                  </div>
                </div>

                {/* System prompt preview */}
                {selected.system_prompt && (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Custom System Prompt</div>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{selected.system_prompt}</p>
                  </div>
                )}

                {/* Metadata */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                  <div>Created: <span style={{ color: 'var(--text)' }}>{selected.created_at?.slice(0, 10)}</span></div>
                  <div>Updated: <span style={{ color: 'var(--text)' }}>{selected.updated_at?.slice(0, 10)}</span></div>
                </div>
              </div>
            )}

            {/* ── Test tab ───────────────────────────────────────────────── */}
            {activeTab === 'test' && (
              <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                  Paste your business data (CSV, JSON, table, or plain text) below, then ask a business question.
                  The agent will return a full analysis report with KPIs, trends, forecasts, and recommendations.
                </p>

                {/* Data input */}
                <div>
                  <label style={{ ...labelStyle, marginBottom: 6 }}>Business Data (CSV / JSON / Table / Text)</label>
                  <textarea
                    value={testData}
                    onChange={e => setTestData(e.target.value)}
                    rows={8}
                    placeholder={`Paste your data here. Examples:\n\nCSV:\nMonth,Revenue,Units\nJan,120000,340\nFeb,135000,380\n\nJSON:\n[{"month":"Jan","revenue":120000},{"month":"Feb","revenue":135000}]\n\nOr free text: Revenue grew from $120K in Jan to $135K in Feb, a 12.5% increase.`}
                    style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5, fontFamily: 'ui-monospace,monospace', fontSize: 12 }}
                  />
                </div>

                {/* Query */}
                <div>
                  <label style={{ ...labelStyle, marginBottom: 6 }}>Business Question</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={testQuery}
                      onChange={e => setTestQuery(e.target.value)}
                      placeholder="e.g. What is the revenue trend and what are the price forecasts for next quarter?"
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && runAnalysis()}
                      style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)', outline: 'none', fontFamily: 'inherit' }}
                    />
                    <button
                      onClick={runAnalysis}
                      disabled={testLoading || !testQuery.trim()}
                      style={{ background: ACCENT, border: 'none', borderRadius: 8, padding: '0 20px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: testLoading || !testQuery.trim() ? 'not-allowed' : 'pointer', opacity: testLoading || !testQuery.trim() ? 0.6 : 1, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {testLoading ? (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                          Analysing…
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                          Analyse
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Quick-question presets */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[
                    'What are the key trends in this data?',
                    'Forecast revenue for the next 3 months',
                    'What pricing strategy should we adopt?',
                    'Identify risks and growth opportunities',
                    'Calculate KPIs and benchmark against industry standards',
                  ].map(q => (
                    <button key={q} type="button" onClick={() => setTestQuery(q)}
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '4px 12px', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
                      {q}
                    </button>
                  ))}
                </div>

                {/* Result */}
                {testResult && (
                  <div style={{ background: 'var(--surface)', border: `1px solid ${ACCENT_BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 16px', background: ACCENT_DIM, borderBottom: `1px solid ${ACCENT_BORDER}`, fontSize: 12, fontWeight: 600, color: ACCENT, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                      Analysis Report — {selected.agent_name}
                    </div>
                    <div style={{ padding: 20, maxHeight: 600, overflowY: 'auto' }}>
                      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7 }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{testResult}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}

                {/* Charts */}
                {testCharts.length > 0 && testCharts.map((chart, i) => (
                  <div key={i} style={{ background: 'var(--surface)', border: `1px solid ${ACCENT_BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 16px', background: ACCENT_DIM, borderBottom: `1px solid ${ACCENT_BORDER}`, fontSize: 12, fontWeight: 600, color: ACCENT, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {i === 0
                        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                        : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
                      }
                      {(chart.title as any)?.text || (i === 0 ? 'Trend Chart' : 'Distribution Chart')}
                    </div>
                    <div style={{ padding: '12px 8px' }}>
                      <ReactECharts option={chart} style={{ height: 350 }} opts={{ renderer: 'canvas' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
