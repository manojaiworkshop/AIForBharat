'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';

const ReactECharts = dynamic(() => import('echarts-for-react'), {
  ssr: false,
  loading: () => (
    <div style={{ height: 350, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
      Loading chart…
    </div>
  ),
});

export interface SqlResultData {
  sql: string;
  columns: string[];
  rows: any[][];
  total_rows: number;
  execution_time?: number;
  truncated?: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sqlResult?: SqlResultData;
  agentError?: string;
  analystCharts?: Record<string, any>[];
}

// ── EChartsPanel ───────────────────────────────────────────────────────────
const CHART_ICONS = [
  // line/bar icon
  <svg key="line" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  // pie icon
  <svg key="pie" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>,
];

function EChartsPanel({ option, index }: { option: Record<string, any>; index: number }) {
  const title = (option.title as any)?.text || (option.title as any)?.[0]?.text || 'Analysis Chart';
  const icon  = CHART_ICONS[index] ?? CHART_ICONS[0];
  return (
    <div className="mt-4 rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid var(--border)',
        fontSize: 12,
        fontWeight: 600,
        color: '#2A93D5',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        {icon}
        {title}
      </div>
      <div style={{ padding: '12px 8px' }}>
        <ReactECharts
          option={option}
          style={{ height: 350 }}
          opts={{ renderer: 'canvas' }}
        />
      </div>
    </div>
  );
}

// ── CopyButton ─────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-all hover:opacity-80"
      style={{ background: 'rgba(255,255,255,0.1)', color: '#ccc' }}
    >
      {copied ? (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          Copied
        </>
      ) : (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy
        </>
      )}
    </button>
  );
}

// ── SqlResultCard ──────────────────────────────────────────────────────────
const PAGE_SIZES = [10, 25, 50, 100];

