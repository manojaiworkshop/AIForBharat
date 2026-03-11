'use client';

import { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle';

interface SettingsModalProps {
  onClose: () => void;
}

const TABS = [
  { id: 'general',   label: 'General',          icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg> },
  { id: 'notif',     label: 'Notifications',     icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg> },
  { id: 'person',    label: 'Personalization',   icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.582-7 8-7s8 3 8 7"/></svg> },
  { id: 'apps',      label: 'Apps',              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
  { id: 'data',      label: 'Data controls',     icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg> },
  { id: 'security',  label: 'Security',          icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
  { id: 'parental',  label: 'Parental controls', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  { id: 'account',   label: 'Account',           icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg> },
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-4" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-sm" style={{ color: 'var(--text)' }}>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="text-sm px-3 py-1.5 rounded-lg cursor-pointer focus:outline-none"
      style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
    >
      {options.map(o => <option key={o}>{o}</option>)}
    </select>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className="relative inline-flex items-center w-11 h-6 rounded-full transition-colors"
      style={{ background: checked ? 'var(--accent)' : 'var(--surface-hover)', border: '1px solid var(--border)' }}
    >
      <span
        className="inline-block w-4 h-4 rounded-full bg-white shadow transition-transform"
        style={{ transform: checked ? 'translateX(22px)' : 'translateX(3px)' }}
      />
    </button>
  );
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState('general');
  const [appearance, setAppearance] = useState('System');
  const [language, setLanguage] = useState('Auto-detect');
  const [spokenLang, setSpokenLang] = useState('Auto-detect');
  const [voice, setVoice] = useState('Breeze');
  const [notifications, setNotifications] = useState(true);
  const [chatHistory, setChatHistory] = useState(true);
  const [improveModel, setImproveModel] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div>
            {/* MFA banner */}
            <div className="flex items-start gap-3 p-4 rounded-xl mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <div className="flex-1">
                <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--text)' }}>Secure your account</p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>Add multi-factor authentication (MFA), like a passkey or text message, to help protect your account when logging in.</p>
                <button className="mt-2 text-xs px-3 py-1.5 rounded-lg font-medium transition-all hover:opacity-80" style={{ background: 'var(--surface-hover)', color: 'var(--text)', border: '1px solid var(--border)' }}>Set up MFA</button>
              </div>
              <button onClick={() => {}} style={{ color: 'var(--text-muted)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <Row label="Appearance">
              <Select value={appearance} onChange={setAppearance} options={['System', 'Light', 'Dark']} />
            </Row>
            <Row label="Accent color">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                <span className="w-4 h-4 rounded-full" style={{ background: 'var(--accent)' }} />
                <span>Bondi Blue</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </Row>
            <Row label="Language">
              <Select value={language} onChange={setLanguage} options={['Auto-detect', 'English', 'Hindi', 'Spanish', 'French', 'German']} />
            </Row>
            <Row label="Spoken language">
              <div>
                <Select value={spokenLang} onChange={setSpokenLang} options={['Auto-detect', 'English', 'Hindi', 'Spanish']} />
                <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>For best results, select the language you mainly speak.</p>
              </div>
            </Row>
            <Row label="Voice">
              <div className="flex items-center gap-2">
                <button className="text-xs px-2.5 py-1 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>▶ Play</button>
                <Select value={voice} onChange={setVoice} options={['Breeze', 'Ember', 'Cove', 'Juniper', 'Vale']} />
              </div>
            </Row>
          </div>
        );

      case 'notif':
        return (
          <div>
            <Row label="Email notifications">
              <Toggle checked={notifications} onChange={() => setNotifications(p => !p)} />
            </Row>
            <Row label="Product updates & announcements">
              <Toggle checked={true} onChange={() => {}} />
            </Row>
            <Row label="Weekly digest">
              <Toggle checked={false} onChange={() => {}} />
            </Row>
          </div>
        );

      case 'data':
        return (
          <div>
            <Row label="Save chat history">
              <Toggle checked={chatHistory} onChange={() => setChatHistory(p => !p)} />
            </Row>
            <Row label="Improve model for everyone">
              <Toggle checked={improveModel} onChange={() => setImproveModel(p => !p)} />
            </Row>
            <div className="pt-4">
              <button className="text-sm px-4 py-2 rounded-lg mr-3 transition-all hover:opacity-80" style={{ background: 'var(--accent)', color: '#fff' }}>Export data</button>
              <button className="text-sm px-4 py-2 rounded-lg transition-all hover:opacity-80" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>Delete account</button>
            </div>
          </div>
        );

      case 'security':
        return (
          <div>
            <Row label="Two-factor authentication">
              <button className="text-sm px-3 py-1.5 rounded-lg" style={{ background: 'var(--accent)', color: '#fff' }}>Set up</button>
            </Row>
            <Row label="Active sessions">
              <button className="text-sm px-3 py-1.5 rounded-lg" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>View all</button>
            </Row>
            <Row label="Log out all devices">
              <button className="text-sm px-3 py-1.5 rounded-lg" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>Log out</button>
            </Row>
          </div>
        );

      case 'account':
        return (
          <div>
            <Row label="Name"><span className="text-sm" style={{ color: 'var(--text-muted)' }}>Manoj</span></Row>
            <Row label="Email"><span className="text-sm" style={{ color: 'var(--text-muted)' }}>manoj@example.com</span></Row>
            <Row label="Plan">
              <div className="flex items-center gap-2">
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Free</span>
                <button className="text-xs px-3 py-1 rounded-lg font-medium" style={{ background: 'var(--accent)', color: '#fff' }}>Upgrade</button>
              </div>
            </Row>
            <div className="pt-4">
              <button className="text-sm px-4 py-2 rounded-lg text-red-400 transition-all hover:opacity-80" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>Delete account</button>
            </div>
          </div>
        );

      default:
        return (
          <div className="flex items-center justify-center h-40">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Coming soon</p>
          </div>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex w-full max-w-2xl max-h-[85vh] rounded-2xl overflow-hidden animate-slide-up"
        style={{ background: 'var(--main-bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
      >
        {/* Left tab sidebar */}
        <div className="flex flex-col py-3 flex-shrink-0" style={{ width: '200px', background: 'var(--sidebar-bg)', borderRight: '1px solid var(--border)' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-left mx-2 rounded-lg transition-all"
              style={{
                background: activeTab === tab.id ? 'var(--surface)' : 'transparent',
                color: activeTab === tab.id ? 'var(--text)' : 'var(--text-muted)',
                fontWeight: activeTab === tab.id ? '600' : '400',
              }}
            >
              <span style={{ color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)' }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right content */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
              {TABS.find(t => t.id === activeTab)?.label}
            </h2>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:scale-105"
              style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-6 py-2">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
