'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './components/AuthProvider';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import ConnectDBModal from './components/ConnectDBModal';
import DBSidebar from './components/DBSidebar';
import type { TableInfo } from './components/ConnectDBModal';
import CSVUploadModal from './components/CSVUploadModal';
import CSVSidebar from './components/CSVSidebar';
import CSVTablesSidebar from './components/CSVTablesSidebar';
import SemanticLayerSidebar from './components/SemanticLayerSidebar';
import type { UploadedTable } from './components/CSVUploadModal';
import type { AgentRecord } from './components/AgentInitModal';
import type { ActiveAgent } from './components/ChatWindow';

export interface Chat { id: string; title: string; group: string; pinned?: boolean; }

interface ActiveDbConnection {
  connectionId: string;
  connectionName: string;
  tables: TableInfo[];
}

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://sleocl2mk5.execute-api.eu-north-1.amazonaws.com/Prod/chat').replace(/\/chat$/, '');

function dateToGroup(dateStr: string): string {
  if (!dateStr) return 'Today';
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays < 1) return 'Today';
  if (diffDays < 2) return 'Yesterday';
  if (diffDays < 7) return 'Previous 7 days';
  return 'Older';
}

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [connectDBOpen, setConnectDBOpen] = useState(false);
  const [dbSidebarOpen, setDbSidebarOpen] = useState(false);
  const [activeDbConnection, setActiveDbConnection] = useState<ActiveDbConnection | null>(null);
  const [csvUploadOpen, setCsvUploadOpen] = useState(false);
  const [csvSidebarOpen, setCsvSidebarOpen] = useState(false);
  const [csvTablesSidebarOpen, setCsvTablesSidebarOpen] = useState(false);
  const [csvRefreshKey, setCsvRefreshKey] = useState(0);
  const [semanticLayerOpen, setSemanticLayerOpen] = useState(false);
  const [activeAgent, setActiveAgent] = useState<ActiveAgent | null>(null);

  useEffect(() => {
    if (!loading && !user) { router.replace('/login'); return; }
    if (!loading && user) { loadConversations(); }
  }, [user, loading]);

  const loadConversations = async () => {
    try {
      const res = await fetch(`${BASE_URL}/history/conversations`, {
        headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {},
      });
      const data = await res.json();
      const loaded: Chat[] = (data.conversations || []).map((c: any) => ({
        id: c.id,
        title: c.title || 'Untitled',
        group: dateToGroup(c.created_at),
        pinned: c.pinned || false,
      }));
      setChats(loaded);
    } catch { /* non-fatal */ }
  };

  const handleNewChat = () => { setActiveChatId(null); setSidebarOpen(false); };

  const handleChatCreated = (id: string, title: string) => {
    setChats(prev => [{ id, title, group: 'Today', pinned: false }, ...prev]);
    setActiveChatId(id);
  };

  const handleDeleteChat = async (id: string) => {
    setChats(prev => prev.filter(c => c.id !== id));
    if (activeChatId === id) setActiveChatId(null);
    try {
      await fetch(`${BASE_URL}/history?conversation_id=${id}`, {
        method: 'DELETE',
        headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {},
      });
    } catch { /* non-fatal */ }
  };

  const handleRenameChat = async (id: string, newTitle: string) => {
    setChats(prev => prev.map(c => c.id === id ? { ...c, title: newTitle } : c));
    try {
      await fetch(`${BASE_URL}/history`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}) },
        body: JSON.stringify({ conversation_id: id, title: newTitle }),
      });
    } catch { /* non-fatal */ }
  };

  const handlePinChat = (id: string) => {
    setChats(prev => prev.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c));
  };

  // DB connection handlers
  const handleConnectDB = () => {
    if (activeDbConnection) {
      // Already connected — toggle DB sidebar
      setDbSidebarOpen(v => !v);
    } else {
      // No active connection — open modal
      setConnectDBOpen(true);
    }
  };

  const handleDbConnected = (connectionId: string, connectionName: string, tables: TableInfo[]) => {
    setActiveDbConnection({ connectionId, connectionName, tables });
    setConnectDBOpen(false);
    setDbSidebarOpen(true);
  };

  const handleDbDisconnect = () => {
    setActiveDbConnection(null);
    setDbSidebarOpen(false);
  };

  // CSV upload handlers
  const handleUploadCSV = () => {
    // Open both: left table list + right file drawer
    setCsvTablesSidebarOpen(true);
    setCsvSidebarOpen(true);
  };

  const handleCsvUploaded = (_table: UploadedTable) => {
    setCsvRefreshKey(k => k + 1);
    setCsvTablesSidebarOpen(true);
    setCsvSidebarOpen(true);
  };

  const handleSemanticLayer = () => {
    setSemanticLayerOpen(v => !v);
  };

  const handleAgentCreated = (agent: AgentRecord) => {
    setActiveAgent({ agent_id: agent.agent_id, agent_name: agent.agent_name, agent_type: 'sql' });
  };

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--main-bg)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow-lg"
            style={{ background: 'linear-gradient(135deg, var(--accent), #1a7ab8)' }}>⚡</div>
          <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={handleNewChat}
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={(id) => { setActiveChatId(id); setSidebarOpen(false); }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(p => !p)}
        onDeleteChat={handleDeleteChat}
        onRenameChat={handleRenameChat}
        onPinChat={handlePinChat}
        onConnectDB={handleConnectDB}
        onUploadCSV={handleUploadCSV}
        onSemanticLayer={handleSemanticLayer}
      />
      {dbSidebarOpen && activeDbConnection && (
        <DBSidebar
          connection={activeDbConnection}
          onClose={() => setDbSidebarOpen(false)}
          onDisconnect={handleDbDisconnect}
        />
      )}
      {csvTablesSidebarOpen && (
        <CSVTablesSidebar
          open={csvTablesSidebarOpen}
          onClose={() => setCsvTablesSidebarOpen(false)}
          onUploadNew={() => setCsvUploadOpen(true)}
          refreshKey={csvRefreshKey}
        />
      )}
      <main className="flex-1 min-w-0 overflow-hidden">
        <ChatWindow
          onMenuClick={() => setSidebarOpen(true)}
          chatId={activeChatId}
          onChatCreated={handleChatCreated}
          activeAgent={activeAgent}
          onAgentChange={setActiveAgent}
        />
      </main>
      <CSVSidebar
        open={csvSidebarOpen}
        onClose={() => setCsvSidebarOpen(false)}
        onUploadNew={() => setCsvUploadOpen(true)}
        refreshKey={csvRefreshKey}
      />
      <SemanticLayerSidebar
        open={semanticLayerOpen}
        onClose={() => setSemanticLayerOpen(false)}
        activeDbConnection={activeDbConnection}
        refreshKey={csvRefreshKey}
        onAgentCreated={handleAgentCreated}
      />
      {connectDBOpen && (
        <ConnectDBModal
          onClose={() => setConnectDBOpen(false)}
          onConnected={handleDbConnected}
        />
      )}
      {csvUploadOpen && (
        <CSVUploadModal
          onClose={() => setCsvUploadOpen(false)}
          onUploaded={handleCsvUploaded}
        />
      )}
    </div>
  );
}

