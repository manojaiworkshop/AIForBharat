'use client';

import React, {
  useEffect, useState, useCallback, useRef, useLayoutEffect,
} from 'react';
import { useAuth } from './AuthProvider';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace('/chat', '') ??
  'https://sleocl2mk5.execute-api.eu-north-1.amazonaws.com/Prod';

const DEFAULT_WIDTH = 414;   // 360 * 1.15
const MIN_WIDTH     = 300;
const MAX_WIDTH     = 720;

export interface CsvFileItem {
  table_id:        string;
  table_name:      string;
  file_name:       string;
  columns:         string[];
  row_count:       number;
  truncated:       boolean;
  table_created:   boolean;
  pg_table_name?:  string;
  connection_name?: string;
  s3_key?:         string;
  file_ext?:       string;
  created_at:      string;
  rows?:           Record<string, string>[];
}

interface Props {
  open:        boolean;
  onClose:     () => void;
  onUploadNew: () => void;
  refreshKey:  number;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return iso; }
}

// ── Three-dot context menu ────────────────────────────────────

function FileMenu({
  item, token, onDelete, onTableCreated, onTableDropped,
}: {
  item:           CsvFileItem;
  token:          string;
  onDelete:       (id: string) => void;
  onTableCreated: (id: string, updated: Partial<CsvFileItem>) => void;
  onTableDropped: (id: string) => void;
}) {
  const [open,        setOpen]        = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const [creating,    setCreating]    = useState(false);
  const [droppingTbl, setDroppingTbl] = useState(false);
  const [menuPos,     setMenuPos]     = useState({ top: 0, right: 0 });
  const ref    = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({
        top:   rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen(v => !v);
  };

  const handleDelete = async () => {
    setOpen(false);
    if (!confirm(`Delete "${item.file_name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await fetch(`${API_BASE}/csv/tables/${item.table_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      onDelete(item.table_id);
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateTable = async () => {
    setOpen(false);
    setCreating(true);
    try {
      const res  = await fetch(`${API_BASE}/csv/tables/${item.table_id}/create-table`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) {
        onTableCreated(item.table_id, {
          table_created:   true,
          pg_table_name:   data.pg_table_name,
          connection_name: data.connection_name,
          columns:         data.columns,
          row_count:       data.row_count,
        });
      } else {
        alert(data.error ?? 'Failed to create table');
      }
    } catch {
      alert('Network error creating table');
    } finally {
      setCreating(false);
    }
  };

  const handleDropTable = async () => {
    setOpen(false);
    if (!confirm(`Drop table "${item.pg_table_name}" from the database? The CSV file will be kept.`)) return;
    setDroppingTbl(true);
    try {
      const res  = await fetch(`${API_BASE}/csv/tables/${item.table_id}/drop-table`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        onTableDropped(item.table_id);
      } else {
        alert(data.error ?? 'Failed to drop table');
      }
    } catch {
      alert('Network error dropping table');
    } finally {
      setDroppingTbl(false);
    }
  };

  return (
    <div ref={ref}>
      <button
        ref={btnRef}
        onClick={handleOpen}
        disabled={deleting || creating || droppingTbl}
        className="p-1 rounded hover:bg-[var(--border)] disabled:opacity-50"
        style={{ color: 'var(--text-muted)' }}
        title="Options"
      >
        {deleting || creating || droppingTbl ? (
          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="5"  r="1.2" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
            <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
          </svg>
        )}
      </button>

      {open && (
        <div
          className="fixed z-[9999] rounded-xl overflow-hidden shadow-xl"
          style={{
            width: 170,
            top:   menuPos.top,
            right: menuPos.right,
            background: 'var(--main-bg)',
            border: '1px solid var(--border)',
          }}
        >
          {!item.table_created && (
            <button
              onClick={handleCreateTable}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs hover:bg-[var(--surface-hover)] transition-colors"
              style={{ color: 'var(--text)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                <path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18" />
              </svg>
              Create Table
            </button>
          )}
          {item.table_created && (
            <>
              <div
                className="flex items-center gap-2 px-3 py-2 text-xs"
                style={{ color: '#10b981' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="truncate" title={item.pg_table_name}>{item.pg_table_name}</span>
              </div>
              <button
                onClick={handleDropTable}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs hover:bg-[#f59e0b15] transition-colors"
                style={{ color: '#f59e0b' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <line x1="3" y1="9" x2="21" y2="9"/>
                  <line x1="3" y1="15" x2="21" y2="15"/>
                  <line x1="9" y1="9" x2="9" y2="21"/>
                  <line x1="7" y1="4" x2="7" y2="2"/>
                  <line x1="12" y1="4" x2="12" y2="2"/>
                  <line x1="17" y1="4" x2="17" y2="2"/>
                </svg>
                Drop Table
              </button>
            </>
          )}
          <div style={{ borderTop: '1px solid var(--border)' }} />
          <button
            onClick={handleDelete}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs hover:bg-[#ef444415] transition-colors"
            style={{ color: '#ef4444' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6M9 6V4h6v2" />
            </svg>
            Delete file
          </button>
        </div>
      )}
    </div>
  );
}

// ── Single file row with expand / preview ─────────────────────

function FileRow({
  item, token, onDelete, onTableCreated, onTableDropped,
}: {
  item:           CsvFileItem;
  token:          string;
  onDelete:       (id: string) => void;
  onTableCreated: (id: string, updated: Partial<CsvFileItem>) => void;
  onTableDropped: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rows,     setRows]     = useState<Record<string, string>[] | null>(null);
  const [loading,  setLoading]  = useState(false);

  const loadRows = async () => {
    if (rows) return;
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/csv/tables/${item.table_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setRows(data.table?.rows ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) loadRows();
  };

  const previewRows = (rows ?? []).slice(0, 10);

  return (
    <div
      className="rounded-xl"
      style={{ border: '1px solid var(--border)', background: 'var(--surface)', overflow: 'visible' }}
    >
      {/* File header */}
      <div className="flex items-center gap-2 px-3 py-2.5 group">
        {/* expand toggle */}
        <button
          onClick={handleExpand}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke={item.table_created ? 'var(--accent)' : 'var(--text-muted)'}
            strokeWidth="2" className="flex-shrink-0">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }}>
              {item.file_name}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {item.row_count.toLocaleString()} rows · {item.columns.length} cols · {formatDate(item.created_at)}
            </p>
            {item.table_created && item.connection_name && (
              <p className="text-xs truncate" style={{ color: 'var(--accent)', opacity: 0.85 }}>
                ✓ Table: {item.pg_table_name}
              </p>
            )}
          </div>
        </button>

        {/* three-dot menu */}
        <FileMenu
          item={item}
          token={token}
          onDelete={onDelete}
          onTableCreated={onTableCreated}
          onTableDropped={onTableDropped}
        />

        {/* chevron */}
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="var(--text-muted)" strokeWidth="2"
          className={`transition-transform flex-shrink-0 cursor-pointer ${expanded ? 'rotate-180' : ''}`}
          onClick={handleExpand}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Expanded section: columns + row preview */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
            </div>
          ) : (
            <>
              {/* Column badges */}
              <div className="px-3 py-2 flex flex-wrap gap-1.5">
                {item.columns.map(col => (
                  <span key={col}
                    className="inline-block px-1.5 py-0.5 rounded text-xs font-mono"
                    style={{ background: 'var(--border)', color: 'var(--text-muted)' }}>
                    {col}
                  </span>
                ))}
              </div>

              {/* Data preview table */}
              {previewRows.length > 0 && (
                <div className="overflow-x-auto" style={{ borderTop: '1px solid var(--border)' }}>
                  <table className="text-xs w-full" style={{ color: 'var(--text)' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {item.columns.map(col => (
                          <th key={col}
                            className="px-3 py-1.5 text-left font-medium whitespace-nowrap"
                            style={{ color: 'var(--text-muted)' }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} style={{
                          borderBottom: '1px solid var(--border)',
                          background: i % 2 === 0 ? 'transparent' : 'var(--surface-hover)',
                        }}>
                          {item.columns.map(col => (
                            <td key={col} className="px-3 py-1 whitespace-nowrap max-w-[120px] truncate">
                              {row[col] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {item.row_count > 10 && (
                    <p className="px-3 py-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      Showing 10 of {item.row_count.toLocaleString()} rows
                    </p>
                  )}
                </div>
              )}

              {previewRows.length === 0 && (
                <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>No rows to preview</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main CSVSidebar component ─────────────────────────────────

export default function CSVSidebar({ open, onClose, onUploadNew, refreshKey }: Props) {
  const { user }  = useAuth();
  const [files,   setFiles]   = useState<CsvFileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [width,   setWidth]   = useState(DEFAULT_WIDTH);
  const dragging  = useRef(false);
  const startX    = useRef(0);
  const startW    = useRef(DEFAULT_WIDTH);

  // ── Resize drag handle ──────────────────────────────────────
  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current   = e.clientX;
    startW.current   = width;

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startX.current - ev.clientX;   // dragging left edge leftward = wider
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW.current + delta)));
    };
    const onUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  };

  // ── Data fetching ───────────────────────────────────────────
  const fetchFiles = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    setError('');
    try {
      const res  = await fetch(`${API_BASE}/csv/tables`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setFiles(data.tables ?? []);
      } else {
        setError(data.error ?? 'Failed to load files');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => {
    if (open) fetchFiles();
  }, [open, refreshKey, fetchFiles]);

  const handleDelete       = (id: string) => setFiles(prev => prev.filter(f => f.table_id !== id));
  const handleTableCreated = (id: string, updated: Partial<CsvFileItem>) =>
    setFiles(prev => prev.map(f => f.table_id === id ? { ...f, ...updated } : f));
  const handleTableDropped = (id: string) =>
    setFiles(prev => prev.map(f => f.table_id === id
      ? { ...f, table_created: false, pg_table_name: undefined, connection_name: undefined }
      : f));

  if (!open) return null;

  return (
    <div
      className="relative flex flex-col flex-shrink-0 h-full"
      style={{
        width,
        background:  'var(--main-bg)',
        borderLeft:  '1px solid var(--border)',
        transition:  dragging.current ? 'none' : undefined,
      }}
    >
      {/* ── Drag-resize handle (left edge) ── */}
      <div
        onMouseDown={onResizeStart}
        className="absolute left-0 top-0 h-full z-10 cursor-col-resize"
        style={{ width: 4 }}
        title="Drag to resize"
      />

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>CSV Files</span>
          {files.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={{ background: 'var(--accent)20', color: 'var(--accent)' }}>
              {files.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={fetchFiles}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--text-muted)' }} title="Refresh">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
            </svg>
          </button>
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--text-muted)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Upload button ── */}
      <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={onUploadNew}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload CSV / Excel
        </button>
      </div>

      {/* ── File list ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {loading && (
          <div className="flex items-center justify-center py-10">
            <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl px-3 py-2.5" style={{ background: '#ef444415', border: '1px solid #ef444430' }}>
            <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>
          </div>
        )}

        {!loading && !error && files.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <div className="text-center">
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>No files uploaded yet</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Upload a CSV or Excel file to get started
              </p>
            </div>
            <button onClick={onUploadNew}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: 'var(--accent)', color: '#fff' }}>
              Upload CSV
            </button>
          </div>
        )}

        {!loading && files.map(file => (
          <FileRow
            key={file.table_id}
            item={file}
            token={user?.token ?? ''}
            onDelete={handleDelete}
            onTableCreated={handleTableCreated}
            onTableDropped={handleTableDropped}
          />
        ))}
      </div>
    </div>
  );
}
