'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthProvider';
import type { TableInfo } from './ConnectDBModal';
import AgentInitModal, { type AgentRecord } from './AgentInitModal';

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ||
  'https://sleocl2mk5.execute-api.eu-north-1.amazonaws.com/Prod/chat'
).replace(/\/chat$/, '');

const DEFAULT_WIDTH = 480;
const MIN_WIDTH     = 360;
const MAX_WIDTH     = 760;

// ── Types ─────────────────────────────────────────────────────

export interface SemanticTable {
  id:         string;   // unique key: "csv:{table_id}" or "db:{conn_id}:{table_name}"
  source:     'csv' | 'database';
  tableName:  string;
  sourceName: string;   // file name or connection name
  columns:    string[];
  rowCount?:  number;
}

interface ActiveDbConnection {
  connectionId:   string;
  connectionName: string;
  tables:         TableInfo[];
}

interface Props {
  open:               boolean;
  onClose:            () => void;
  activeDbConnection: ActiveDbConnection | null;
  refreshKey:         number;
  onAgentCreated?:    (agent: AgentRecord) => void;
}

// ── Source badge ──────────────────────────────────────────────
function SourceBadge({ source }: { source: 'csv' | 'database' }) {
  const isDb = source === 'database';
  return (
    <span
      style={{
        fontSize: '10px',
        fontWeight: 700,
        padding: '2px 6px',
        borderRadius: '4px',
        background: isDb ? '#3b82f620' : '#10b98120',
        color:      isDb ? '#3b82f6'   : '#10b981',
        whiteSpace: 'nowrap',
        fontFamily: 'monospace',
      }}
    >
      {isDb ? 'DB' : 'CSV'}
    </span>
  );
}

