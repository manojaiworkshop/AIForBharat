'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useAuth } from './AuthProvider';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace('/chat', '') ??
  'https://sleocl2mk5.execute-api.eu-north-1.amazonaws.com/Prod';

export interface UploadedTable {
  table_id: string;
  table_name: string;
  file_name: string;
  columns: string[];
  row_count: number;
  truncated: boolean;
  created_at: string;
}

interface FileItem {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
  result?: UploadedTable;
  progress: number;
}

interface Props {
  onClose: () => void;
  onUploaded: (table: UploadedTable) => void;
}

const ACCEPT = '.csv,.xlsx,.xls,.xlsm';
const MAX_MB = 8;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip data URL prefix: "data:...;base64,"
      resolve(result.split(',')[1] ?? result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fileExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function FileStatusIcon({ status }: { status: FileItem['status'] }) {
  if (status === 'done')
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
        <circle cx="12" cy="12" r="10" />
        <polyline points="8 12 11 15 16 9" />
      </svg>
    );
  if (status === 'error')
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    );
  if (status === 'uploading')
    return (
      <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12a9 9 0 11-6.219-8.56" />
      </svg>
    );
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
    </svg>
  );
}

export default function CSVUploadModal({ onClose, onUploaded }: Props) {
  const { user } = useAuth();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploading = files.some(f => f.status === 'uploading');
  const allDone   = files.length > 0 && files.every(f => f.status === 'done' || f.status === 'error');

  const addFiles = (incoming: File[]) => {
    const valid = incoming.filter(f => {
      const ext = fileExt(f.name);
      return ['csv', 'xlsx', 'xls', 'xlsm'].includes(ext);
    });
    setFiles(prev => {
      const existingNames = new Set(prev.map(f => f.file.name));
      const newItems: FileItem[] = valid
        .filter(f => !existingNames.has(f.name))
        .map(f => ({ id: crypto.randomUUID(), file: f, status: 'pending', progress: 0 }));
      return [...prev, ...newItems];
    });
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, []);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);

  const removeFile = (id: string) =>
    setFiles(prev => prev.filter(f => f.id !== id));

  const uploadAll = async () => {
    if (!user?.token) return;
    const pending = files.filter(f => f.status === 'pending');
    for (const item of pending) {
      if (item.file.size > MAX_MB * 1024 * 1024) {
        setFiles(prev => prev.map(f =>
          f.id === item.id
            ? { ...f, status: 'error', error: `File too large (max ${MAX_MB}MB)` }
            : f
        ));
        continue;
      }
      // mark uploading
      setFiles(prev => prev.map(f =>
        f.id === item.id ? { ...f, status: 'uploading', progress: 30 } : f
      ));
      try {
        const b64 = await fileToBase64(item.file);
        setFiles(prev => prev.map(f =>
          f.id === item.id ? { ...f, progress: 60 } : f
        ));
        const res = await fetch(`${API_BASE}/csv/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user.token}`,
          },
          body: JSON.stringify({
            file_name:    item.file.name,
            file_content: b64,
            file_type:    fileExt(item.file.name),
          }),
        });
        const data = await res.json();
        if (res.ok) {
          setFiles(prev => prev.map(f =>
            f.id === item.id
              ? { ...f, status: 'done', progress: 100, result: data as UploadedTable }
              : f
          ));
          onUploaded(data as UploadedTable);
        } else {
          setFiles(prev => prev.map(f =>
            f.id === item.id
              ? { ...f, status: 'error', error: data.error ?? `Error ${res.status}` }
              : f
          ));
        }
      } catch (e) {
        setFiles(prev => prev.map(f =>
          f.id === item.id
            ? { ...f, status: 'error', error: String(e) }
            : f
        ));
      }
    }
  };

  const hasPending = files.some(f => f.status === 'pending');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
    >
      <div
        className="w-full max-w-lg rounded-2xl shadow-2xl flex flex-col"
        style={{ background: 'var(--main-bg)', border: '1px solid var(--border)', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Upload CSV / Excel</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors py-8 select-none"
            style={{
              borderColor: dragging ? 'var(--accent)' : 'var(--border)',
              background: dragging ? 'var(--accent)0a' : 'var(--surface)',
            }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={dragging ? 'var(--accent)' : 'var(--text-muted)'} strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div className="text-center">
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                {dragging ? 'Drop files here' : 'Drag & drop files here'}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                or click to browse · CSV, XLSX, XLS · max {MAX_MB}MB each
              </p>
              <p className="text-xs px-3 text-center" style={{ color: 'var(--accent)', opacity: 0.85 }}>
                Each file will create a table in your connected PostgreSQL database
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2">
              {files.map(item => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  <FileStatusIcon status={item.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                      {item.file.name}
                    </p>
                    {item.status === 'pending' && (
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {(item.file.size / 1024).toFixed(0)} KB · ready
                      </p>
                    )}
                    {item.status === 'uploading' && (
                      <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${item.progress}%`, background: 'var(--accent)' }}
                        />
                      </div>
                    )}
                    {item.status === 'done' && item.result && (
                      <p className="text-xs" style={{ color: '#10b981' }}>
                        ✓ {item.result.row_count.toLocaleString()} rows · {item.result.columns.length} columns
                        {item.result.truncated && ` (first ${item.result.row_count.toLocaleString()})`}
                      </p>
                    )}
                    {item.status === 'error' && (
                      <p className="text-xs truncate" style={{ color: '#ef4444' }}>{item.error}</p>
                    )}
                  </div>
                  {item.status !== 'uploading' && (
                    <button
                      onClick={() => removeFile(item.id)}
                      className="p-1 rounded hover:bg-[var(--surface-hover)] flex-shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {files.length === 0
              ? 'No files selected'
              : `${files.length} file${files.length > 1 ? 's' : ''} selected`}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
            >
              {allDone ? 'Close' : 'Cancel'}
            </button>
            {hasPending && (
              <button
                onClick={uploadAll}
                disabled={uploading}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {uploading ? 'Uploading…' : `Upload ${files.filter(f => f.status === 'pending').length} file${files.filter(f => f.status === 'pending').length > 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
