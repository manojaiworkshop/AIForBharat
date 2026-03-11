'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';

// ── Constants ──────────────────────────────────────────────────────────────
const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ||
  'https://placeholder.execute-api.eu-north-1.amazonaws.com/Prod';
const AGENT_REPO_URL = process.env.NEXT_PUBLIC_AGENT_REPO_URL || '';
const RAG_API_URL    = process.env.NEXT_PUBLIC_RAG_API_URL    || '';
const SEARCH_API_URL = process.env.NEXT_PUBLIC_SEARCH_API_URL || '';
const CRAWL_API_URL    = process.env.NEXT_PUBLIC_CRAWL_API_URL    || '';
const ANALYST_API_URL  = process.env.NEXT_PUBLIC_ANALYST_API_URL  || '';
const ADMIN_URL      = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/chat$/, '');

const NODE_W  = 220;
const NODE_H  = 72;
const PORT_R  = 7;
const DESC_H  = 54;   // extra height for the description section on every node

// ── Types ──────────────────────────────────────────────────────────────────
interface WFNode {
  id: string;
  agent_id: string;
  agent_name: string;
  agent_type: 'sql' | 'rag' | 'llm' | 'search' | 'crawl' | 'analyst';
  x: number;
  y: number;
  system_prompt?: string;
  description?: string;                  // what this agent is expert in
  edit_permission?: 'read' | 'write';    // 'read' → locked; shared users can still edit
}
interface WFEdge { id: string; source: string; target: string; }
interface WFDag  { nodes: WFNode[]; edges: WFEdge[]; }
interface Workflow {
  workflow_id: string;
  workflow_name: string;
  description: string;
  dag: WFDag;
  owner_id?: string;
  visibility: 'private' | 'public';
  shared_with: string[];
  node_count?: number;
  created_at?: string;
  updated_at?: string;
}
interface AgentItem {
  agent_id: string;
  agent_name: string;
  agent_type: 'sql' | 'rag' | 'llm' | 'search' | 'crawl' | 'analyst';
  status: string;
  visibility?: 'public' | 'owned' | 'shared';
}

// ── DAG helpers ─────────────────────────────────────────────────────────────
// Full node height: base header + description section + optional LLM system-prompt section
function nodeFullH(n: WFNode) {
  return n.agent_type === 'llm' ? NODE_H + 60 + DESC_H : NODE_H + DESC_H;
}
function outPort(n: WFNode) { return { x: n.x + NODE_W, y: n.y + nodeFullH(n) / 2 }; }
function inPort (n: WFNode) { return { x: n.x,           y: n.y + nodeFullH(n) / 2 }; }

function bezier(sx: number, sy: number, tx: number, ty: number) {
  const dx = Math.abs(tx - sx) * 0.55 + 40;
  return `M${sx},${sy} C${sx+dx},${sy} ${tx-dx},${ty} ${tx},${ty}`;
}

