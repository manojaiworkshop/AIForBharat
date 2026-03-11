'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ThemeToggle from './ThemeToggle';
import SettingsModal from './SettingsModal';
import { useAuth } from './AuthProvider';
import type { Chat } from '../page';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, newTitle: string) => void;
  onPinChat: (id: string) => void;
  onUploadCSV: () => void;
  onConnectDB: () => void;
  onSemanticLayer: () => void;
}

// ── Per-chat context menu ────────────────────────────────────
function ChatMenu({
  chat, onClose, onDelete, onRename, onPin, onArchive,
}: {
  chat: Chat;
  onClose: () => void;
  onDelete: () => void;
  onRename: () => void;
  onPin: () => void;
  onArchive: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', h), 30);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', h); };
  }, [onClose]);

  const items = [
    {
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>,
      label: 'Share',
      action: () => { navigator.clipboard.writeText(window.location.origin + '?c=' + chat.id); onClose(); },
    },
    {
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
      label: 'Start a group chat',
      disabled: true,
      action: onClose,
    },
    {
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
      label: 'Rename',
      action: () => { onClose(); onRename(); },
    },
    {
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>,
      label: chat.pinned ? 'Unpin chat' : 'Pin chat',
      action: () => { onPin(); onClose(); },
    },
    {
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
      label: 'Archive',
      action: () => { onArchive(); onClose(); },
    },
    { divider: true },
    {
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>,
      label: 'Delete',
      danger: true,
      action: () => { onDelete(); onClose(); },
    },
  ] as const;

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-50 animate-fade-in rounded-xl overflow-hidden py-1"
      style={{
        width: '200px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow)',
      }}
    >
      {items.map((item, i) => {
        if ('divider' in item) return <div key={i} className="my-1" style={{ borderTop: '1px solid var(--border)' }} />;
        return (
          <button
            key={item.label}
            onClick={item.action}
            disabled={'disabled' in item && item.disabled}
            className="w-full flex items-center gap-3 px-3 py-2 text-xs text-left transition-colors disabled:opacity-40"
            style={{ color: 'danger' in item && item.danger ? '#ef4444' : 'var(--text)', background: 'transparent' }}
            onMouseEnter={e => { if (!('disabled' in item && item.disabled)) e.currentTarget.style.background = 'var(--surface-hover)'; }}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ color: 'danger' in item && item.danger ? '#ef4444' : 'var(--text-muted)', flexShrink: 0 }}>{item.icon}</span>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Rename inline input ──────────────────────────────────────
function RenameInput({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [val, setVal] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const commit = () => { const t = val.trim(); if (t) onSave(t); else onCancel(); };
  return (
    <input
      ref={ref}
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onCancel(); }}
      className="flex-1 min-w-0 bg-transparent border-b text-xs px-0 py-0.5 outline-none"
      style={{ borderColor: 'var(--accent)', color: 'var(--text)' }}
      onClick={e => e.stopPropagation()}
    />
  );
}

function ProfileDialog({ onClose, onOpenSettings, collapsed, userName, userEmail, onLogout }: {
  onClose: () => void;
  onOpenSettings: () => void;
  collapsed: boolean;
  userName: string;
  userEmail: string;
  onLogout: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // slight delay so the button click that opens it doesn't immediately close it
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [onClose]);

  const menuItems = [
    { icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>, label: 'Upgrade plan', accent: true },
    { icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.582-7 8-7s8 3 8 7"/></svg>, label: 'Add an account' },
    { icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>, label: 'Personalization' },
    { icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>, label: 'Settings', action: 'settings' },
    { icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>, label: 'Help', chevron: true },
    { divider: true },
    { icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>, label: 'Log out', action: 'logout' },
  ];

  // Fixed positioning: anchored to bottom-left, shifts right when collapsed
  const style: React.CSSProperties = {
    position: 'fixed',
    bottom: '72px',
    left: collapsed ? '72px' : '8px',
    width: '252px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow)',
    zIndex: 100,
    borderRadius: '12px',
    overflow: 'hidden',
  };

  return (
    <div ref={ref} className="animate-fade-in" style={style}>
      {/* User info header */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shadow flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--accent), #1a7ab8)' }}>{userName.charAt(0).toUpperCase()}</div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{userName}</p>
          <p className="text-xs truncate" style={{ color: 'var(--text-faint)' }}>{userEmail}</p>
        </div>
      </div>

      {/* Menu items */}
      <div className="py-1">
        {menuItems.map((item, i) => {
          if ('divider' in item && item.divider) {
            return <div key={i} className="my-1" style={{ borderTop: '1px solid var(--border)' }} />;
          }
          const it = item as { icon: React.ReactNode; label: string; accent?: boolean; chevron?: boolean; action?: string };
          return (
            <button
              key={i}
              onClick={() => {
                if (it.action === 'settings') { onClose(); onOpenSettings(); }
                else if (it.action === 'logout') { onClose(); onLogout(); }
                else onClose();
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors"
              style={{ color: it.accent ? 'var(--accent)' : 'var(--text)', background: 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ color: it.accent ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }}>{it.icon}</span>
              <span className="flex-1">{it.label}</span>
              {it.chevron && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--text-faint)' }}>
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer links */}
      <div className="px-4 py-2.5 flex gap-3" style={{ borderTop: '1px solid var(--border)' }}>
        <button className="text-xs hover:underline" style={{ color: 'var(--text-faint)' }} onClick={onClose}>Privacy Policy</button>
        <span style={{ color: 'var(--text-faint)' }}>·</span>
        <button className="text-xs hover:underline" style={{ color: 'var(--text-faint)' }} onClick={onClose}>Terms of Service</button>
      </div>
    </div>
  );
}

export default function Sidebar({ isOpen, onClose, onNewChat, chats, activeChatId, onSelectChat, collapsed, onToggleCollapse, onDeleteChat, onRenameChat, onPinChat, onUploadCSV, onConnectDB, onSemanticLayer }: SidebarProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const groups = ['Pinned', 'Today', 'Yesterday', 'Previous 7 days', 'Older'];
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuChatId, setMenuChatId] = useState<string | null>(null);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);

  const userName = user?.name || 'User';
  const userEmail = user?.email || '';
  const userInitial = userName.charAt(0).toUpperCase();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-20 bg-black/60 backdrop-blur-sm transition-opacity duration-300 md:hidden ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Sidebar panel */}
      <aside
        className={`fixed md:static z-30 top-0 left-0 h-full flex flex-col transition-all duration-300 ease-in-out md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          width: collapsed ? '64px' : '260px',
          minWidth: collapsed ? '64px' : '260px',
          background: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--border)',
          overflow: 'visible',
        }}
      >
        {/* Header */}
        <div className={`flex items-center py-4 ${collapsed ? 'justify-center px-0 flex-col gap-2' : 'justify-between px-4'}`}>
          {/* Logo icon — always visible */}
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-md flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--accent), #1a7ab8)' }}
          >
            ⚡
          </div>

          {/* Title — hidden when collapsed */}
          {!collapsed && (
            <span className="text-sm font-bold tracking-tight flex-1 ml-2.5 whitespace-nowrap" style={{ color: 'var(--text)' }}>Mercury Grid</span>
          )}

          {/* Collapse/Expand toggle button */}
          <button
            onClick={onToggleCollapse}
            className="hidden md:flex items-center justify-center w-8 h-8 rounded-lg transition-all hover:scale-105 flex-shrink-0"
            style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              style={{ transition: 'transform 0.3s', transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              {/* Double-chevron left */}
              <polyline points="11 17 6 12 11 7"/>
              <polyline points="18 17 13 12 18 7"/>
            </svg>
          </button>
        </div>

        {/* New Chat button */}
        <div className={`pb-3 ${collapsed ? 'px-2 flex flex-col items-center gap-2' : 'px-3'}`}>
          {collapsed ? (
            <>
              <button
                onClick={() => { onNewChat(); }}
                className="flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:scale-105"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
                title="New chat"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </button>
              <button
                onClick={() => onUploadCSV()}
                className="flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:scale-105"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
                title="Upload CSV"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/>
                  <line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
              </button>
              <button
                onClick={() => onConnectDB()}
                className="flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:scale-105"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
                title="Connect database"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <ellipse cx="12" cy="5" rx="9" ry="3"/>
                  <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                </svg>
              </button>
              <button
                onClick={() => onSemanticLayer()}
                className="flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:scale-105"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
                title="Create semantic layer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                  <polyline points="2 17 12 22 22 17"/>
                  <polyline points="2 12 12 17 22 12"/>
                </svg>
              </button>
              {/* ── Navigation divider ── */}
              <div style={{ height: 1, background: 'var(--border)', width: '80%', margin: '2px 0' }} />
              <button
                onClick={() => router.push('/agents')}
                className="flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:scale-105"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
                title="RAG Agents"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </button>
              <button
                onClick={() => router.push('/search-agents')}
                className="flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:scale-105"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
                title="Search Agents"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </button>
              <button
                onClick={() => router.push('/crawl-agents')}
                className="flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:scale-105"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
                title="Crawl Agents"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
              <button
                onClick={() => router.push('/analyst-agents')}
                className="flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:scale-105"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
                title="Analyst Agents"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onNewChat}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.01]"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                New chat
              </button>
              <button
                onClick={() => onUploadCSV()}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.01] mt-1"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/>
                  <line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
                Upload CSV
              </button>
              <button
                onClick={() => onConnectDB()}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.01] mt-1"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <ellipse cx="12" cy="5" rx="9" ry="3"/>
                  <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                </svg>
                Connect database
              </button>
              <button
                onClick={() => onSemanticLayer()}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.01] mt-1"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                  <polyline points="2 17 12 22 22 17"/>
                  <polyline points="2 12 12 17 22 12"/>
                </svg>
                Create semantic layer
              </button>
              {/* ── Agent navigation ── */}
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 2px' }} />
              <button
                onClick={() => router.push('/agents')}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.01]"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                RAG Agents
              </button>
              <button
                onClick={() => router.push('/search-agents')}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.01] mt-1"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                Search Agents
              </button>
              <button
                onClick={() => router.push('/crawl-agents')}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.01] mt-1"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                Crawl Agents
              </button>
              <button
                onClick={() => router.push('/analyst-agents')}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.01] mt-1"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
                Analyst Agents
              </button>
            </>
          )}
        </div>

        {/* History — hidden when collapsed */}
        {!collapsed && (
          <nav className="flex-1 overflow-y-auto px-2 pb-2">
            {groups.map(group => {
              const items = group === 'Pinned'
                ? chats.filter(c => c.pinned)
                : chats.filter(c => !c.pinned && c.group === group);
              if (!items.length) return null;
              return (
                <div key={group} className="mb-4">
                  <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
                    {group}
                  </p>
                  <div className="space-y-0.5">
                    {items.map(chat => {
                      const isActive = activeChatId === chat.id;
                      const isMenuOpen = menuChatId === chat.id;
                      const isRenaming = renamingChatId === chat.id;
                      return (
                        <div
                          key={chat.id}
                          className="relative group/chat flex items-center rounded-lg transition-all"
                          style={{
                            background: isActive ? 'var(--surface)' : 'transparent',
                            borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                          }}
                        >
                          {/* Chat title button */}
                          <button
                            onClick={() => { if (!isRenaming) { onSelectChat(chat.id); onClose(); } }}
                            className="flex-1 text-left px-3 py-2 text-sm truncate min-w-0"
                            style={{ color: isActive ? 'var(--text)' : 'var(--text-muted)' }}
                          >
                            {isRenaming ? (
                              <RenameInput
                                value={chat.title}
                                onSave={v => { onRenameChat(chat.id, v); setRenamingChatId(null); }}
                                onCancel={() => setRenamingChatId(null)}
                              />
                            ) : (
                              <span className="truncate block">{chat.title}</span>
                            )}
                          </button>

                          {/* Three-dot button — shown on hover or when menu is open */}
                          {!isRenaming && (
                            <button
                              onClick={e => { e.stopPropagation(); setMenuChatId(isMenuOpen ? null : chat.id); }}
                              className={`flex-shrink-0 mr-1 p-1 rounded transition-all ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover/chat:opacity-100'}`}
                              style={{ color: 'var(--text-muted)' }}
                              title="More options"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
                              </svg>
                            </button>
                          )}

                          {/* Context menu */}
                          {isMenuOpen && !isRenaming && (
                            <ChatMenu
                              chat={chat}
                              onClose={() => setMenuChatId(null)}
                              onDelete={() => onDeleteChat(chat.id)}
                              onRename={() => { setMenuChatId(null); setRenamingChatId(chat.id); }}
                              onPin={() => onPinChat(chat.id)}
                              onArchive={() => onDeleteChat(chat.id)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {chats.length === 0 && (
              <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-faint)' }}>No conversations yet</p>
            )}
          </nav>
        )}

        {/* Spacer when collapsed so footer stays at bottom */}
        {collapsed && <div className="flex-1" />}

        {/* Footer */}
        <div className="relative" style={{ borderTop: '1px solid var(--border)' }}>
          {profileOpen && (
            <ProfileDialog
              onClose={() => setProfileOpen(false)}
              onOpenSettings={() => setSettingsOpen(true)}
              collapsed={collapsed}
              userName={userName}
              userEmail={userEmail}
              onLogout={handleLogout}
            />
          )}

          <div className={`py-3 ${collapsed ? 'px-2 flex flex-col items-center gap-2' : 'px-3'}`}>
            {collapsed ? (
              <>
                <button
                  onClick={() => setProfileOpen(p => !p)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow transition-all hover:scale-110 hover:ring-2"
                  style={{ background: 'linear-gradient(135deg, var(--accent), #1a7ab8)' }}
                  title={userName}
                >
                  {userInitial}
                </button>
                <button
                  onClick={() => router.push('/agents')}
                  className="w-8 h-8 rounded flex items-center justify-center transition-colors hover:bg-[var(--surface-hover)]"
                  style={{ color: 'var(--accent)' }}
                  title="My Agents"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
                </button>
                <button
                  onClick={() => router.push('/workflow')}
                  className="w-8 h-8 rounded flex items-center justify-center transition-colors hover:bg-[var(--surface-hover)]"
                  style={{ color: 'var(--accent)' }}
                  title="Workflows"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17.5h3m0 0V14m0 3.5V21"/><path d="M10 7h4"/></svg>
                </button>
                {user?.role === 'superadmin' && (
                  <button
                    onClick={() => router.push('/admin')}
                    className="w-8 h-8 rounded flex items-center justify-center transition-colors hover:bg-[var(--surface-hover)]"
                    style={{ color: 'var(--accent)' }}
                    title="Admin Panel"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  </button>
                )}
                <ThemeToggle />
              </>
            ) : (
              <div className="flex items-center justify-between gap-1 min-w-0">
                <button
                  onClick={() => setProfileOpen(p => !p)}
                  className="flex items-center gap-2 rounded-lg px-1 py-1 transition-all hover:bg-[var(--surface-hover)] -mx-1 min-w-0 flex-1 overflow-hidden"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, var(--accent), #1a7ab8)' }}
                  >
                    {userInitial}
                  </div>
                  <div className="text-left min-w-0 overflow-hidden">
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }}>{userName}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-faint)' }}>{userEmail || 'Free plan'}</p>
                  </div>
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => router.push('/agents')}
                    className="w-8 h-8 rounded flex items-center justify-center transition-colors hover:bg-[var(--surface-hover)]"
                    style={{ color: 'var(--accent)' }}
                    title="My Agents"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
                  </button>
                  <button
                    onClick={() => router.push('/workflow')}
                    className="w-8 h-8 rounded flex items-center justify-center transition-colors hover:bg-[var(--surface-hover)]"
                    style={{ color: 'var(--accent)' }}
                    title="Workflows"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17.5h3m0 0V14m0 3.5V21"/><path d="M10 7h4"/></svg>
                  </button>
                  {user?.role === 'superadmin' && (
                    <button
                      onClick={() => router.push('/admin')}
                      className="w-8 h-8 rounded flex items-center justify-center transition-colors hover:bg-[var(--surface-hover)]"
                      style={{ color: 'var(--accent)' }}
                      title="Admin Panel"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    </button>
                  )}
                  <ThemeToggle />
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