function displayVal(v: any): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function downloadCSV(columns: string[], rows: any[][], name = 'results') {
  const escape = (v: any) => {
    const s = displayVal(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(escape).join(',')];
  rows.forEach(r => lines.push(r.map(escape).join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${name}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function downloadTSV(columns: string[], rows: any[][], name = 'results') {
  const lines = [columns.join('\t')];
  rows.forEach(r => lines.push(r.map(displayVal).join('\t')));
  const blob = new Blob([lines.join('\n')], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${name}.xls`; a.click();
  URL.revokeObjectURL(url);
}

function SqlResultCard({ result }: { result: SqlResultData }) {
  const { sql, columns, rows, total_rows, execution_time, truncated } = result;
  const [page, setPage]       = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch]   = useState('');
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  // Filter
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => r.some(v => displayVal(v).toLowerCase().includes(q)));
  }, [rows, search]);

  // Sort
  const sorted = useMemo(() => {
    if (sortCol === null) return filtered;
    return [...filtered].sort((a, b) => {
      const av = displayVal(a[sortCol]), bv = displayVal(b[sortCol]);
      return sortAsc ? av.localeCompare(bv, undefined, { numeric: true }) : bv.localeCompare(av, undefined, { numeric: true });
    });
  }, [filtered, sortCol, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage   = Math.min(page, totalPages - 1);
  const pageRows   = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  function handleSort(idx: number) {
    if (sortCol === idx) setSortAsc(a => !a);
    else { setSortCol(idx); setSortAsc(true); }
    setPage(0);
  }

  function handleSearch(v: string) { setSearch(v); setPage(0); }

  const shownCount = filtered.length;
  const startRow   = safePage * pageSize + 1;
  const endRow     = Math.min((safePage + 1) * pageSize, shownCount);

  return (
    <div className="rounded-xl overflow-hidden my-3" style={{
      border: '1px solid var(--table-border, var(--border))',
      background: 'var(--table-card-bg, var(--surface))',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
    }}>

      {/* ── SQL block ── */}
      <div className="mx-4 mb-3 rounded-lg overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.15)' }}>
        <div className="flex items-center justify-between px-4 py-2" style={{ background: '#1e2026' }}>
          <div className="flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2">
              <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
            </svg>
            <span className="text-xs font-mono" style={{ color: '#888' }}>SQL Query</span>
          </div>
          <CopyButton text={sql} />
        </div>
        <SyntaxHighlighter
          language="sql"
          style={oneDark}
          customStyle={{ margin: 0, padding: '0.75rem 1rem', fontSize: '0.8rem', lineHeight: '1.5', borderRadius: 0, background: '#181b20' }}
          wrapLongLines={false}
        >
          {sql}
        </SyntaxHighlighter>
      </div>

      {/* ── Stats + toolbar ── */}
      <div className="flex items-center gap-3 px-4 pb-3 flex-wrap">
        {/* Row/time info */}
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {total_rows.toLocaleString()} {total_rows === 1 ? 'row' : 'rows'}
          {truncated && <span className="text-yellow-400"> (capped at 5 000)</span>}
          {execution_time != null && <span style={{ color: 'var(--text-faint)' }}> · {execution_time}s</span>}
        </span>

        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
          {/* CSV */}
          <button
            onClick={() => downloadCSV(columns, rows)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
            style={{ background: 'var(--table-header-bg, var(--surface))', border: '1px solid var(--table-border, var(--border))', color: 'var(--text-muted)' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            CSV
          </button>
          {/* Excel */}
          <button
            onClick={() => downloadTSV(columns, rows)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
            style={{ background: 'var(--table-header-bg, var(--surface))', border: '1px solid var(--table-border, var(--border))', color: 'var(--text-muted)' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>
            Excel
          </button>
          {/* Search */}
          <div className="relative">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search in results…"
              className="pl-7 pr-3 py-1.5 rounded-lg text-xs outline-none"
              style={{
                background: 'var(--table-header-bg, var(--surface))', border: '1px solid var(--table-border, var(--border))',
                color: 'var(--text)', width: 160,
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      {columns.length > 0 ? (
        <div className="overflow-x-auto" style={{ borderTop: '1px solid var(--table-border, var(--border))' }}>
          <table className="w-full text-xs" style={{ borderCollapse: 'collapse', minWidth: columns.length * 100 }}>
            <thead style={{ background: 'var(--table-header-bg, var(--surface))' }}>
              <tr>
                <th className="px-3 py-2.5 text-right font-semibold w-10 select-none"
                  style={{
                    color: 'var(--text-faint)',
                    borderBottom: '2px solid var(--table-border, var(--border))',
                    borderRight: '2px solid var(--table-divider, #c8d0da)',
                    minWidth: 40,
                    background: 'var(--table-header-bg, var(--surface))',
                  }}>
                  #
                </th>
                {columns.map((col, ci) => (
                  <th
                    key={ci}
                    onClick={() => handleSort(ci)}
                    className="px-3 py-2.5 text-left font-semibold cursor-pointer select-none whitespace-nowrap hover:opacity-80"
                    style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--table-border, var(--border))' }}
                  >
                    <div className="flex items-center gap-1">
                      {col}
                      {sortCol === ci ? (
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5">
                          {sortAsc ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
                        </svg>
                      ) : (
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.3 }}>
                          <polyline points="8 9 12 5 16 9"/><polyline points="16 15 12 19 8 15"/>
                        </svg>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody style={{ background: 'var(--table-bg, var(--surface))' }}>
              {pageRows.map((row, ri) => {
                const globalIdx = safePage * pageSize + ri + 1;
                return (
                  <tr
                    key={ri}
                    style={{
                      borderBottom: '1px solid var(--table-border, var(--border))',
                      background: ri % 2 === 1 ? 'var(--table-header-bg, var(--surface))' : 'var(--table-bg, var(--surface))',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--table-row-hover, var(--surface-hover))')}
                    onMouseLeave={e => (e.currentTarget.style.background = ri % 2 === 1 ? 'var(--table-header-bg, var(--surface))' : 'var(--table-bg, var(--surface))')}
                  >
                    <td className="px-3 py-2 font-mono text-right" style={{
                      color: 'var(--text-faint)',
                      borderRight: '2px solid var(--table-divider, #c8d0da)',
                      minWidth: 40,
                      background: 'var(--table-header-bg, var(--surface))',
                      position: 'relative',
                      zIndex: 1,
                    }}>
                      {globalIdx}
                    </td>
                    {row.map((cell, ci) => {
                      const val = displayVal(cell);
                      const isNull = cell === null || cell === undefined;
                      return (
                        <td
                          key={ci}
                          className="px-3 py-2 max-w-xs truncate"
                          style={{
                            color: isNull ? 'var(--text-faint)' : 'var(--text)',
                            fontStyle: isNull ? 'italic' : undefined,
                          }}
                          title={val.length > 60 ? val : undefined}
                        >
                          {search && !isNull ? (
                            <HighlightCell val={val} query={search} />
                          ) : (
                            isNull ? 'NULL' : val
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="py-8 text-center text-xs"
                    style={{ color: 'var(--text-faint)' }}>
                    No rows match your search
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-4 pb-4 text-xs" style={{ color: 'var(--text-faint)' }}>
          Query executed successfully (no rows returned).
        </div>
      )}

      {/* ── Pagination footer ── */}
      {columns.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 gap-3 flex-wrap"
          style={{ borderTop: '1px solid var(--table-border, var(--border))', background: 'var(--table-footer-bg, var(--surface))' }}>
          {/* Rows per page */}
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-faint)' }}>
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(+e.target.value); setPage(0); }}
              className="rounded-lg px-1.5 py-1 text-xs outline-none"
              style={{ background: 'var(--table-header-bg, var(--surface))', border: '1px solid var(--table-border, var(--border))', color: 'var(--text-muted)' }}
            >
              {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Page info + nav */}
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-faint)' }}>
            <span>{shownCount > 0 ? `${startRow}-${endRow} of ${shownCount.toLocaleString()}` : '0'}</span>
            <div className="flex items-center gap-1">
              {/* First */}
              <NavBtn disabled={safePage === 0} onClick={() => setPage(0)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>
              </NavBtn>
              {/* Prev */}
              <NavBtn disabled={safePage === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              </NavBtn>
              {/* Page numbers */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(0, Math.min(safePage - 2, totalPages - 5));
                const p = start + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className="w-6 h-6 rounded text-xs font-semibold flex items-center justify-center transition-colors"
                    style={{
                      background: p === safePage ? 'var(--accent)' : 'transparent',
                      color: p === safePage ? '#fff' : 'var(--text-faint)',
                    }}
                  >
                    {p + 1}
                  </button>
                );
              })}
              {/* Next */}
              <NavBtn disabled={safePage >= totalPages - 1} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </NavBtn>
              {/* Last */}
              <NavBtn disabled={safePage >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
              </NavBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NavBtn({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="w-6 h-6 rounded flex items-center justify-center transition-opacity"
      style={{
        background: 'var(--table-header-bg, var(--surface))',
        border: '1px solid var(--table-border, var(--border))',
        color: disabled ? 'var(--text-faint)' : 'var(--text-muted)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}

function HighlightCell({ val, query }: { val: string; query: string }) {
  const idx = val.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return <>{val}</>;
  return (
    <>
      {val.slice(0, idx)}
      <mark style={{ background: 'var(--accent)30', color: 'var(--accent)', borderRadius: 2 }}>
        {val.slice(idx, idx + query.length)}
      </mark>
      {val.slice(idx + query.length)}
    </>
  );
}

// ── Markdown components ────────────────────────────────────────────────────
const mdComponents = {
  // Headings
  h1: ({ children }: any) => <h1 className="block text-xl font-bold mt-5 mb-3" style={{ color: 'var(--text)' }}>{children}</h1>,
  h2: ({ children }: any) => <h2 className="block text-lg font-bold mt-4 mb-3" style={{ color: 'var(--text)' }}>{children}</h2>,
  h3: ({ children }: any) => <h3 className="block text-base font-bold mt-3 mb-2" style={{ color: 'var(--text)' }}>{children}</h3>,
  p: ({ children }: any) => <p className="mb-3 last:mb-0 leading-7" style={{ color: 'var(--text)' }}>{children}</p>,
  strong: ({ children }: any) => <strong className="font-semibold" style={{ color: 'var(--text)' }}>{children}</strong>,
  em: ({ children }: any) => <em className="italic" style={{ color: 'var(--text-muted)' }}>{children}</em>,
  ul: ({ children }: any) => <ul className="mb-4 ml-8 space-y-1.5 list-disc" style={{ color: 'var(--text)' }}>{children}</ul>,
  ol: ({ children }: any) => <ol className="mb-4 ml-8 space-y-1.5 list-decimal" style={{ color: 'var(--text)' }}>{children}</ol>,
  li: ({ children }: any) => <li className="leading-7 pl-1">{children}</li>,
  blockquote: ({ children }: any) => (
    <blockquote className="my-3 pl-4 py-1 italic text-sm" style={{ borderLeft: '3px solid var(--accent)', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '0 6px 6px 0' }}>{children}</blockquote>
  ),
  hr: () => <hr className="my-4" style={{ borderColor: 'var(--border)' }} />,
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:opacity-80 transition-opacity" style={{ color: 'var(--accent)' }}>{children}</a>
  ),
  table: ({ children }: any) => (
    <div className="overflow-x-auto my-4 md-table-wrapper" style={{
      borderRadius: 10,
      border: '1.5px solid rgba(255,255,255,0.18)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.13)',
      overflow: 'hidden',
    }}>
      <table className="w-full text-sm" style={{ borderCollapse: 'collapse', color: 'var(--text)' }}>{children}</table>
    </div>
  ),
  thead: ({ children }: any) => (
    <thead style={{
      background: 'linear-gradient(90deg, rgba(42,147,213,0.18) 0%, rgba(42,147,213,0.10) 100%)',
      borderBottom: '1.5px solid rgba(255,255,255,0.18)',
    }}>{children}</thead>
  ),
  tbody: ({ children }: any) => <tbody>{children}</tbody>,
  tr: ({ children }: any) => (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}>{children}</tr>
  ),
  th: ({ children }: any) => (
    <th className="px-4 py-2.5 text-left font-semibold"
      style={{
        color: 'var(--accent, #2A93D5)',
        borderRight: '1px solid rgba(255,255,255,0.10)',
        fontSize: '0.72rem',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>{children}</th>
  ),
  td: ({ children }: any) => (
    <td className="px-4 py-2.5"
      style={{
        color: 'var(--text)',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        fontSize: '0.82rem',
      }}>{children}</td>
  ),
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    const lang  = match ? match[1] : '';
    const code  = String(children).replace(/\n$/, '');
    if (!inline && (match || code.includes('\n'))) {
      return (
        <div className="my-3 rounded-xl overflow-hidden text-sm" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center justify-between px-4 py-2" style={{ background: '#21252b', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span className="text-xs font-mono" style={{ color: '#888' }}>{lang || 'code'}</span>
            <CopyButton text={code} />
          </div>
          <SyntaxHighlighter language={lang || 'text'} style={oneDark} customStyle={{ margin: 0, padding: '1rem', fontSize: '0.8125rem', lineHeight: '1.6', borderRadius: 0 }} wrapLongLines={false} {...props}>
            {code}
          </SyntaxHighlighter>
        </div>
      );
    }
    return (
      <code className="px-1.5 py-0.5 rounded-md text-xs font-mono" style={{ background: 'var(--surface)', color: 'var(--accent)', border: '1px solid var(--border)' }} {...props}>
        {children}
      </code>
    );
  },
};

// ── ChatMessage ────────────────────────────────────────────────────────────
export default function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end px-4 py-2 animate-fade-in">
        <div
          className="max-w-[72%] lg:max-w-[60%] px-4 py-3 rounded-2xl rounded-br-sm text-sm leading-relaxed"
          style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', wordBreak: 'break-word' }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant
  return (
    <div className="px-4 py-3 animate-fade-in">
      <div className="max-w-3xl mx-auto w-full">
        {/* Header accent */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-5 h-5 rounded-md flex items-center justify-center text-white flex-shrink-0 shadow"
            style={{ background: 'linear-gradient(135deg, #2A93D5, #1a7ab8)', fontSize: '10px', fontWeight: 800 }}>
            ⚡
          </div>
          <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>Mercury Grid</span>
        </div>

        {/* SQL Result card + streaming markdown answer below */}
        {message.sqlResult && (
          <div className="pl-7">
            <SqlResultCard result={message.sqlResult} />
            {/* Rich markdown description streamed below the table */}
            {message.content && (
              <div className="mt-4 text-sm leading-7" style={{ color: 'var(--text)' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
            {/* Cursor while streaming */}
            {!message.content && (
              <div className="mt-3">
                <span className="inline-block w-0.5 h-4 rounded animate-pulse" style={{ background: 'var(--accent)' }} />
              </div>
            )}
          </div>
        )}

        {/* Agent error */}
        {message.agentError && (
          <div className="pl-7">
            <div className="rounded-xl px-4 py-3 text-sm mb-2" style={{ background: '#ef444415', border: '1px solid #ef444440', color: '#ef4444' }}>
              <strong>Query Error:</strong> {message.agentError}
            </div>
            {/* Show SQL if partial */}
            {message.content && (
              <div className="text-sm leading-7" style={{ color: 'var(--text)' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* Regular markdown content (shown when no sqlResult / no agentError) */}
        {!message.sqlResult && !message.agentError && (
          <div className="text-sm leading-7 pl-7" style={{ color: 'var(--text)' }}>
            {message.content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {message.content}
              </ReactMarkdown>
            ) : (
              <span className="inline-block w-0.5 h-4 rounded animate-pulse" style={{ background: 'var(--accent)' }} />
            )}
          </div>
        )}

        {/* Analyst charts — multi-line + pie rendered below the markdown report */}
        {message.analystCharts && message.analystCharts.length > 0 && (
          <div className="pl-7">
            {message.analystCharts.map((chart, i) => (
              <EChartsPanel key={i} option={chart} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