// ── Single table row ──────────────────────────────────────────
function TableRow({
  table, selected, onToggle,
}: {
  table:    SemanticTable;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <tr
      style={{
        background: selected ? 'var(--accent)08' : 'transparent',
        borderBottom: '1px solid var(--border)',
        transition: 'background 0.12s',
      }}
    >
      {/* Checkbox */}
      <td style={{ padding: '0 0 0 12px', width: 36, verticalAlign: 'middle' }}>
        <div
          onClick={() => onToggle(table.id)}
          style={{
            width: 16,
            height: 16,
            borderRadius: '4px',
            border: selected ? '2px solid var(--accent)' : '2px solid var(--border)',
            background: selected ? 'var(--accent)' : 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'all 0.12s',
          }}
        >
          {selected && (
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
              <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
      </td>

      {/* Table name + expand */}
      <td
        style={{ padding: '9px 8px', verticalAlign: 'middle', cursor: 'pointer' }}
        onClick={() => setExpanded(v => !v)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg
              width="11" height="11" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
              style={{
                flexShrink: 0,
                color: 'var(--text-faint)',
                transition: 'transform 0.2s',
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            >
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text)',
                fontFamily: 'monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 150,
              }}
              title={table.tableName}
            >
              {table.tableName}
            </span>
          </div>
          {expanded && table.columns.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '3px',
                paddingLeft: 16,
                paddingTop: 4,
                paddingBottom: 2,
              }}
            >
              {table.columns.map(col => (
                <span
                  key={col}
                  style={{
                    fontSize: '10px',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                    fontFamily: 'monospace',
                  }}
                >
                  {col}
                </span>
              ))}
            </div>
          )}
        </div>
      </td>

      {/* Source badge */}
      <td style={{ padding: '9px 8px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
        <SourceBadge source={table.source} />
      </td>

      {/* Connection / file name */}
      <td
        style={{
          padding: '9px 8px',
          verticalAlign: 'middle',
          fontSize: '11px',
          color: 'var(--text-faint)',
          maxWidth: 110,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={table.sourceName}
      >
        {table.sourceName}
      </td>

      {/* Column count */}
      <td
        style={{
          padding: '9px 12px 9px 4px',
          verticalAlign: 'middle',
          fontSize: '11px',
          color: 'var(--text-faint)',
          textAlign: 'right',
          whiteSpace: 'nowrap',
        }}
      >
        {table.columns.length} cols
        {table.rowCount !== undefined && (
          <span style={{ display: 'block', fontSize: '10px' }}>
            {table.rowCount.toLocaleString()} rows
          </span>
        )}
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────
export default function SemanticLayerSidebar({ open, onClose, activeDbConnection, refreshKey, onAgentCreated }: Props) {
  const { user } = useAuth();

  const [tables,         setTables]         = useState<SemanticTable[]>([]);
  const [selected,       setSelected]       = useState<Set<string>>(new Set());
  const [loading,        setLoading]        = useState(false);
  const [search,         setSearch]         = useState('');
  const [filter,         setFilter]         = useState<'all' | 'csv' | 'database'>('all');
  const [width,          setWidth]          = useState(DEFAULT_WIDTH);
  const [agentInitOpen,  setAgentInitOpen]  = useState(false);

  const startX = useRef(0);
  const startW = useRef(DEFAULT_WIDTH);

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    startX.current = e.clientX;
    startW.current = width;
    const onMove = (ev: MouseEvent) => {
      const delta = startX.current - ev.clientX;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW.current + delta)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const fetchAll = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    const all: SemanticTable[] = [];

    // ── CSV tables ──────────────────────────────────────────
    try {
      const res = await fetch(`${API_BASE}/csv/tables`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        for (const t of (data.tables || [])) {
          if (!t.table_created) continue;
          all.push({
            id:         `csv:${t.table_id}`,
            source:     'csv',
            tableName:  t.pg_table_name || t.table_name,
            sourceName: t.file_name,
            columns:    t.columns || [],
            rowCount:   t.row_count,
          });
        }
      }
    } catch {/* non-fatal */}

    // ── Database tables (active connection) ─────────────────
    if (activeDbConnection) {
      for (const t of activeDbConnection.tables) {
        all.push({
          id:         `db:${activeDbConnection.connectionId}:${t.name}`,
          source:     'database',
          tableName:  t.name,
          sourceName: activeDbConnection.connectionName,
          columns:    t.columns.map(c => c.name),
        });
      }
    }

    setTables(all);
    setLoading(false);
  }, [user?.token, activeDbConnection]);

  useEffect(() => {
    if (open) fetchAll();
  }, [open, refreshKey, fetchAll]);

  if (!open) return null;

  const filtered = tables.filter(t => {
    const matchSource = filter === 'all' || t.source === filter;
    const matchSearch = !search
      || t.tableName.toLowerCase().includes(search.toLowerCase())
      || t.sourceName.toLowerCase().includes(search.toLowerCase());
    return matchSource && matchSearch;
  });

  const csvCount = tables.filter(t => t.source === 'csv').length;
  const dbCount  = tables.filter(t => t.source === 'database').length;
  const selCount = selected.size;

  const toggleAll = () => {
    if (selCount === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(t => t.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const allChecked = filtered.length > 0 && filtered.every(t => selected.has(t.id));

  return (
    <div
      className="relative flex flex-col flex-shrink-0 h-full"
      style={{
        width,
        background: 'var(--main-bg)',
        borderLeft: '1px solid var(--border)',
      }}
    >
      {/* Resize handle on left edge */}
      <div
        onMouseDown={onResizeStart}
        className="absolute left-0 top-0 h-full z-10 cursor-col-resize"
        style={{ width: 4 }}
      />

      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3.5"
        style={{ borderBottom: '1px solid var(--border)', flexShrink: 0 }}
      >
        <div className="flex items-center gap-2">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/>
            <polyline points="2 17 12 22 22 17"/>
            <polyline points="2 12 12 17 22 12"/>
          </svg>
          <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>Semantic Layer</span>
          {selCount > 0 && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={{ background: 'var(--accent)20', color: 'var(--accent)' }}
            >
              {selCount} selected
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={fetchAll}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--text-muted)' }}
            title="Refresh"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
            </svg>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Search + filter bar ── */}
      <div className="px-3 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1 }}>
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }}
          >
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tables…"
            style={{
              width: '100%',
              padding: '5px 8px 5px 26px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '7px',
              color: 'var(--text)',
              fontSize: '12px',
              outline: 'none',
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />
        </div>

        {/* Source filter pills */}
        {(['all', 'csv', 'database'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '4px 9px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '6px',
              border: '1px solid',
              cursor: 'pointer',
              transition: 'all 0.12s',
              background: filter === f ? 'var(--accent)' : 'transparent',
              color:      filter === f ? '#fff'          : 'var(--text-muted)',
              borderColor: filter === f ? 'var(--accent)' : 'var(--border)',
              whiteSpace: 'nowrap',
            }}
          >
            {f === 'all' ? `All (${tables.length})` : f === 'csv' ? `CSV (${csvCount})` : `DB (${dbCount})`}
          </button>
        ))}
      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
            <div style={{ width: 20, height: 20, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'slSpin 0.7s linear infinite' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-faint)', fontSize: 13 }}>
            <svg
              width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
              style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }}
            >
              <polygon points="12 2 2 7 12 12 22 7 12 2"/>
              <polyline points="2 17 12 22 22 17"/>
              <polyline points="2 12 12 17 22 12"/>
            </svg>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>No tables available</p>
            <p style={{ fontSize: 11, opacity: 0.8 }}>
              {tables.length === 0
                ? 'Upload a CSV and create a table, or connect a database'
                : 'No tables match your search or filter'}
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 2 }}>
                {/* Select-all checkbox */}
                <th style={{ padding: '7px 0 7px 12px', width: 36 }}>
                  <div
                    onClick={toggleAll}
                    style={{
                      width: 16, height: 16,
                      borderRadius: '4px',
                      border: allChecked ? '2px solid var(--accent)' : '2px solid var(--border)',
                      background: allChecked ? 'var(--accent)' : 'transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {allChecked && (
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                        <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                </th>
                <th style={{ padding: '7px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Table</th>
                <th style={{ padding: '7px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</th>
                <th style={{ padding: '7px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Source</th>
                <th style={{ padding: '7px 12px 7px 4px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Size</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(table => (
                <TableRow
                  key={table.id}
                  table={table}
                  selected={selected.has(table.id)}
                  onToggle={toggleOne}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Footer action bar ── */}
      {selCount > 0 && (
        <div
          style={{
            padding: '10px 14px',
            borderTop: '1px solid var(--border)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            background: 'var(--surface)',
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {selCount} table{selCount !== 1 ? 's' : ''} selected
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setSelected(new Set())}
              style={{
                padding: '5px 12px',
                borderRadius: '7px',
                fontSize: 12,
                fontWeight: 600,
                background: 'transparent',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              Clear
            </button>
            <button
              onClick={() => setAgentInitOpen(true)}
              style={{
                padding: '5px 14px',
                borderRadius: '7px',
                fontSize: 12,
                fontWeight: 600,
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                opacity: 0.9,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0.9')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                <polyline points="2 17 12 22 22 17"/>
                <polyline points="2 12 12 17 22 12"/>
              </svg>
              Apply Layer
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slSpin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Agent Init Modal ── */}
      {agentInitOpen && (
        <AgentInitModal
          selectedTables={tables.filter(t => selected.has(t.id))}
          connectionInfo={(() => {
            const sel = tables.filter(t => selected.has(t.id));
            const hasDb  = sel.some(t => t.source === 'database');
            const hasCsv = sel.some(t => t.source === 'csv');
            if (hasDb && activeDbConnection) {
              return {
                source_type:     'database',
                connectionId:    activeDbConnection.connectionId,
                connectionName:  activeDbConnection.connectionName,
                has_csv_tables:  hasCsv,
              };
            }
            return { source_type: 'csv' };
          })()}
          userId={user?.id || user?.email || 'anonymous'}
          onClose={() => setAgentInitOpen(false)}
          onAgentCreated={(agent) => {
            setAgentInitOpen(false);
            setSelected(new Set());
            onAgentCreated?.(agent);
          }}
        />
      )}
    </div>
  );
}
