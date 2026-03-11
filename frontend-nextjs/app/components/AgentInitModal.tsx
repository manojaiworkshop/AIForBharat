'use client';

/**
 * AgentInitModal
 * ─────────────────────────────────────────────────────────────
 * Full-screen overlay that:
 *  1. Accepts an agent name input
 *  2. Connects to agentrepo-serverless via Socket.IO
 *  3. Emits `start_agent_init` with selected tables + connection info
 *  4. Shows real-time pipeline progress (step cards + floating log)
 *  5. On `agent_ready` → calls onAgentCreated(agent) and closes
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { SemanticTable } from './SemanticLayerSidebar';

const AGENT_REPO_WS_URL = process.env.NEXT_PUBLIC_AGENT_REPO_WS_URL || '';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AgentRecord {
  agent_id:       string;
  agent_name:     string;
  status:         'initializing' | 'ready' | 'error';
  ontology_s3_uri?: string;
  neo4j_db_name?:   string;
  selected_tables?: SemanticTable[];
}

interface LogEntry {
  id:      number;
  type:    'info' | 'success' | 'warning' | 'error';
  message: string;
  ts:      string;
}

interface StepState {
  id:      string;
  label:   string;
  status:  'waiting' | 'running' | 'done' | 'error' | 'skipped';
  message: string;
  percent: number;
}

interface Props {
  selectedTables:    SemanticTable[];
  connectionInfo:    Record<string, any>;
  userId:            string;
  onClose:           () => void;
  onAgentCreated:    (agent: AgentRecord) => void;
}

// ── Step definitions ───────────────────────────────────────────────────────

const INITIAL_STEPS: StepState[] = [
  { id: 'create_record', label: 'Create record',       status: 'waiting', message: 'Pending…', percent: 0 },
  { id: 'schema_parse',  label: 'Parse schema',        status: 'waiting', message: 'Pending…', percent: 0 },
  { id: 'neo4j',         label: 'Neo4j graph',         status: 'waiting', message: 'Pending…', percent: 0 },
  { id: 'ontology',      label: 'Generate ontology',   status: 'waiting', message: 'Pending…', percent: 0 },
  { id: 's3_store',      label: 'Store to S3',         status: 'waiting', message: 'Pending…', percent: 0 },
  { id: 'finalize',      label: 'Register agent',      status: 'waiting', message: 'Pending…', percent: 0 },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function stepColor(status: StepState['status']) {
  switch (status) {
    case 'running':  return { bg: '#3b82f620', border: '#3b82f6', dot: '#3b82f6' };
    case 'done':     return { bg: '#10b98120', border: '#10b981', dot: '#10b981' };
    case 'error':    return { bg: '#ef444420', border: '#ef4444', dot: '#ef4444' };
    case 'skipped':  return { bg: '#f59e0b20', border: '#f59e0b', dot: '#f59e0b' };
    default:         return { bg: 'transparent', border: 'var(--border)', dot: 'var(--border)' };
  }
}

function logColor(type: LogEntry['type']) {
  switch (type) {
    case 'success': return '#10b981';
    case 'warning': return '#f59e0b';
    case 'error':   return '#ef4444';
    default:        return 'var(--text-muted)';
  }
}

function logTypeFromMessage(msg: string): LogEntry['type'] {
  if (msg.startsWith('✅') || msg.startsWith('🎉')) return 'success';
  if (msg.startsWith('⚠️') || msg.startsWith('⏭️')) return 'warning';
  if (msg.startsWith('❌')) return 'error';
  return 'info';
}

let _logSeq = 0;
function makeLog(message: string): LogEntry {
  return {
    id:      ++_logSeq,
    type:    logTypeFromMessage(message),
    message,
    ts:      new Date().toLocaleTimeString(),
  };
}

// ── Component ─────────────────────────────────────────────────────────────

export default function AgentInitModal({
  selectedTables,
  connectionInfo,
  userId,
  onClose,
  onAgentCreated,
}: Props) {
  const [agentName, setAgentName] = useState('');
  const [phase, setPhase]         = useState<'form' | 'running' | 'done' | 'error'>('form');
  const [steps, setSteps]         = useState<StepState[]>(INITIAL_STEPS);
  const [logs, setLogs]           = useState<LogEntry[]>([]);
  const [overallPct, setOverallPct] = useState(0);
  const [readyAgent, setReadyAgent] = useState<AgentRecord | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionErr, setConnectionErr] = useState('');

  const socketRef = useRef<WebSocket | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  const pushLog = useCallback((msg: string) => {
    setLogs(prev => [...prev.slice(-150), makeLog(msg)]);
  }, []);

  const updateStep = useCallback((stepId: string, patch: Partial<StepState>) => {
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, ...patch } : s));
  }, []);

  // Connect via native WebSocket (API Gateway WebSocket) when modal mounts
  useEffect(() => {
    if (!AGENT_REPO_WS_URL) {
      setConnectionErr('NEXT_PUBLIC_AGENT_REPO_WS_URL is not configured.');
      return;
    }

    const wsUrl = `${AGENT_REPO_WS_URL}?user_id=${encodeURIComponent(userId)}`;
    let ws: WebSocket;

    const connect = () => {
      ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setConnectionErr('');
        pushLog('🔌 Connected to Agent Repository');
      };

      ws.onerror = () => {
        setConnectionErr(`Cannot connect to Agent Repository at ${AGENT_REPO_WS_URL}`);
      };

      ws.onclose = () => {
        setConnected(false);
      };

      ws.onmessage = (ev: MessageEvent) => {
        let data: any;
        try { data = JSON.parse(ev.data); } catch { return; }

        const type = data.type as string;

        if (type === 'init_ack') {
          pushLog(`📋 Agent ID: ${data.agent_id}`);
          pushLog(data.message || '📝 Agent record created');
          updateStep('create_record', { status: 'done', message: data.message || 'Created' });
        } else if (type === 'progress') {
          const step    = data.step as string;
          const status  = data.status as string;
          const message = data.message || '';
          const pct     = data.percent || 0;
          setOverallPct(pct);
          pushLog(message);
          if (step) {
            const sStatus: StepState['status'] =
              status === 'done'    ? 'done'    :
              status === 'running' ? 'running' :
              status === 'error'   ? 'error'   :
              status === 'skipped' ? 'skipped' : 'waiting';
            updateStep(step, { status: sStatus, message, percent: pct });
          }
        } else if (type === 'neo4j_detail' || type === 'ontology_detail' || type === 's3_detail') {
          pushLog(data.message || '');
        } else if (type === 'agent_ready') {
          pushLog(data.message || '🎉 Agent ready!');
          setOverallPct(100);
          setReadyAgent({
            agent_id:        data.agent_id,
            agent_name:      data.agent_name,
            status:          'ready',
            ontology_s3_uri: data.ontology_s3_uri,
            neo4j_db_name:   data.neo4j_db_name,
            selected_tables: data.selected_tables,
          });
          setPhase('done');
        } else if (type === 'agent_error') {
          pushLog(data.message || '❌ Initialization failed');
          setPhase('error');
        } else if (type === 'error') {
          pushLog(`❌ ${data.message || 'Server error'}`);
        }
      };
    };

    connect();

    return () => {
      ws?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = () => {
    if (!agentName.trim()) return;
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;

    setPhase('running');
    setLogs([]);
    setSteps(INITIAL_STEPS.map(s => ({ ...s })));
    setOverallPct(0);

    socketRef.current.send(JSON.stringify({
      action:          'start_agent_init',
      agent_name:      agentName.trim(),
      selected_tables: selectedTables,
      connection_info: connectionInfo,
      user_id:         userId,
    }));
  };

  const handleDone = () => {
    if (readyAgent) onAgentCreated(readyAgent);
    onClose();
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        backdropFilter: 'blur(4px)',
      }}
      onClick={e => { if (e.target === e.currentTarget && phase !== 'running') onClose(); }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '660px',
          background: 'var(--main-bg)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        {/* ── Header ─────────────────────────────────────── */}
        <div
          style={{
            padding: '18px 22px 14px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Layers icon */}
            <div
              style={{
                width: 34, height: 34, borderRadius: '9px',
                background: 'linear-gradient(135deg, var(--accent), #1a7ab8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                <polyline points="2 17 12 22 22 17"/>
                <polyline points="2 12 12 17 22 12"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                Create SQL Agent
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                {selectedTables.length} table{selectedTables.length !== 1 ? 's' : ''} selected
              </div>
            </div>
          </div>
          {phase !== 'running' && (
            <button
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: '7px',
                border: 'none', background: 'var(--surface)',
                color: 'var(--text-muted)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        {/* ── Connection warning ──────────────────────────── */}
        {connectionErr && (
          <div style={{
            margin: '12px 20px 0',
            padding: '10px 14px',
            background: '#ef444415',
            border: '1px solid #ef444440',
            borderRadius: '8px',
            fontSize: 12,
            color: '#ef4444',
            flexShrink: 0,
          }}>
            ⚠️ {connectionErr}
          </div>
        )}

        {/* ── Phase: form ────────────────────────────────── */}
        {phase === 'form' && (
          <div style={{ padding: '22px', flex: 1, overflowY: 'auto' }}>
            {/* Agent name */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                Agent Name
              </label>
              <input
                autoFocus
                value={agentName}
                onChange={e => setAgentName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleStart()}
                placeholder="e.g. Sales Analyst, Operations Agent…"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '9px',
                  color: 'var(--text)',
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>

            {/* Selected tables summary */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
                Tables to include
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {selectedTables.map(t => (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px',
                      background: 'var(--surface)',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                        background: t.source === 'csv' ? '#10b98120' : '#3b82f620',
                        color:      t.source === 'csv' ? '#10b981'   : '#3b82f6',
                        fontFamily: 'monospace', whiteSpace: 'nowrap',
                      }}
                    >
                      {t.source === 'csv' ? 'CSV' : 'DB'}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flex: 1 }}>
                      {t.tableName}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      {t.columns.length} cols
                      {t.rowCount !== undefined ? ` · ${t.rowCount.toLocaleString()} rows` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pipeline steps preview */}
            <div
              style={{
                padding: '12px 14px',
                background: 'var(--surface)',
                borderRadius: '9px',
                border: '1px solid var(--border)',
                marginBottom: 22,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
                INITIALIZATION PIPELINE
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { icon: '🔍', label: 'Parse & validate table schema' },
                  { icon: '🔗', label: 'Build Neo4j knowledge graph' },
                  { icon: '🧠', label: 'Generate domain ontology (LLM)' },
                  { icon: '📦', label: 'Persist ontology to S3' },
                  { icon: '💾', label: 'Register agent in DynamoDB' },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Connection status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: 11, color: 'var(--text-faint)' }}>
              <span
                style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: connected ? '#10b981' : '#ef4444',
                  display: 'inline-block',
                }}
              />
              {connected ? 'Agent Repository connected' : (AGENT_REPO_WS_URL ? 'Connecting to Agent Repository…' : 'WS URL not configured')}
            </div>

            <button
              onClick={handleStart}
              disabled={!agentName.trim() || !connected || !AGENT_REPO_WS_URL}
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: '10px',
                border: 'none',
                background: !agentName.trim() || !connected || !AGENT_REPO_WS_URL ? 'var(--border)' : 'var(--accent)',
                color: !agentName.trim() || !connected || !AGENT_REPO_WS_URL ? 'var(--text-faint)' : '#fff',
                fontSize: 14,
                fontWeight: 700,
                cursor: !agentName.trim() || !connected || !AGENT_REPO_WS_URL ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
                letterSpacing: '0.01em',
              }}
            >
              🚀 Initialize Agent
            </button>
          </div>
        )}

        {/* ── Phase: running ─────────────────────────────── */}
        {(phase === 'running' || phase === 'done' || phase === 'error') && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'hidden' }}>
            {/* Overall progress bar */}
            <div style={{ padding: '16px 22px 12px', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                  {phase === 'done'  ? `🎉 "${agentName}" is ready!` :
                   phase === 'error' ? `❌ Initialization failed` :
                   `Initializing "${agentName}"…`}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>{overallPct}%</span>
              </div>
              <div style={{ height: 6, background: 'var(--surface)', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${overallPct}%`,
                    background: phase === 'error' ? '#ef4444' : 'var(--accent)',
                    borderRadius: 3,
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
            </div>

            {/* Step cards */}
            <div
              style={{
                padding: '0 22px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 8,
                flexShrink: 0,
              }}
            >
              {steps.map(step => {
                const c = stepColor(step.status);
                return (
                  <div
                    key={step.id}
                    style={{
                      padding: '8px 10px',
                      background: c.bg,
                      border: `1px solid ${c.border}`,
                      borderRadius: '9px',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                      <StepDot status={step.status} color={c.dot} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {step.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.35 }}>
                      {step.message.replace(/^[^\w\s]*\s/, '')}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Live log */}
            <div
              style={{
                flex: 1,
                margin: '12px 22px 0',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
              }}
            >
              <div style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
                Live Log
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', fontFamily: 'monospace', fontSize: 11 }}>
                {logs.map(entry => (
                  <div key={entry.id} style={{ display: 'flex', gap: 8, marginBottom: 3, lineHeight: 1.4 }}>
                    <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}>{entry.ts}</span>
                    <span style={{ color: logColor(entry.type) }}>{entry.message}</span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 22px', flexShrink: 0, display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
              {phase === 'done' && (
                <button
                  onClick={handleDone}
                  style={{
                    padding: '8px 22px',
                    borderRadius: '9px',
                    border: 'none',
                    background: 'var(--accent)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ✓ Use Agent
                </button>
              )}
              {phase === 'error' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={onClose}
                    style={{
                      padding: '8px 18px',
                      borderRadius: '9px',
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    Close
                  </button>
                  <button
                    onClick={() => setPhase('form')}
                    style={{
                      padding: '8px 18px',
                      borderRadius: '9px',
                      border: 'none',
                      background: 'var(--accent)',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}
              {phase === 'running' && (
                <span style={{ fontSize: 12, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      width: 12, height: 12, borderRadius: '50%',
                      border: '2px solid var(--border)',
                      borderTopColor: 'var(--accent)',
                      display: 'inline-block',
                      animation: 'aimSpin 0.7s linear infinite',
                    }}
                  />
                  Initialization in progress…
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes aimSpin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ── StepDot ────────────────────────────────────────────────────────────────
function StepDot({ status, color }: { status: StepState['status']; color: string }) {
  if (status === 'running') {
    return (
      <span
        style={{
          width: 10, height: 10, borderRadius: '50%',
          border: `2px solid ${color}40`,
          borderTopColor: color,
          animation: 'aimSpin 0.7s linear infinite',
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
    );
  }
  const icons: Record<string, string> = {
    done:    '✓',
    error:   '✕',
    skipped: '⏭',
    waiting: '·',
  };
  return (
    <span
      style={{
        width: 10, height: 10, borderRadius: '50%',
        background: status === 'waiting' ? 'transparent' : color,
        border: `1.5px solid ${color}`,
        fontSize: 7,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      {icons[status] || ''}
    </span>
  );
}
