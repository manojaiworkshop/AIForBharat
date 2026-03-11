'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import type { TableInfo } from './ConnectDBModal';

const BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  'https://sleocl2mk5.execute-api.eu-north-1.amazonaws.com/Prod/chat'
).replace(/\/chat$/, '');

interface ActiveDbConnection {
  connectionId: string;
  connectionName: string;
  tables: TableInfo[];
}

interface DBSidebarProps {
  connection: ActiveDbConnection;
  onClose: () => void;
  onDisconnect: () => void;
  onTableClick?: (table: TableInfo) => void;
}

// ── Type badge ────────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const short = type
    .replace('character varying', 'varchar')
    .replace('timestamp without time zone', 'timestamp')
    .replace('timestamp with time zone', 'timestamptz')
    .replace('double precision', 'float8');
  const color =
    /int|serial|numeric|float|decimal/.test(type) ? '#3b82f6'
    : /char|text|json/.test(type) ? '#10b981'
    : /bool/.test(type) ? '#f59e0b'
    : /time|date/.test(type) ? '#8b5cf6'
    : '#6b7280';
  return (
    <span
      style={{
        color,
        fontSize: '10px',
        fontWeight: 600,
        padding: '1px 5px',
        background: `${color}18`,
        borderRadius: '4px',
        fontFamily: 'monospace',
        whiteSpace: 'nowrap',
      }}
    >
      {short}
    </span>
  );
}

// ── Single table row ──────────────────────────────────────────
function TableRow({ table }: { table: TableInfo }) {
  const [open, setOpen] = useState(false);

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
        {/* Table icon */}
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

        <span style={{ flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {table.name}
        </span>

        <span style={{ fontSize: '11px', color: 'var(--text-faint)', flexShrink: 0, marginRight: '4px' }}>
          {table.columns.length} col{table.columns.length !== 1 ? 's' : ''}
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
          {/* Column header row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              borderBottom: '1px solid var(--border)',
              padding: '4px 12px',
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--text-faint)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            <span>Column</span>
            <span style={{ paddingRight: '16px' }}>Type</span>
            <span style={{ textAlign: 'center', minWidth: '28px' }}>Null</span>
          </div>

          {/* Rows */}
          {table.columns.map((col, i) => (
            <div
              key={col.name}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                padding: '4px 12px',
                fontSize: '12px',
                borderBottom: i < table.columns.length - 1 ? '1px solid var(--border)' : 'none',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: 'monospace',
                  color: 'var(--text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {col.name}
              </span>
              <span style={{ paddingRight: '16px' }}>
                <TypeBadge type={col.type} />
              </span>
              <span
                style={{
                  textAlign: 'center',
                  minWidth: '28px',
                  fontSize: '12px',
                  color: col.nullable ? '#10b981' : 'var(--text-faint)',
                }}
              >
                {col.nullable ? '✓' : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function DBSidebar({ connection, onClose, onDisconnect }: DBSidebarProps) {
  const { user } = useAuth();
  const [tables, setTables] = useState<TableInfo[]>(connection.tables);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Sync if parent updates tables (e.g. after reconnect)
  useEffect(() => {
    setTables(connection.tables);
  }, [connection.tables]);

  const headers = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${user?.token}`,
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Try cache first (fast), backend falls back to live DB on miss
      const res = await fetch(
        `${BASE_URL}/db/cached-tables?connection_id=${connection.connectionId}`,
        { headers: headers() },
      );
      if (res.ok) {
        const data = await res.json();
        setTables(data.tables || []);
      }
    } catch {
      // silently ignore
    } finally {
      setRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.connectionId, user?.token]);

  const filtered = search
    ? tables.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
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
        animation: 'dbSidebarIn 0.22s ease',
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
        {/* Connection name + icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          {/* Green connected dot */}
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#10b981',
              flexShrink: 0,
              boxShadow: '0 0 6px #10b981aa',
            }}
          />
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
            title={connection.connectionName}
          >
            {connection.connectionName}
          </span>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh tables"
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

          {/* Close */}
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

      {/* ── Table count bar ── */}
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
        <span style={{ color: '#10b981', fontWeight: 600 }}>● Connected</span>
      </div>

      {/* ── Table list ── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 10px',
        }}
      >
        {filtered.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '24px 0', fontSize: '12px', color: 'var(--text-faint)' }}>
            {search ? 'No tables match your search.' : 'No tables found.'}
          </p>
        ) : (
          filtered.map(table => <TableRow key={table.name} table={table} />)
        )}
      </div>

      {/* ── Footer ── */}
      <div
        style={{
          padding: '10px 14px',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={onDisconnect}
          style={{
            width: '100%',
            padding: '7px',
            borderRadius: '7px',
            fontSize: '12px',
            fontWeight: 600,
            background: 'transparent',
            color: '#ef4444',
            border: '1px solid #ef444440',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#ef444412')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Disconnect
        </button>
      </div>

      <style>{`
        @keyframes dbSidebarIn {
          from { opacity: 0; transform: translateX(-16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </aside>
  );
}