// ── Permission modal ────────────────────────────────────────────────────────
function PermModal({
  workflow, onSave, onClose,
}: {
  workflow: Workflow;
  onSave: (vis: string, shared: string[]) => void;
  onClose: () => void;
}) {
  const [vis, setVis]         = useState(workflow.visibility);
  const [emails, setEmails]   = useState(workflow.shared_with.join(', '));
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, width: 380, boxShadow: 'var(--shadow)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 18 }}>Workflow Permissions</h3>
        <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Visibility</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6, marginBottom: 16 }}>
          {(['private','public'] as const).map(v => (
            <button key={v} onClick={() => setVis(v)}
              style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: vis === v ? '2px solid var(--accent)' : '1px solid var(--border)',
                background: vis === v ? 'var(--accent)22' : 'var(--surface)', color: vis === v ? 'var(--accent)' : 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        {vis === 'private' && (
          <>
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Share with (comma-separated emails)</label>
            <textarea value={emails} onChange={e => setEmails(e.target.value)} rows={3}
              placeholder="user@example.com, other@example.com"
              style={{ width: '100%', marginTop: 6, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--main-bg)', color: 'var(--text)', fontSize: 13, resize: 'none' }} />
          </>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '7px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => onSave(vis, emails.split(',').map(e => e.trim()).filter(Boolean))}
            style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── WorkflowAccessSection ───────────────────────────────────────────────────
function WorkflowAccessSection({ token }: { token: string }) {
  const [workflows,    setWorkflows]    = useState<Workflow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [err,          setErr]          = useState('');
  const [savingId,     setSavingId]     = useState<string | null>(null);
  const [shareTarget,  setShareTarget]  = useState<{ id: string; name: string } | null>(null);
  const [shareEmail,   setShareEmail]   = useState('');
  const [shareErr,     setShareErr]     = useState('');
  const [shareLoading, setShareLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res = await fetch(`${ORCHESTRATOR_URL}/workflows`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      // Only show workflows the current user owns (visibility badge is write-only for owners)
      setWorkflows(d.workflows || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to load workflows');
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function toggleVisibility(wf: Workflow) {
    const next = wf.visibility === 'public' ? 'private' : 'public';
    setSavingId(wf.workflow_id);
    try {
      const res = await fetch(`${ORCHESTRATOR_URL}/workflows/${wf.workflow_id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ visibility: next, shared_with: wf.shared_with }),
      });
      if (res.ok) {
        setWorkflows(prev => prev.map(w =>
          w.workflow_id === wf.workflow_id ? { ...w, visibility: next } : w
        ));
      }
    } finally { setSavingId(null); }
  }

  async function addShare() {
    if (!shareTarget || !shareEmail.trim()) return;
    setShareLoading(true); setShareErr('');
    const wf = workflows.find(w => w.workflow_id === shareTarget.id);
    if (!wf) { setShareLoading(false); return; }
    const existing = wf.shared_with || [];
    const updated  = existing.includes(shareEmail.trim().toLowerCase())
      ? existing
      : [...existing, shareEmail.trim().toLowerCase()];
    try {
      const res = await fetch(`${ORCHESTRATOR_URL}/workflows/${shareTarget.id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ visibility: wf.visibility, shared_with: updated }),
      });
      const d = await res.json();
      if (!res.ok) { setShareErr(d?.error || 'Failed'); return; }
      setWorkflows(prev => prev.map(w =>
        w.workflow_id === shareTarget.id ? { ...w, shared_with: d.shared_with ?? updated } : w
      ));
      setShareEmail('');
    } catch (e: unknown) {
      setShareErr(e instanceof Error ? e.message : 'Error');
    } finally { setShareLoading(false); }
  }

  async function removeShare(wfId: string, email: string) {
    const wf = workflows.find(w => w.workflow_id === wfId);
    if (!wf) return;
    const updated = (wf.shared_with || []).filter(e => e !== email);
    try {
      const res = await fetch(`${ORCHESTRATOR_URL}/workflows/${wfId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ visibility: wf.visibility, shared_with: updated }),
      });
      if (res.ok) {
        setWorkflows(prev => prev.map(w =>
          w.workflow_id === wfId ? { ...w, shared_with: updated } : w
        ));
      }
    } catch { /* non-fatal */ }
  }

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="animate-spin w-7 h-7 rounded-full border-2 border-[var(--accent)] border-t-transparent" />
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', maxWidth: 900 }}>

      {/* Header */}
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Workflow Access</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
        Control who can see each workflow. <strong>Public</strong> workflows are visible to all users.
        <strong> Private</strong> workflows are only visible to you and people you share with.
        Click the visibility badge to toggle, or use <em>Share</em> to add specific emails.
      </p>

      {err && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: '#ef444422', border: '1px solid #ef444444', color: '#ef4444', fontSize: 13, marginBottom: 16 }}>{err}</div>
      )}

      {workflows.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ color: 'var(--text-faint)' }}>
            <path d="M2.5 12h19M12 2.5v19M6 6l12 12M18 6 6 18"/>
          </svg>
          <p style={{ fontSize: 14, color: 'var(--text-faint)' }}>No workflows yet</p>
        </div>
      ) : (
        <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface)' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 130px 1fr 90px', gap: 12, padding: '10px 16px',
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
            color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', background: 'var(--main-bg)' }}>
            <div>Workflow</div>
            <div>Nodes</div>
            <div>Visibility</div>
            <div>Shared with</div>
            <div style={{ textAlign: 'right' }}>Share</div>
          </div>

          {workflows.map((wf, i) => {
            const isPublic = wf.visibility === 'public';
            return (
              <div key={wf.workflow_id}
                style={{ display: 'grid', gridTemplateColumns: '1fr 60px 130px 1fr 90px', gap: 12,
                  padding: '11px 16px', alignItems: 'start',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                  transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>

                {/* Name + id */}
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{wf.workflow_name}</p>
                  <p style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-faint)' }}>{wf.workflow_id.slice(0, 8)}…</p>
                </div>

                {/* Node count */}
                <div style={{ paddingTop: 2 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{wf.node_count ?? 0}</span>
                </div>

                {/* Visibility toggle */}
                <div style={{ paddingTop: 2 }}>
                  <button
                    onClick={() => toggleVisibility(wf)}
                    disabled={savingId === wf.workflow_id}
                    title={isPublic ? 'Click to make Private' : 'Click to make Public'}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                      fontSize: 12, fontWeight: 600, border: 'none',
                      background: isPublic ? '#10b98120' : '#6b728018',
                      color:      isPublic ? '#10b981'   : '#9ca3af',
                      outline: `1px solid ${isPublic ? '#10b98140' : '#6b728040'}`,
                      opacity: savingId === wf.workflow_id ? 0.6 : 1,
                    }}
                  >
                    {savingId === wf.workflow_id ? (
                      <span style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid currentColor', borderTopColor: 'transparent', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                    ) : isPublic ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                    )}
                    {isPublic ? 'Public' : 'Private'}
                  </button>
                </div>

                {/* Shared with */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingTop: 2, minWidth: 0 }}>
                  {!wf.shared_with || wf.shared_with.length === 0 ? (
                    <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>—</span>
                  ) : wf.shared_with.map(email => (
                    <span key={email} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      padding: '2px 8px', borderRadius: 20, fontSize: 11,
                      background: 'var(--accent)18', color: 'var(--accent)',
                      border: '1px solid var(--accent)30',
                    }}>
                      {email}
                      <button onClick={() => removeShare(wf.workflow_id, email)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'flex', alignItems: 'center', marginLeft: 2 }}
                        onMouseEnter={e => ((e.target as HTMLElement).style.color = '#ef4444')}
                        onMouseLeave={e => ((e.target as HTMLElement).style.color = 'inherit')}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </span>
                  ))}
                </div>

                {/* Share button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 2 }}>
                  <button
                    onClick={() => { setShareTarget({ id: wf.workflow_id, name: wf.workflow_name }); setShareEmail(''); setShareErr(''); }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                      fontSize: 12, fontWeight: 600, border: 'none',
                      background: 'var(--accent)18', color: 'var(--accent)',
                      outline: '1px solid var(--accent)30',
                    }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                    Share
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Share modal */}
      {shareTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 28, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Share Workflow</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18 }}>
              Add an email to give access to <strong>{shareTarget.name}</strong>
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={shareEmail}
                onChange={e => setShareEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addShare()}
                placeholder="colleague@company.com"
                type="email"
                style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--main-bg)', color: 'var(--text)', fontSize: 13, outline: 'none' }}
              />
              <button onClick={addShare} disabled={shareLoading || !shareEmail.trim()}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: shareLoading || !shareEmail.trim() ? 'not-allowed' : 'pointer', opacity: !shareEmail.trim() ? 0.5 : 1 }}>
                {shareLoading ? '…' : 'Add'}
              </button>
            </div>
            {shareErr && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>{shareErr}</p>}

            {/* Current shared list */}
            {(() => {
              const wf = workflows.find(w => w.workflow_id === shareTarget.id);
              const list = wf?.shared_with || [];
              return list.length > 0 ? (
                <div style={{ marginTop: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Shared with</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {list.map(email => (
                      <div key={email} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px', borderRadius: 8, background: 'var(--main-bg)', border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 13, color: 'var(--text)' }}>{email}</span>
                        <button onClick={() => removeShare(shareTarget.id, email)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 14, display: 'flex', alignItems: 'center' }}
                          onMouseEnter={e => ((e.target as HTMLElement).style.color = '#ef4444')}
                          onMouseLeave={e => ((e.target as HTMLElement).style.color = 'var(--text-faint)')}>
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShareTarget(null)}
                style={{ padding: '7px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function WorkflowPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // ── View mode ────────────────────────────────────────────────
  const [activeView, setActiveView] = useState<'builder' | 'access'>('builder');

  // ── Left panel state ────────────────────────────────────────
  const [workflows, setWorkflows]   = useState<Workflow[]>([]);
  const [activeWf,  setActiveWf]    = useState<Workflow | null>(null);
  const [loadingWf, setLoadingWf]   = useState(false);

  // ── Center canvas state ─────────────────────────────────────
  const [wfName,   setWfName]       = useState('');
  const [wfDesc,   setWfDesc]       = useState('');
  const [nodes,    setNodes]        = useState<WFNode[]>([]);
  const [edges,    setEdges]        = useState<WFEdge[]>([]);
  const [saving,   setSaving]       = useState(false);
  const [isDirty,  setIsDirty]      = useState(false);

  // Canvas transform
  const [pan,  setPan]  = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(1);

  // Interaction
  const [mode,       setMode]       = useState<'idle' | 'panning' | 'dragging'>('idle');
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null); // source node id
  const [mousePos,   setMousePos]   = useState({ x: 0, y: 0 });     // world coords
  const [selected,   setSelected]   = useState<string | null>(null); // selected node id
  const [permOpen,   setPermOpen]   = useState(false);

  const canvasRef  = useRef<HTMLDivElement>(null);
  const originRef  = useRef({ mx: 0, my: 0, px: 0, py: 0 }); // pan start
  const nodeOriRef = useRef({ mx: 0, my: 0, nx: 0, ny: 0 }); // node drag start

  // ── Right panel state ───────────────────────────────────────
  const [agents, setAgents] = useState<AgentItem[]>([]);

  // ── Auth guard ──────────────────────────────────────────────
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  // ── Load workflows ──────────────────────────────────────────
  const loadWorkflows = useCallback(async () => {
    if (!user?.token) return;
    setLoadingWf(true);
    try {
      const res = await fetch(`${ORCHESTRATOR_URL}/workflows`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setWorkflows(d.workflows || []);
      }
    } catch { /* non-fatal */ }
    setLoadingWf(false);
  }, [user]);

  useEffect(() => { if (user) loadWorkflows(); }, [user, loadWorkflows]);

  // ── Load agents from both repos ─────────────────────────────
  useEffect(() => {
    if (!user?.token) return;
    const token = user.token;
    (async () => {
      const combined: AgentItem[] = [];
      // SQL agents
      try {
        const r = await fetch(`${AGENT_REPO_URL}/agents/?status=ready`);
        if (r.ok) {
          const d = await r.json();
          for (const a of d.agents || []) combined.push({ ...a, agent_type: 'sql' });
        }
      } catch { /* pass */ }
      // RAG agents
      try {
        const r = await fetch(`${RAG_API_URL}/rag/agents`, { headers: { Authorization: `Bearer ${token}` } });
        if (r.ok) {
          const d = await r.json();
          for (const a of d.agents || []) if (a.status === 'ready') combined.push({ agent_id: a.agent_id, agent_name: a.agent_name, agent_type: 'rag', status: 'ready' });
        }
      } catch { /* pass */ }
      // Search agents
      try {
        if (SEARCH_API_URL) {
          const r = await fetch(`${SEARCH_API_URL}/search/agents`, { headers: { Authorization: `Bearer ${token}` } });
          if (r.ok) {
            const d = await r.json();
            for (const a of d.agents || []) combined.push({ agent_id: a.agent_id, agent_name: a.agent_name, agent_type: 'search' as const, status: 'ready' });
          }
        }
      } catch { /* pass */ }
      // Crawl agents
      try {
        if (CRAWL_API_URL) {
          const r = await fetch(`${CRAWL_API_URL}/crawl/agents`, { headers: { Authorization: `Bearer ${token}` } });
          if (r.ok) {
            const d = await r.json();
            for (const a of d.agents || []) combined.push({ agent_id: a.agent_id, agent_name: a.agent_name, agent_type: 'crawl' as const, status: 'ready' });
          }
        }
      } catch { /* pass */ }
      // Analyst agents
      try {
        if (ANALYST_API_URL) {
          const r = await fetch(`${ANALYST_API_URL}/analyst/agents`, { headers: { Authorization: `Bearer ${token}` } });
          if (r.ok) {
            const d = await r.json();
            for (const a of d.agents || []) combined.push({ agent_id: a.agent_id, agent_name: a.agent_name, agent_type: 'analyst' as const, status: 'ready' });
          }
        }
      } catch { /* pass */ }
      // Deduplicate
      const seen = new Set<string>();
      const deduped: AgentItem[] = [];
      for (const a of combined) if (!seen.has(a.agent_id)) { seen.add(a.agent_id); deduped.push(a); }
      // Separate search / crawl / analyst agents — they live in different services and are unknown
      // to the admin permissions endpoint, so keep them out of that check to avoid getting filtered.
      const searchAgents  = deduped.filter(a => a.agent_type === 'search');
      const crawlAgents   = deduped.filter(a => a.agent_type === 'crawl');
      const analystAgents = deduped.filter(a => a.agent_type === 'analyst');
      const sqlRagAgents  = deduped.filter(a => a.agent_type !== 'search' && a.agent_type !== 'crawl' && a.agent_type !== 'analyst');
      // Filter SQL/RAG by permissions
      if (ADMIN_URL && sqlRagAgents.length > 0) {
        try {
          const pr = await fetch(`${ADMIN_URL}/admin/visible-agent-ids`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ agent_ids: sqlRagAgents.map(a => a.agent_id) }),
          });
          if (pr.ok) {
            const pd = await pr.json();
            const restricted = new Set<string>(pd.restricted_ids || []);
            const visMap: Record<string, 'public' | 'owned' | 'shared'> = pd.visibility_map || {};
            setAgents([
              ...sqlRagAgents.filter(a => !restricted.has(a.agent_id)).map(a => ({ ...a, visibility: visMap[a.agent_id] })),
              ...searchAgents,
              ...crawlAgents,
              ...analystAgents,
            ]);
            return;
          }
        } catch { /* pass */ }
      }
      setAgents([...sqlRagAgents, ...searchAgents, ...crawlAgents, ...analystAgents]);
    })();
  }, [user]);

  // ── Open workflow in canvas ─────────────────────────────────
  const openWorkflow = async (wf: Workflow) => {
    if (!user?.token) return;
    // fetch full dag
    try {
      const res = await fetch(`${ORCHESTRATOR_URL}/workflows/${wf.workflow_id}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (res.ok) {
        const full: Workflow = await res.json();
        setActiveWf(full);
        setWfName(full.workflow_name);
        setWfDesc(full.description || '');
        setNodes(full.dag?.nodes || []);
        setEdges(full.dag?.edges || []);
        setIsDirty(false);
        setConnecting(null);
        setSelected(null);
      }
    } catch { /* pass */ }
  };

  const newWorkflow = () => {
    setActiveWf({ workflow_id: '', workflow_name: '', description: '', dag: { nodes: [], edges: [] }, visibility: 'private', shared_with: [] });
    setWfName('');
    setWfDesc('');
    setNodes([]);
    setEdges([]);
    setIsDirty(true);
    setConnecting(null);
    setSelected(null);
  };

  // ── Save ─────────────────────────────────────────────────────
  const saveWorkflow = async () => {
    if (!user?.token || !wfName.trim()) return;
    setSaving(true);
    const dag: WFDag = { nodes, edges };
    try {
      let res: Response;
      if (activeWf?.workflow_id) {
        res = await fetch(`${ORCHESTRATOR_URL}/workflows/${activeWf.workflow_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
          body: JSON.stringify({ workflow_name: wfName.trim(), description: wfDesc, dag }),
        });
      } else {
        res = await fetch(`${ORCHESTRATOR_URL}/workflows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
          body: JSON.stringify({ workflow_name: wfName.trim(), description: wfDesc, dag, visibility: 'private', shared_with: [] }),
        });
      }
      if (res.ok) {
        const saved = await res.json();
        if (!activeWf?.workflow_id) {
          setActiveWf(prev => ({ ...(prev as Workflow), workflow_id: saved.workflow_id || '' }));
        }
        setIsDirty(false);
        await loadWorkflows();
      }
    } catch { /* pass */ }
    setSaving(false);
  };

  const deleteWorkflow = async (wfId: string) => {
    if (!user?.token || !confirm('Delete this workflow?')) return;
    try {
      const res = await fetch(`${ORCHESTRATOR_URL}/workflows/${wfId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${user.token}` },
      });
      if (res.ok) {
        if (activeWf?.workflow_id === wfId) { setActiveWf(null); setNodes([]); setEdges([]); }
        await loadWorkflows();
      }
    } catch { /* pass */ }
  };

  const savePermissions = async (vis: string, shared: string[]) => {
    if (!user?.token || !activeWf?.workflow_id) return;
    try {
      await fetch(`${ORCHESTRATOR_URL}/workflows/${activeWf.workflow_id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify({ visibility: vis, shared_with: shared }),
      });
      setActiveWf(prev => prev ? { ...prev, visibility: vis as 'private' | 'public', shared_with: shared } : null);
      await loadWorkflows();
    } catch { /* pass */ }
    setPermOpen(false);
  };

  // ── Canvas helpers ──────────────────────────────────────────
  const canvasToWorld = useCallback((cx: number, cy: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (cx - rect.left - pan.x) / zoom, y: (cy - rect.top - pan.y) / zoom };
  }, [pan, zoom]);

  // ── Mouse events ─────────────────────────────────────────────
  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if (connecting) { setConnecting(null); return; }
    if ((e.target as HTMLElement).closest('[data-node]')) return;
    if ((e.target as HTMLElement).closest('[data-port]')) return;
    // Start panning
    setMode('panning');
    originRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
    e.preventDefault();
  };

  const onNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if ((e.target as HTMLElement).closest('[data-port]')) return;
    if (connecting) return;
    e.stopPropagation();
    setMode('dragging');
    setDragNodeId(nodeId);
    setSelected(nodeId);
    const node = nodes.find(n => n.id === nodeId)!;
    const world = canvasToWorld(e.clientX, e.clientY);
    nodeOriRef.current = { mx: world.x, my: world.y, nx: node.x, ny: node.y };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const world = canvasToWorld(e.clientX, e.clientY);
    setMousePos(world);
    if (mode === 'panning') {
      const dx = e.clientX - originRef.current.mx;
      const dy = e.clientY - originRef.current.my;
      setPan({ x: originRef.current.px + dx, y: originRef.current.py + dy });
    } else if (mode === 'dragging' && dragNodeId) {
      const dx = world.x - nodeOriRef.current.mx;
      const dy = world.y - nodeOriRef.current.my;
      setNodes(prev => prev.map(n => n.id === dragNodeId ? { ...n, x: nodeOriRef.current.nx + dx, y: nodeOriRef.current.ny + dy } : n));
      setIsDirty(true);
    }
  };

  const onMouseUp = () => {
    setMode('idle');
    setDragNodeId(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setZoom(prev => {
      const nz = Math.min(2, Math.max(0.3, prev * factor));
      // Zoom toward cursor
      setPan(p => ({
        x: mx - (mx - p.x) * (nz / prev),
        y: my - (my - p.y) * (nz / prev),
      }));
      return nz;
    });
  };

  // ── Port clicks ───────────────────────────────────────────────
  const onOutputPortClick = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setConnecting(nodeId);
  };

  const onInputPortClick = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (!connecting || connecting === nodeId) { setConnecting(null); return; }
    // Check duplicate edge
    const exists = edges.some(ed => ed.source === connecting && ed.target === nodeId);
    if (exists) { setConnecting(null); return; }
    const newEdge: WFEdge = { id: `e-${Date.now()}`, source: connecting, target: nodeId };
    setEdges(prev => [...prev, newEdge]);
    setConnecting(null);
    setIsDirty(true);
  };

  // ── Drop agent onto canvas ────────────────────────────────────
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const addLLMNode = () => {
    const world = { x: 120 + nodes.length * 30, y: 120 + nodes.length * 20 };
    const newNode: WFNode = {
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      agent_id:     '',
      agent_name:   'LLM',
      agent_type:   'llm',
      x: Math.round(world.x),
      y: Math.round(world.y),
      system_prompt: 'You are a helpful AI assistant. Summarize and synthesize the provided information into a clear, concise answer.',
    };
    setNodes(prev => [...prev, newNode]);
    setIsDirty(true);
  };

  const updateNodeSystemPrompt = (nodeId: string, prompt: string) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, system_prompt: prompt } : n));
    setIsDirty(true);
  };

  const updateNodeDescription = (nodeId: string, desc: string) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, description: desc } : n));
    setIsDirty(true);
  };

  const updateNodeEditPermission = (nodeId: string, perm: 'read' | 'write') => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, edit_permission: perm } : n));
    setIsDirty(true);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('agent');
    if (!data) return;
    const agent: AgentItem = JSON.parse(data);
    const world = canvasToWorld(e.clientX, e.clientY);
    const newNode: WFNode = {
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      agent_id:   agent.agent_id,
      agent_name: agent.agent_name,
      agent_type: agent.agent_type,
      x: Math.round(world.x),
      y: Math.round(world.y),
    };
    setNodes(prev => [...prev, newNode]);
    setIsDirty(true);
  };

  const deleteNode = (nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setEdges(prev => prev.filter(e => e.source !== nodeId && e.target !== nodeId));
    if (selected === nodeId) setSelected(null);
    setIsDirty(true);
  };

  const deleteEdge = (edgeId: string) => {
    setEdges(prev => prev.filter(e => e.id !== edgeId));
    setIsDirty(true);
  };

  // Keyboard delete
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setConnecting(null); setSelected(null); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        deleteNode(selected);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected, nodes, edges]);

  if (loading) return null;

  const isNew = activeWf !== null && !activeWf.workflow_id;
  const connSrcNode = connecting ? nodes.find(n => n.id === connecting) : null;

  // ── Node-level edit permission ──────────────────────────────
  // 'read' lock: owner is locked out; shared users can always edit.
  const myEmail    = (user?.email || '').toLowerCase();
  const isOwner    = activeWf ? activeWf.owner_id === user?.id : false;
  const sharedEmails = (activeWf?.shared_with || []).map(e => e.toLowerCase());
  const isSharedEditor = sharedEmails.includes(myEmail);
  const canEditNode = (node: WFNode): boolean => {
    if (isSharedEditor) return true;           // shared users override lock
    if (!node.edit_permission || node.edit_permission === 'write') return true;
    return false;                              // owner locked this node
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--main-bg)', color: 'var(--text)', fontFamily: 'inherit', overflow: 'hidden' }}>

      {/* ── LEFT PANEL (20%) ─────────────────────────────────── */}
      <div style={{ width: '20%', minWidth: 200, maxWidth: 280, display: 'flex', flexDirection: 'column', background: 'var(--sidebar-bg)', borderRight: '1px solid var(--border)' }}>
        {/* Header title */}
        <div style={{ padding: '14px 16px 0', borderBottom: 'none' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Workflows</span>
        </div>
        {/* View tabs */}
        <div style={{ display: 'flex', gap: 2, padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
          {(['builder', 'access'] as const).map(v => (
            <button key={v} onClick={() => setActiveView(v)}
              style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: activeView === v ? 'var(--accent)' : 'transparent',
                color:      activeView === v ? '#fff' : 'var(--text-muted)',
              }}>
              {v === 'builder' ? '⬡ Builder' : '🔒 Access'}
            </button>
          ))}
        </div>
        {/* New button — builder only */}
        {activeView === 'builder' && (
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
            <button onClick={newWorkflow}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '6px 0', borderRadius: 8, border: 'none', background: 'var(--surface)', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', outline: '1px solid var(--accent)30' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Workflow
            </button>
          </div>
        )}
        {/* List — builder only */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0', display: activeView === 'builder' ? 'block' : 'none' }}>
          {loadingWf && <div style={{ padding: '16px', fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>Loading…</div>}
          {!loadingWf && workflows.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>⬡</div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>No workflows yet</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>Create your first workflow</div>
            </div>
          )}
          {workflows.map(wf => (
            <div key={wf.workflow_id} onClick={() => openWorkflow(wf)}
              style={{ padding: '10px 14px', cursor: 'pointer', background: activeWf?.workflow_id === wf.workflow_id ? 'var(--surface)' : 'transparent', borderLeft: activeWf?.workflow_id === wf.workflow_id ? '3px solid var(--accent)' : '3px solid transparent',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}
              className={activeWf?.workflow_id !== wf.workflow_id ? 'hover-surface' : ''}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{wf.workflow_name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span>{wf.node_count ?? 0} agent{(wf.node_count ?? 0) !== 1 ? 's' : ''}</span>
                  <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text-faint)', display: 'inline-block' }} />
                  <span style={{ color: wf.visibility === 'public' ? '#22c55e' : 'var(--text-faint)' }}>{wf.visibility}</span>
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); deleteWorkflow(wf.workflow_id); }}
                style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-faint)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}
                title="Delete">×</button>
            </div>
          ))}
        </div>
        {/* Back to chat */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
          <button onClick={() => router.push('/')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', padding: '4px 0' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Back to Chat
          </button>
        </div>
      </div>

      {/* ── CENTER PANEL (60%) ────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {activeView === 'access' ? (
          <WorkflowAccessSection token={user?.token || ''} />
        ) : activeWf === null ? (
          /* Empty state */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.2">
              <path d="M2.5 12h19M12 2.5v19M6 6l12 12M18 6 6 18"/>
            </svg>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-faint)' }}>No workflow selected</div>
            <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>Create a new workflow or select one from the list</div>
            <button onClick={newWorkflow} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              + New Workflow
            </button>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--sidebar-bg)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <input value={wfName} onChange={e => { setWfName(e.target.value); setIsDirty(true); }}
                  placeholder="Workflow name *"
                  style={{ width: '100%', padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--main-bg)', color: 'var(--text)', fontSize: 14, fontWeight: 600 }} />
              </div>
              <div style={{ flex: 2, minWidth: 220 }}>
                <input value={wfDesc} onChange={e => { setWfDesc(e.target.value); setIsDirty(true); }}
                  placeholder="Optional description"
                  style={{ width: '100%', padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--main-bg)', color: 'var(--text)', fontSize: 13 }} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                {activeWf.workflow_id && (
                  <button onClick={() => setPermOpen(true)} title="Permissions"
                    style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    {activeWf.visibility === 'public' ? 'Public' : activeWf.shared_with?.length ? `Shared (${activeWf.shared_with.length})` : 'Private'}
                  </button>
                )}
                <button onClick={() => { setActiveWf(null); setNodes([]); setEdges([]); }}
                  style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                <button onClick={saveWorkflow} disabled={saving || !wfName.trim()}
                  style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: isDirty ? 'var(--accent)' : 'var(--surface)', color: isDirty ? '#fff' : 'var(--text-faint)', fontSize: 13, fontWeight: 600, cursor: saving || !wfName.trim() ? 'not-allowed' : 'pointer', opacity: !wfName.trim() ? 0.5 : 1, transition: 'all 0.2s' }}>
                  {saving ? 'Saving…' : isNew ? '+ Create' : 'Save'}
                </button>
              </div>
            </div>

            {/* Status bar */}
            {connecting && (
              <div style={{ padding: '6px 16px', background: '#2a4a2a', fontSize: 12, color: '#6ee76e', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4caf50', display: 'inline-block', animation: 'pulse 1s infinite' }} />
                Connecting from <strong>{connSrcNode?.agent_name}</strong> — click an input port (left side) on another node, or press Esc to cancel
              </div>
            )}

            {/* Canvas */}
            <div ref={canvasRef} onMouseDown={onCanvasMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
              onWheel={onWheel} onDragOver={onDragOver} onDrop={onDrop}
              style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: mode === 'panning' ? 'grabbing' : connecting ? 'crosshair' : 'default',
                backgroundImage: `radial-gradient(circle, var(--border) 1px, transparent 1px)`,
                backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
                backgroundPosition: `${pan.x % (20 * zoom)}px ${pan.y % (20 * zoom)}px` }}>

              {/* World */}
              <div style={{ position: 'absolute', top: 0, left: 0, transformOrigin: '0 0', transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>

                {/* SVG edges layer */}
                <svg style={{ position: 'absolute', top: 0, left: 0, width: 4000, height: 4000, pointerEvents: 'none', overflow: 'visible' }}>
                  {/* Drawn edges */}
                  {edges.map(edge => {
                    const s = nodes.find(n => n.id === edge.source);
                    const t = nodes.find(n => n.id === edge.target);
                    if (!s || !t) return null;
                    const sp = outPort(s), tp = inPort(t);
                    const midX = (sp.x + tp.x) / 2;
                    const midY = (sp.y + tp.y) / 2;
                    return (
                      <g key={edge.id}>
                        <path d={bezier(sp.x, sp.y, tp.x, tp.y)} fill="none" stroke="var(--accent)" strokeWidth="2" opacity="0.7" />
                        {/* Arrow head */}
                        <polygon points={`${tp.x},${tp.y} ${tp.x-10},${tp.y-5} ${tp.x-10},${tp.y+5}`} fill="var(--accent)" opacity="0.7" />
                        {/* Delete button at midpoint — needs pointer events */}
                      </g>
                    );
                  })}
                  {/* Live connecting line */}
                  {connecting && connSrcNode && (
                    <path d={bezier(outPort(connSrcNode).x, outPort(connSrcNode).y, mousePos.x, mousePos.y)}
                      fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="6 3" opacity="0.6" />
                  )}
                </svg>

                {/* Edge delete buttons (separate so they get pointer events) */}
                {edges.map(edge => {
                  const s = nodes.find(n => n.id === edge.source);
                  const t = nodes.find(n => n.id === edge.target);
                  if (!s || !t) return null;
                  const sp = outPort(s), tp = inPort(t);
                  const midX = (sp.x + tp.x) / 2;
                  const midY = (sp.y + tp.y) / 2;
                  return (
                    <button key={`del-${edge.id}`} onClick={() => deleteEdge(edge.id)}
                      title="Remove connection"
                      style={{ position: 'absolute', left: midX - 9, top: midY - 9, width: 18, height: 18, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-faint)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, lineHeight: 1, padding: 0 }}>×</button>
                  );
                })}

                {/* Nodes */}
                {nodes.map(node => {
                  const isSel   = selected === node.id;
                  const isConn  = connecting === node.id;
                  const sqlColor    = '#2A93D5';
                  const ragColor    = '#7c3aed';
                  const llmColor    = '#d946ef';
                  const searchColor = '#0ea5e9';
                  const crawlColor    = '#f59e0b';
                  const analystColor  = '#2A93D5';
                  const col     = node.agent_type === 'sql' ? sqlColor : node.agent_type === 'llm' ? llmColor : node.agent_type === 'search' ? searchColor : node.agent_type === 'crawl' ? crawlColor : node.agent_type === 'analyst' ? analystColor : ragColor;
                  const isLLM   = node.agent_type === 'llm';
                  const isLocked = node.edit_permission === 'read';
                  const editable = canEditNode(node);
                  const nodeH   = nodeFullH(node);
                  return (
                    <div key={node.id} data-node={node.id}
                      onMouseDown={e => onNodeMouseDown(e, node.id)}
                      onClick={e => { if (mode !== 'panning') { e.stopPropagation(); setSelected(node.id); } }}
                      style={{ position: 'absolute', left: node.x, top: node.y, width: NODE_W, height: nodeH,
                        borderRadius: 10,
                        border: `2px solid ${isSel ? col : isLocked ? '#ef444455' : 'var(--border)'}`,
                        background: 'var(--surface)', boxShadow: isSel ? `0 0 0 3px ${col}33` : 'var(--shadow)',
                        cursor: mode === 'dragging' && dragNodeId === node.id ? 'grabbing' : 'grab',
                        userSelect: 'none', zIndex: isSel ? 10 : 2, display: 'flex', flexDirection: 'column' }}>

                      {/* ── Header ───────────────────────────────────────── */}
                      <div style={{ padding: '7px 52px 7px 26px', background: isLocked ? '#ef444412' : col + '22',
                        borderRadius: '8px 8px 0 0', borderBottom: '1px solid var(--border)',
                        display: 'flex', alignItems: 'center', gap: 6, position: 'relative', flexShrink: 0 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{node.agent_name}</span>
                        {/* Lock / Unlock toggle — owner only (shared editors can edit anyway) */}
                        {isOwner && (
                          <button
                            onClick={e => { e.stopPropagation(); updateNodeEditPermission(node.id, isLocked ? 'write' : 'read'); }}
                            title={isLocked ? 'Locked (click to unlock)' : 'Unlocked (click to lock)'}
                            style={{ position: 'absolute', right: 24, top: '50%', transform: 'translateY(-50%)',
                              width: 18, height: 18, borderRadius: 4, border: 'none',
                              background: isLocked ? '#ef444422' : 'transparent',
                              color: isLocked ? '#ef4444' : 'var(--text-faint)',
                              cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                          >
                            {isLocked ? '🔒' : '🔓'}
                          </button>
                        )}
                        {/* Shared-user indicator when locked */}
                        {!isOwner && isLocked && isSharedEditor && (
                          <span style={{ position: 'absolute', right: 24, top: '50%', transform: 'translateY(-50%)',
                            fontSize: 10, color: '#f59e0b' }} title="Locked for owner — you can edit as shared user">✏️</span>
                        )}
                        <button onClick={e => { e.stopPropagation(); deleteNode(node.id); }}
                          style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)',
                            width: 18, height: 18, borderRadius: 5, border: 'none', background: 'transparent',
                            color: 'var(--text-faint)', cursor: 'pointer', fontSize: 14,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>×</button>
                      </div>

                      {/* ── Type badge row (SQL / RAG) ────────────────────── */}
                      {!isLLM && (
                        <div style={{ padding: '4px 26px', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                          <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 4,
                            background: col + '22', color: col, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {node.agent_type}
                          </span>
                          <span style={{ fontSize: 9, color: 'var(--text-faint)', marginLeft: 5 }}>{node.agent_id.slice(0, 8)}…</span>
                        </div>
                      )}

                      {/* ── System Prompt (LLM only) ─────────────────────── */}
                      {isLLM && (
                        <div style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                          <span style={{ fontSize: 9, color: llmColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>System Prompt</span>
                          <textarea
                            value={node.system_prompt || ''}
                            onChange={e => { e.stopPropagation(); updateNodeSystemPrompt(node.id, e.target.value); }}
                            onMouseDown={e => e.stopPropagation()}
                            placeholder="You are a helpful assistant…"
                            rows={3}
                            disabled={!editable}
                            style={{ width: '100%', fontSize: 9, padding: '3px 5px', borderRadius: 4,
                              border: '1px solid var(--border)', background: editable ? 'var(--main-bg)' : 'var(--surface)',
                              color: editable ? 'var(--text)' : 'var(--text-faint)',
                              resize: 'none', lineHeight: 1.35, outline: 'none', fontFamily: 'inherit',
                              cursor: editable ? 'text' : 'not-allowed' }}
                          />
                        </div>
                      )}

                      {/* ── Description (all nodes) ──────────────────────── */}
                      <div style={{ padding: '5px 8px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 9, color: 'var(--text-faint)', fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          Expertise
                        </span>
                        <textarea
                          value={node.description || ''}
                          onChange={e => { e.stopPropagation(); updateNodeDescription(node.id, e.target.value); }}
                          onMouseDown={e => e.stopPropagation()}
                          placeholder={node.agent_type === 'sql' ? 'e.g. sales data, revenue queries…' : node.agent_type === 'rag' ? 'e.g. policy docs, HR manuals…' : node.agent_type === 'search' ? 'e.g. web research, latest news, company info…' : node.agent_type === 'crawl' ? 'e.g. compare iPhone 15 prices across Amazon, Flipkart…' : node.agent_type === 'analyst' ? 'e.g. analyse Q3 revenue trend and forecast Q4 pricing…' : 'e.g. summarise and synthesise results…'}
                          rows={2}
                          disabled={!editable}
                          style={{ flex: 1, fontSize: 9, padding: '3px 5px', borderRadius: 4,
                            border: '1px solid var(--border)', background: editable ? 'var(--main-bg)' : 'var(--surface)',
                            color: editable ? 'var(--text)' : 'var(--text-faint)',
                            resize: 'none', lineHeight: 1.35, outline: 'none', fontFamily: 'inherit',
                            cursor: editable ? 'text' : 'not-allowed' }}
                        />
                        {isLocked && !editable && (
                          <span style={{ fontSize: 8, color: '#ef4444', marginTop: 2 }}>🔒 locked by owner</span>
                        )}
                      </div>

                      {/* ── Ports ────────────────────────────────────────── */}
                      <div data-port="input"
                        onMouseUp={e => onInputPortClick(e, node.id)}
                        onClick={e => onInputPortClick(e, node.id)}
                        style={{ position: 'absolute', left: -PORT_R, top: '50%', transform: 'translateY(-50%)',
                          width: PORT_R * 2, height: PORT_R * 2, borderRadius: '50%',
                          background: connecting && connecting !== node.id ? '#22c55e' : 'var(--surface)',
                          border: `2px solid ${connecting && connecting !== node.id ? '#22c55e' : 'var(--border)'}`,
                          cursor: connecting ? 'pointer' : 'default', zIndex: 20, transition: 'all 0.15s' }} title="Input port" />

                      <div data-port="output"
                        onMouseDown={e => { e.stopPropagation(); onOutputPortClick(e, node.id); }}
                        style={{ position: 'absolute', right: -PORT_R, top: '50%', transform: 'translateY(-50%)',
                          width: PORT_R * 2, height: PORT_R * 2, borderRadius: '50%',
                          background: isConn ? 'var(--accent)' : 'var(--surface)',
                          border: `2px solid ${isConn ? 'var(--accent)' : col}`,
                          cursor: 'pointer', zIndex: 20, transition: 'all 0.15s' }} title="Click to connect" />
                    </div>
                  );
                })}

                {/* Drop hint when no nodes */}
                {nodes.length === 0 && (
                  <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                    <div style={{ fontSize: 40, marginBottom: 8, opacity: 0.25 }}>⟶</div>
                    <div style={{ fontSize: 14, color: 'var(--text-faint)', opacity: 0.6 }}>Drag agents from the right panel</div>
                  </div>
                )}
              </div>

              {/* Zoom controls */}
              <div style={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', flexDirection: 'column', gap: 2, zIndex: 10 }}>
                {[{ label: '+', fn: () => setZoom(z => Math.min(2, z * 1.2)) }, { label: '−', fn: () => setZoom(z => Math.max(0.3, z / 1.2)) }, { label: '⊡', fn: () => { setZoom(1); setPan({ x: 40, y: 40 }); } }].map(btn => (
                  <button key={btn.label} onClick={btn.fn}
                    style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {btn.label}
                  </button>
                ))}
              </div>

              {/* Zoom level indicator */}
              <div style={{ position: 'absolute', bottom: 16, right: 16, fontSize: 11, color: 'var(--text-faint)', zIndex: 10 }}>
                {Math.round(zoom * 100)}%
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── RIGHT PANEL (20%) ─────────────────────────────────── */}
      <div style={{ width: '20%', minWidth: 180, maxWidth: 260, display: 'flex', flexDirection: 'column', background: 'var(--sidebar-bg)', borderLeft: '1px solid var(--border)' }}>
        <div style={{ padding: '16px 14px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Agents</span>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--surface)', borderRadius: 6, padding: '2px 7px' }}>{agents.length}</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* LLM section — always shown */}
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '4px 2px' }}>LLM</div>
          <div
            onClick={addLLMNode}
            style={{ padding: '8px 10px', borderRadius: 9, border: '1px dashed #d946ef66', background: '#d946ef0a',
              cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#d946ef', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>LLM Node</div>
              <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>Synthesize with AI · click to add</div>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#d946ef" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>

          {agents.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-faint)', textAlign: 'center', marginTop: 12 }}>No agents available</div>}

          {/* SQL section */}
          {agents.filter(a => a.agent_type === 'sql').length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '6px 2px 2px' }}>SQL Agents</div>
              {agents.filter(a => a.agent_type === 'sql').map(agent => (
                <AgentCard key={agent.agent_id} agent={agent} />
              ))}
            </>
          )}

          {/* RAG section */}
          {agents.filter(a => a.agent_type === 'rag').length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '6px 2px 4px' }}>RAG Agents</div>
              {agents.filter(a => a.agent_type === 'rag').map(agent => (
                <AgentCard key={agent.agent_id} agent={agent} />
              ))}
            </>
          )}

          {/* Search section */}
          {agents.filter(a => a.agent_type === 'search').length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '6px 2px 4px' }}>Search Agents</div>
              {agents.filter(a => a.agent_type === 'search').map(agent => (
                <AgentCard key={agent.agent_id} agent={agent} />
              ))}
            </>
          )}

          {/* Crawl section */}
          {agents.filter(a => a.agent_type === 'crawl').length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '6px 2px 4px' }}>Crawl Agents</div>
              {agents.filter(a => a.agent_type === 'crawl').map(agent => (
                <AgentCard key={agent.agent_id} agent={agent} />
              ))}
            </>
          )}

          {/* Analyst section */}
          {agents.filter(a => a.agent_type === 'analyst').length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '6px 2px 4px' }}>Analyst Agents</div>
              {agents.filter(a => a.agent_type === 'analyst').map(agent => (
                <AgentCard key={agent.agent_id} agent={agent} />
              ))}
            </>
          )}
        </div>
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>
          Drag SQL / RAG / Search / Crawl / Analyst agents or click LLM to add nodes
        </div>
      </div>

      {/* Permission modal */}
      {permOpen && activeWf && (
        <PermModal workflow={activeWf} onSave={savePermissions} onClose={() => setPermOpen(false)} />
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .hover-surface:hover { background: var(--surface-hover) !important; }
      `}</style>
    </div>
  );
}

function AgentCard({ agent }: { agent: AgentItem }) {
  const col = agent.agent_type === 'sql' ? '#2A93D5' : agent.agent_type === 'search' ? '#0ea5e9' : agent.agent_type === 'crawl' ? '#f59e0b' : agent.agent_type === 'analyst' ? '#2A93D5' : '#7c3aed';
  return (
    <div draggable onDragStart={e => e.dataTransfer.setData('agent', JSON.stringify(agent))}
      style={{ padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)',
        cursor: 'grab', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.agent_name}</div>
        <div style={{ fontSize: 10, color: 'var(--text-faint)', display: 'flex', gap: 5, alignItems: 'center', marginTop: 2 }}>
          <span style={{ color: col }}>{agent.agent_type.toUpperCase()}</span>
          {agent.visibility === 'public' && <span style={{ color: '#22c55e' }}>● Public</span>}
          {agent.visibility === 'shared' && <span style={{ color: '#818cf8' }}>↑ Shared</span>}
        </div>
      </div>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="2" style={{ flexShrink: 0 }}>
        <circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/>
        <circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>
      </svg>
    </div>
  );
}
