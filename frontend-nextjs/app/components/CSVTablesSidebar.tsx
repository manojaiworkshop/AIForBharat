'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './AuthProvider';

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ||
  'https://sleocl2mk5.execute-api.eu-north-1.amazonaws.com/Prod/chat'
).replace(/\/chat$/, '');

interface CsvTable {
  table_id:        string;
  table_name:      string;
  file_name:       string;
  columns:         string[];
  row_count:       number;
  truncated:       boolean;
  table_created:   boolean;
  pg_table_name?:  string;
  connection_name?: string;
  created_at:      string;
}

interface Props {
  open:        boolean;
  onClose:     () => void;
  onUploadNew: () => void;
  refreshKey:  number;
}

// ── Single table row ──────────────────────────────────────────
function CsvTableRow({ table }: { table: CsvTable }) {
  const [open, setOpen] = useState(false);
  const cols = table.columns || [];

  return (
    <div
      style={{
        borderRadius: '8px',
        overflow: 'hidden',
        marginBottom: '3px',
        border: '1px solid var(--border)',
      }}
    >
      {/* Table header button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors"
        style={{
          background: open ? 'var(--surface)' : 'transparent',
          color: 'var(--text)',
          fontSize: '13px',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'var(--surface-hover)'; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent'; }}
      >
        {/* CSV icon */}
        <svg
          width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2"
          style={{ color: 'var(--accent)', flexShrink: 0 }}
        >
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="3" y1="15" x2="21" y2="15"/>
          <line x1="9" y1="9" x2="9" y2="21"/>
        </svg>

        <span
          style={{
            flex: 1,
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={table.pg_table_name || table.table_name}
        >
          {table.pg_table_name || table.table_name}
        </span>

        <span
          style={{
            fontSize: '11px',
            color: 'var(--text-faint)',
            flexShrink: 0,
            marginRight: '4px',
          }}
        >
          {cols.length} col{cols.length !== 1 ? 's' : ''}
        </span>

        {/* Chevron */}
        <svg
          width="11" height="11" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5"
          style={{
            flexShrink: 0,
            color: 'var(--text-faint)',
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* Column list */}
      {open && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--main-bg)' }}>
          {/* Header row */}
          <div
            style={{
              padding: '4px 12px',
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--text-faint)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>Column</span>
            <span>{table.row_count.toLocaleString()} rows</span>
          </div>

          {cols.map((col, i) => (
            <div
              key={col}
              style={{
                padding: '5px 12px',
                fontSize: '12px',
                borderBottom: i < cols.length - 1 ? '1px solid var(--border)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {/* Column icon */}
              <svg
                width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5"
                style={{ color: 'var(--accent)', flexShrink: 0, opacity: 0.7 }}
              >
                <line x1="8" y1="6" x2="21" y2="6"/>
                <line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/>
                <line x1="3" y1="12" x2="3.01" y2="12"/>
                <line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
              <span
                style={{
                  fontFamily: 'monospace',
                  color: 'var(--text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {col}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '1px 5px',
                  background: '#6b728018',
                  color: '#6b7280',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  flexShrink: 0,
                }}
              >
                text
              </span>
            </div>
          ))}

          {/* Source file note */}
          <div
            style={{
              padding: '5px 12px',
              fontSize: '11px',
              color: 'var(--text-faint)',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={table.file_name}
            >
              {table.file_name}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main sidebar ──────────────────────────────────────────────
export default function CSVTablesSidebar({ open, onClose, onUploadNew, refreshKey }: Props) {
  const { user } = useAuth();
  const [tables,     setTables]     = useState<CsvTable[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [search,     setSearch]     = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchTables = useCallback(async (silent = false) => {
    if (!user?.token) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE}/csv/tables`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const created = (data.tables || []).filter((t: CsvTable) => t.table_created);
        setTables(created);
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.token]);

  // Fetch when opened or refreshKey changes
  useEffect(() => {
    if (open) fetchTables();
  }, [open, refreshKey, fetchTables]);

  if (!open) return null;

  const filtered = search
    ? tables.filter(t =>
        (t.pg_table_name || t.table_name).toLowerCase().includes(search.toLowerCase()) ||
        t.file_name.toLowerCase().includes(search.toLowerCase())
      )
    : tables;

  return (
    <aside
      style={{
        width: '280px',
        minWidth: '280px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--border)',
        overflow: 'hidden',
        animation: 'csvTableSidebarIn 0.22s ease',
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          padding: '12px 14px 10px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          {/* CSV icon */}
          <svg
            width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2"
            style={{ color: 'var(--accent)', flexShrink: 0 }}
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>

          <span
            style={{
              flex: 1,
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            CSV Tables
          </span>

          {/* Refresh button */}
          <button
            onClick={() => fetchTables(true)}
            disabled={refreshing}
            title="Refresh"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: '3px',
              borderRadius: '5px',
              display: 'flex',
              alignItems: 'center',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
              style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}
            >
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            title="Close"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: '3px',
              borderRadius: '5px',
              display: 'flex',
              alignItems: 'center',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Upload button */}
        <button
          onClick={onUploadNew}
          style={{
            width: '100%',
            padding: '7px 10px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            marginBottom: '10px',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="16 16 12 12 8 16"/>
            <line x1="12" y1="12" x2="12" y2="21"/>
            <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
          </svg>
          Upload CSV / Excel
        </button>

        {/* Search input */}
        <div style={{ position: 'relative' }}>
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2"
            style={{
              position: 'absolute',
              left: '9px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-faint)',
              pointerEvents: 'none',
            }}
          >
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tables…"
            style={{
              width: '100%',
              padding: '7px 10px 7px 30px',
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
      </div>

      {/* ── Count bar ── */}
      <div
        style={{
          padding: '6px 14px',
          fontSize: '11px',
          color: 'var(--text-faint)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>
          {filtered.length} of {tables.length} table{tables.length !== 1 ? 's' : ''}
        </span>
        {tables.length > 0 && (
          <span style={{ color: '#10b981', fontWeight: 600 }}>● Created</span>
        )}
      </div>

      {/* ── Table list ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
            <div
              style={{
                width: '20px',
                height: '20px',
                border: '2px solid var(--border)',
                borderTopColor: 'var(--accent)',
                borderRadius: '50%',
                animation: 'spin 0.7s linear infinite',
              }}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '32px 16px',
              color: 'var(--text-faint)',
              fontSize: '13px',
            }}
          >
            {search ? (
              <p>No tables match your search.</p>
            ) : tables.length === 0 ? (
              <>
                <svg
                  width="36" height="36" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.5"
                  style={{ margin: '0 auto 10px', color: 'var(--text-faint)', display: 'block', opacity: 0.5 }}
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                <p style={{ fontWeight: 600, marginBottom: '4px' }}>No tables yet</p>
                <p style={{ fontSize: '11px', opacity: 0.8 }}>
                  Upload a CSV and use ⋮ → Create Table to add it here
                </p>
              </>
            ) : (
              <p>No matching tables.</p>
            )}
          </div>
        ) : (
          filtered.map(table => (
            <CsvTableRow key={table.table_id} table={table} />
          ))
        )}
      </div>

      {/* ── Footer ── */}
      {tables.length > 0 && (
        <div
          style={{
            padding: '8px 14px',
            borderTop: '1px solid var(--border)',
            flexShrink: 0,
            fontSize: '11px',
            color: 'var(--text-faint)',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>Tables created in superadmin&apos;s database</span>
        </div>
      )}

      <style>{`
        @keyframes csvTableSidebarIn {
          from { opacity: 0; transform: translateX(-16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </aside>
  );
}
