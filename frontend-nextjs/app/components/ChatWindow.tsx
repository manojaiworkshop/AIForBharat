'use client';

import { useEffect, useRef, useState } from 'react';
import ChatMessage, { Message } from './ChatMessage';
import ChatInput from './ChatInput';
import { useAuth } from './AuthProvider';

const PROMPTS = [
  { icon: '📊', label: 'Trend Analysis', text: 'Analyse week-over-week sales trends and forecast next quarter revenue' },
  { icon: '💰', label: 'Pricing Strategy', text: 'What pricing strategy should we adopt based on competitor data?' },
  { icon: '⚠️', label: 'Risk & Opportunity', text: 'Identify the top risks and growth opportunities in this dataset' },
  { icon: '📈', label: 'KPI Dashboard', text: 'Calculate KPIs, benchmark against industry standards and highlight anomalies' },
];

async function fetchReply(
  message: string,
  apiUrl: string,
  history: { role: string; content: string }[],
  conversationId: string | null,
  token?: string,
  agentId?: string,
): Promise<{ reply: string; conversation_id: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, history, conversation_id: conversationId, agent_id: agentId }),
    });
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    return { reply: data.reply || data.message || 'No response from server.', conversation_id: data.conversation_id };
  } catch {
    const replies = [
      `I'd be happy to help with "${message.slice(0, 50)}${message.length > 50 ? '…' : ''}"\n\nThis is a demo response. Set **OPENAI_API_KEY** in your Lambda environment variables to get real AI responses.`,
      `Great question about "${message.slice(0, 40)}${message.length > 40 ? '…' : ''}"!\n\nThe backend Lambda is live on AWS (eu-north-1). Add your OpenAI API key to enable real answers.`,
      `Thanks for your message! I'm Mercury Grid, running on:\n\n• ⚡ Frontend: Next.js → AWS S3 + CloudFront\n• 🐍 Backend: Python 3.11 → AWS Lambda + API Gateway\n\nSet OPENAI_API_KEY for real AI responses!`,
    ];
    return { reply: replies[Math.floor(Math.random() * replies.length)], conversation_id: conversationId || crypto.randomUUID() };
  }
}

export interface ActiveAgent {
  agent_id:   string;
  agent_name: string;
  agent_type: 'sql' | 'rag' | 'workflow' | 'search' | 'crawl';
}

interface ChatWindowProps {
  onMenuClick:     () => void;
  chatId:          string | null;
  onChatCreated:   (id: string, title: string) => void;
  activeAgent?:    ActiveAgent | null;
  onAgentChange?:  (agent: ActiveAgent | null) => void;
}

// ── Typewriter cycling status text shown beside the loading dots ────────────────────
const TYPING_PHASES = [
  'Analysing',
  'Filtering data',
  'Processing',
  'Summarising',
  'Generating insights',
  'Building report',
];

function TypingPhrase() {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [charIdx,  setCharIdx]  = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const phrase = TYPING_PHASES[phaseIdx];
    if (!deleting) {
      if (charIdx < phrase.length) {
        const t = setTimeout(() => setCharIdx(i => i + 1), 65);
        return () => clearTimeout(t);
      } else {
        // fully typed — hold then erase
        const t = setTimeout(() => setDeleting(true), 1000);
        return () => clearTimeout(t);
      }
    } else {
      if (charIdx > 0) {
        const t = setTimeout(() => setCharIdx(i => i - 1), 32);
        return () => clearTimeout(t);
      } else {
        // fully erased — next phrase
        setDeleting(false);
        setPhaseIdx(i => (i + 1) % TYPING_PHASES.length);
      }
    }
  }, [phaseIdx, charIdx, deleting]);

  const display = TYPING_PHASES[phaseIdx].slice(0, charIdx);

  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.04em',
        color: 'var(--accent)',
        minWidth: 140,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        fontFamily: 'var(--font-mono, monospace)',
      }}
    >
      {display}
      <span
        style={{
          display: 'inline-block',
          width: 2,
          height: 13,
          background: 'var(--accent)',
          borderRadius: 1,
          marginLeft: 1,
          animation: 'cursorBlink 1s step-end infinite',
        }}
      />
    </span>
  );
}

export default function ChatWindow({ onMenuClick, chatId, onChatCreated, activeAgent, onAgentChange }: ChatWindowProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [typingText, setTypingText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [serverConvId, setServerConvId] = useState<string | null>(null);
  const justCreatedRef = useRef<string | null>(null);
  const messagesEndRef   = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef  = useRef(true);   // true = user is at/near bottom
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // Called on every scroll event — updates whether user is near bottom
  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distFromBottom < 120;
    isNearBottomRef.current = nearBottom;
    setShowScrollBtn(!nearBottom);
  };

  // Smart scroll: only scrolls to bottom when user is already near it
  const scrollToBottomIfNeeded = (force = false) => {
    if (!force && !isNearBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToBottom = () => {
    isNearBottomRef.current = true;
    setShowScrollBtn(false);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Agent dropdown
  const [agentDropOpen, setAgentDropOpen]   = useState(false);
  const [agentList, setAgentList] = useState<{ agent_id: string; agent_name: string; status: string; agent_type: 'sql' | 'rag' | 'workflow' | 'search' | 'crawl'; visibility?: 'public' | 'owned' | 'shared' }[]>([]);
  const [agentSearch,   setAgentSearch]     = useState('');
  const agentDropRef   = useRef<HTMLDivElement>(null);
  const agentSearchRef = useRef<HTMLInputElement>(null);
  const agentRepoUrl    = process.env.NEXT_PUBLIC_AGENT_REPO_URL    || 'http://localhost:8001';
  const ragApiUrl       = process.env.NEXT_PUBLIC_RAG_API_URL       || '';
  const searchApiUrl    = process.env.NEXT_PUBLIC_SEARCH_API_URL    || '';
  const crawlApiUrl     = process.env.NEXT_PUBLIC_CRAWL_API_URL     || '';
  const orchestratorUrl = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL  || '';
  const workflowWsUrl   = process.env.NEXT_PUBLIC_WORKFLOW_WS_URL   || '';

  const apiUrl  = process.env.NEXT_PUBLIC_API_URL || 'https://sleocl2mk5.execute-api.eu-north-1.amazonaws.com/Prod/chat';
  const baseUrl = apiUrl.replace(/\/chat$/, '');
  const userTokenRef = useRef<string | undefined>(user?.token);
  useEffect(() => { userTokenRef.current = user?.token; }, [user]);

  // ── Fetch ready agents (SQL + RAG + Workflows) and filter by visibility ──
  const fetchAgents = async () => {
    const combined: { agent_id: string; agent_name: string; status: string; agent_type: 'sql' | 'rag' | 'workflow' | 'search' | 'crawl' }[] = [];
    // SQL agents
    try {
      const res = await fetch(`${agentRepoUrl}/agents/?status=ready`);
      if (res.ok) {
        const data = await res.json();
        for (const a of data.agents || []) {
          combined.push({ ...a, agent_type: 'sql' });
        }
      }
    } catch { /* agentrepo not running */ }
    // RAG agents
    if (ragApiUrl) {
      try {
        const headers: Record<string, string> = {};
        if (userTokenRef.current) headers['Authorization'] = `Bearer ${userTokenRef.current}`;
        const res = await fetch(`${ragApiUrl}/rag/agents`, { headers });
        if (res.ok) {
          const data = await res.json();
          for (const a of data.agents || []) {
            if (a.status === 'ready') {
              combined.push({ agent_id: a.agent_id, agent_name: a.agent_name, status: a.status, agent_type: 'rag' });
            }
          }
        }
      } catch { /* rag api not reachable */ }
    }

    // Search agents
    if (searchApiUrl) {
      try {
        const headers: Record<string, string> = {};
        if (userTokenRef.current) headers['Authorization'] = `Bearer ${userTokenRef.current}`;
        const res = await fetch(`${searchApiUrl}/search/agents`, { headers });
        if (res.ok) {
          const data = await res.json();
          for (const a of data.agents || []) {
            if (a.status === 'ready') {
              combined.push({ agent_id: a.agent_id, agent_name: a.agent_name, status: a.status, agent_type: 'search' as const });
            }
          }
        }
      } catch { /* search api not reachable */ }
    }

    // Crawl agents
    if (crawlApiUrl) {
      try {
        const headers: Record<string, string> = {};
        if (userTokenRef.current) headers['Authorization'] = `Bearer ${userTokenRef.current}`;
        const res = await fetch(`${crawlApiUrl}/crawl/agents`, { headers });
        if (res.ok) {
          const data = await res.json();
          for (const a of data.agents || []) {
            if (a.status === 'ready') {
              combined.push({ agent_id: a.agent_id, agent_name: a.agent_name, status: a.status, agent_type: 'crawl' as const });
            }
          }
        }
      } catch { /* crawl api not reachable */ }
    }

    // Deduplicate by agent_id — if an agent appears in both repos, prefer 'rag' type
    const deduped = new Map<string, { agent_id: string; agent_name: string; status: string; agent_type: 'sql' | 'rag' | 'workflow' | 'search' | 'crawl' }>();
    for (const a of combined) {
      if (!deduped.has(a.agent_id) || a.agent_type === 'rag') {
        deduped.set(a.agent_id, a);
      }
    }
    const uniqueCombined = Array.from(deduped.values());

    // Workflows
    const allItems: { agent_id: string; agent_name: string; status: string; agent_type: 'sql' | 'rag' | 'workflow' | 'search' | 'crawl'; visibility?: 'public' | 'owned' | 'shared' }[] = [...uniqueCombined];
    if (orchestratorUrl && userTokenRef.current) {
      try {
        const wr = await fetch(`${orchestratorUrl}/workflows`, {
          headers: { Authorization: `Bearer ${userTokenRef.current}` },
        });
        if (wr.ok) {
          const wd = await wr.json();
          for (const wf of wd.workflows || []) {
            allItems.push({ agent_id: wf.workflow_id, agent_name: wf.workflow_name, status: 'ready', agent_type: 'workflow' });
          }
        }
      } catch { /* orchestrator not reachable */ }
    }

    // Filter by visibility permissions (only SQL/RAG agents — workflows, search and crawl agents have own perms)
    const sqlRagItems    = allItems.filter(a => a.agent_type !== 'workflow' && a.agent_type !== 'search' && a.agent_type !== 'crawl');
    const workflowItems  = allItems.filter(a => a.agent_type === 'workflow');
    const searchItems    = allItems.filter(a => a.agent_type === 'search');
    const crawlItems     = allItems.filter(a => a.agent_type === 'crawl');

    if (userTokenRef.current && sqlRagItems.length > 0) {
      try {
        const permRes = await fetch(`${baseUrl}/admin/visible-agent-ids`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${userTokenRef.current}`,
          },
          body: JSON.stringify({ agent_ids: sqlRagItems.map(a => a.agent_id) }),
        });
        if (permRes.ok) {
          const permData = await permRes.json();
          const restricted = new Set<string>(permData.restricted_ids || []);
          const visMap: Record<string, 'public' | 'owned' | 'shared'> = permData.visibility_map || {};
          setAgentList([
            ...sqlRagItems
              .filter(a => !restricted.has(a.agent_id))
              .map(a => ({ ...a, visibility: visMap[a.agent_id] })),
            ...searchItems,
            ...crawlItems,
            ...workflowItems,
          ]);
          return;
        }
      } catch { /* permissions endpoint unavailable – show all */ }
    }
    setAgentList([...sqlRagItems, ...searchItems, ...crawlItems, ...workflowItems]);
  };

  // Poll agents every 8 seconds when dropdown might be opened
  useEffect(() => {
    fetchAgents();
    const iv = setInterval(fetchAgents, 8000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch immediately when user token becomes available (fixes race condition on first load)
  const prevTokenRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (user?.token && user.token !== prevTokenRef.current) {
      prevTokenRef.current = user.token;
      fetchAgents();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.token]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!agentDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (agentDropRef.current && !agentDropRef.current.contains(e.target as Node)) {
        setAgentDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [agentDropOpen]);

  // When chatId changes, reset or load history
  useEffect(() => {
    // Skip if this is the conversation we just created (already have messages in state)
    if (chatId !== null && chatId === justCreatedRef.current) return;

    setMessages([]);
    setInput('');
    setServerConvId(chatId);

    if (!chatId) return;

    // Load existing conversation from API
    setLoadingHistory(true);
    const headers: Record<string, string> = {};
    if (userTokenRef.current) headers['Authorization'] = `Bearer ${userTokenRef.current}`;
    fetch(`${baseUrl}/history?conversation_id=${chatId}`, { headers })
      .then(r => r.json())
      .then(data => {
        const msgs: Message[] = (data.messages || []).map((m: any) => ({
          id: crypto.randomUUID(),
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: new Date(m.timestamp),
        }));
        setMessages(msgs);
      })
      .catch(() => setMessages([]))
      .finally(() => setLoadingHistory(false));
  }, [chatId]);

  useEffect(() => { scrollToBottomIfNeeded(); }, [messages, typingText]);

  // Typewriter animation
  const typewriterEffect = (fullText: string): Promise<void> => {
    return new Promise(resolve => {
      setIsTyping(true);
      setTypingText('');
      let i = 0;
      const SPEED = 8; // ms per character

      const tick = () => {
        if (i >= fullText.length) {
          setIsTyping(false);
          resolve();
          return;
        }
        // Advance in small chunks for smoother feel on long responses
        const chunk = Math.min(3, fullText.length - i);
        i += chunk;
        setTypingText(fullText.slice(0, i));
        setTimeout(tick, SPEED);
      };
      setTimeout(tick, SPEED);
    });
  };

  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || isLoading || isTyping) return;

    const isFirstSend = messages.length === 0;
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // ── Agent routing ─────────────────────────────────────────
    if (activeAgent) {
      const convId = serverConvId || crypto.randomUUID();
      if (isFirstSend) {
        justCreatedRef.current = convId;
        setServerConvId(convId);
        onChatCreated(convId, content.length > 45 ? content.slice(0, 45) + '…' : content);
      }

      // ── Workflow chat path (async + WebSocket streaming) ───
      if (activeAgent.agent_type === 'workflow') {
        try {
          // 1. POST to start the workflow — returns immediately with message_id
          const wfHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
          if (user?.token) wfHeaders['Authorization'] = `Bearer ${user.token}`;
          const res = await fetch(`${orchestratorUrl}/workflows/${activeAgent.agent_id}/chat`, {
            method: 'POST',
            headers: wfHeaders,
            body: JSON.stringify({ message: content, conversation_id: convId }),
          });
          const data = await res.json();

          if (!res.ok || data.error) {
            setIsLoading(false);
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(), role: 'assistant', content: '', timestamp: new Date(),
              agentError: data.error || 'Workflow execution failed',
            }]);
            return;
          }

          const messageId = data.message_id as string;
          const wsBase    = workflowWsUrl || data.ws_url || '';

          // 2. If no WS URL configured, fall back to polling-style single reply
          if (!wsBase) {
            setIsLoading(false);
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(), role: 'assistant', content: '', timestamp: new Date(),
              agentError: 'Workflow started but no WebSocket URL configured (NEXT_PUBLIC_WORKFLOW_WS_URL). Set it in .env.local after deploying.',
            }]);
            return;
          }

          // 3. Open WebSocket and collect streaming step results
          const wsUrl = `${wsBase}?message_id=${encodeURIComponent(messageId)}&token=${encodeURIComponent(user?.token || '')}`;
          const ws = new WebSocket(wsUrl);

          // One assistant message bubble per workflow — we update it progressively
          const assistantId = crypto.randomUUID();
          setMessages(prev => [...prev, {
            id: assistantId, role: 'assistant', content: '⏳ Running workflow…', timestamp: new Date(),
          }]);

          let stepLines: string[] = [];
          // Maps backend step number → index in stepLines (reliable lookup
          // even for virtual steps like planning=0 and synthesis=N+1).
          let stepLineMap: Record<number, number> = {};

          // ── Character-by-character stream helper ─────────────────────────
          // Mutates `stepLines[idx]` progressively so every subsequent WS
          // event handler still sees the correct array when joining lines.
          const STREAM_CHUNK = 5;   // chars per tick
          const STREAM_SPEED = 12;  // ms between ticks

          // Each slot in stepLines is separated by a blank line so markdown
          // renders each step as its own paragraph (single \n is invisible).
          const joinLines = () => stepLines.join('\n\n');

          // Strip markdown heading markers (## Foo → Foo) so inline step
          // previews don't bleed raw "##" characters into the chat bubble.
          const stripMdHeadings = (s: string) =>
            s.replace(/^#{1,6}\s+/gm, '').trim();

          const streamLine = (
            idx: number,
            fullText: string,
            onDone?: () => void,
          ) => {
            let pos = 0;
            const tick = () => {
              pos = Math.min(pos + STREAM_CHUNK, fullText.length);
              stepLines[idx] = fullText.slice(0, pos);
              setMessages(prev =>
                prev.map(m => m.id === assistantId ? { ...m, content: joinLines() } : m)
              );
              if (pos < fullText.length) {
                setTimeout(tick, STREAM_SPEED);
              } else {
                onDone?.();
              }
            };
            tick();
          };

          ws.onmessage = (e: MessageEvent) => {
            try {
              const evt = JSON.parse(e.data as string);

              if (evt.type === 'started') {
                const wfName: string = evt.workflow_name || '';
                const total: number  = evt.total_steps   || 0;
                stepLines    = [`**${wfName || 'Workflow'}** — ${total} step${total !== 1 ? 's' : ''}`];
                stepLineMap  = {};
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, content: joinLines() } : m
                ));

              } else if (evt.type === 'step_start') {
                let label: string;
                if (evt.agent_type === 'planning') {
                  label = `🧠 **Planning**: routing your query across ${evt.total} agent${evt.total !== 1 ? 's' : ''}…`;
                } else if ((evt.node_name as string || '').includes('Synthesis')) {
                  label = `🧠 **Synthesis**: combining results into a final answer…`;
                } else {
                  label = `⚙️ Step ${evt.step}/${evt.total}: **${evt.node_name}** (${evt.agent_type})…`;
                }
                stepLineMap[evt.step] = stepLines.length;
                stepLines.push(label);
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, content: joinLines() } : m
                ));

              } else if (evt.type === 'step_result') {
                const runningIdx = stepLineMap[evt.step] ??
                  stepLines.findLastIndex(l => l.includes(`Step ${evt.step}/`) && l.endsWith('…'));
                const icon = evt.error              ? '❌'
                  : evt.agent_type === 'planning'   ? '🧠'
                  : evt.agent_type === 'sql'         ? '🗄️'
                  : evt.agent_type === 'rag'         ? '📄'
                  :                                    '🤖';

                // For planning: output is already a markdown list — put it on its own line
                // For others: strip heading markers and truncate
                const rawOutput = (evt.output as string || '');
                const preview = evt.agent_type === 'planning'
                  ? '\n' + rawOutput
                  : stripMdHeadings(rawOutput).slice(0, 400) + (rawOutput.length > 400 ? '…' : '');

                const resultLine = evt.error
                  ? `${icon} **${evt.node_name}**: Error — ${evt.error}`
                  : evt.agent_type === 'planning'
                    ? `${icon} **Planning**:${preview}`
                    : `${icon} **${evt.node_name}**: ${preview}`;

                if (runningIdx >= 0) {
                  stepLines[runningIdx] = ''; // clear placeholder, stream in
                  setMessages(prev => prev.map(m =>
                    m.id === assistantId ? { ...m, content: joinLines() } : m
                  ));
                  streamLine(runningIdx, resultLine);
                } else {
                  const newIdx = stepLines.length;
                  stepLineMap[evt.step] = newIdx;
                  stepLines.push('');
                  setMessages(prev => prev.map(m =>
                    m.id === assistantId ? { ...m, content: joinLines() } : m
                  ));
                  streamLine(newIdx, resultLine);
                }

              } else if (evt.type === 'done') {
                setIsLoading(false);
                const finalOutput: string = evt.output || '';
                if (finalOutput) {
                  const doneIdx = stepLines.length;
                  stepLines.push('');
                  setMessages(prev => prev.map(m =>
                    m.id === assistantId ? { ...m, content: joinLines() } : m
                  ));
                  streamLine(doneIdx, `\n---\n**Final answer:**\n\n${finalOutput}`);
                }
                // Attach analyst charts if present
                if (evt.charts && Array.isArray(evt.charts) && evt.charts.length > 0) {
                  setMessages(prev => prev.map(m =>
                    m.id === assistantId ? { ...m, analystCharts: evt.charts } : m
                  ));
                }
                ws.close();

              } else if (evt.type === 'error') {
                const errIdx = stepLines.length;
                stepLines.push('');
                streamLine(errIdx, `\n❌ **Error:** ${evt.error}`);
                setIsLoading(false);
                ws.close();
              }
            } catch {
              // non-JSON frame — ignore
            }
          };

          ws.onerror = () => {
            setIsLoading(false);
            setMessages(prev => prev.map(m =>
              m.id === assistantId
                ? { ...m, content: joinLines() + '\n\n❌ WebSocket connection error' }
                : m
            ));
          };

          ws.onclose = () => {
            // If still loading after close, treat as done
            setIsLoading(false);
          };

        } catch (err: unknown) {
          setIsLoading(false);
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(), role: 'assistant', content: '', timestamp: new Date(),
            agentError: err instanceof Error ? err.message : 'Network error reaching workflow',
          }]);
        }
        return;
      }

      // ── Crawl Agent path ──────────────────────────────────────
      if (activeAgent.agent_type === 'crawl') {
        try {
          const hdrs: Record<string, string> = { 'Content-Type': 'application/json' };
          if (user?.token) hdrs['Authorization'] = `Bearer ${user.token}`;
          const res  = await fetch(`${crawlApiUrl}/crawl/agents/${activeAgent.agent_id}/chat`, {
            method:  'POST',
            headers: hdrs,
            body:    JSON.stringify({ query: content }),
          });
          const data = await res.json();
          setIsLoading(false);
          const assistantId = crypto.randomUUID();
          if (!res.ok || data.error) {
            setMessages(prev => [...prev, {
              id: assistantId, role: 'assistant', content: '', timestamp: new Date(),
              agentError: data.error || 'Crawl agent query failed',
            }]);
          } else {
            const reply = data.answer || 'No results found.';
            const sources: { title: string; url: string }[] = data.sources || [];
            let fullReply = reply;
            if (sources.length > 0) {
              fullReply += '\n\n---\n**Crawled Sources:** ' +
                sources.slice(0, 8).map((s) => `[${s.title || s.url}](${s.url})`).join(' · ');
            }
            if (data.report_s3_url) {
              fullReply += `\n\n💾 [Saved report](${data.report_s3_url})`;
            }
            setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: new Date() }]);
            await typewriterEffect(fullReply);
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullReply } : m));
            setTypingText('');
          }
        } catch (err: unknown) {
          setIsLoading(false);
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(), role: 'assistant', content: '', timestamp: new Date(),
            agentError: err instanceof Error ? err.message : 'Network error reaching Crawl agent',
          }]);
        }
        return;
      }

      // ── Search Agent path ──────────────────────────────────────
      if (activeAgent.agent_type === 'search') {
        try {
          const hdrs: Record<string, string> = { 'Content-Type': 'application/json' };
          if (user?.token) hdrs['Authorization'] = `Bearer ${user.token}`;
          const res  = await fetch(`${searchApiUrl}/search/agents/${activeAgent.agent_id}/chat`, {
            method:  'POST',
            headers: hdrs,
            body:    JSON.stringify({ query: content }),
          });
          const data = await res.json();
          setIsLoading(false);
          const assistantId = crypto.randomUUID();
          if (!res.ok || data.error) {
            setMessages(prev => [...prev, {
              id: assistantId, role: 'assistant', content: '', timestamp: new Date(),
              agentError: data.error || 'Search agent query failed',
            }]);
          } else {
            const reply = data.answer || 'No results found.';
            const sources: { title: string; url: string }[] = data.sources || [];
            let fullReply = reply;
            if (sources.length > 0) {
              fullReply += '\n\n---\n**Web Sources:** ' +
                sources.slice(0, 8).map((s) => `[${s.title}](${s.url})`).join(' · ');
            }
            if (data.report_s3_url) {
              fullReply += `\n\n💾 [Saved report](${data.report_s3_url})`;
            }
            setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: new Date() }]);
            await typewriterEffect(fullReply);
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullReply } : m));
            setTypingText('');
          }
        } catch (err: unknown) {
          setIsLoading(false);
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(), role: 'assistant', content: '', timestamp: new Date(),
            agentError: err instanceof Error ? err.message : 'Network error reaching Search agent',
          }]);
        }
        return;
      }

      // ── RAG Agent path ──────────────────────────────────────
      if (activeAgent.agent_type === 'rag') {
        try {
          const ragHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
          if (user?.token) ragHeaders['Authorization'] = `Bearer ${user.token}`;
          const history = messages.map(m => ({ role: m.role, content: m.content }));
          const res = await fetch(`${ragApiUrl}/rag/agents/${activeAgent.agent_id}/chat`, {
            method: 'POST',
            headers: ragHeaders,
            body: JSON.stringify({ question: content, history }),
          });
          const data = await res.json();
          setIsLoading(false);
          const assistantId = crypto.randomUUID();
          if (!res.ok || data.error) {
            setMessages(prev => [...prev, {
              id: assistantId, role: 'assistant', content: '', timestamp: new Date(),
              agentError: data.error || 'RAG agent query failed',
            }]);
          } else {
            const reply = data.answer || data.reply || data.message || 'No response.';
            setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: new Date() }]);
            await typewriterEffect(reply);
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: reply } : m));
            setTypingText('');
            // Show source chunks if any
            if (data.sources && data.sources.length > 0) {
              const srcText = '\n\n---\n**Sources:** ' + data.sources.map((s: any) => `*${s.filename}* (page ${s.page})`).join(', ');
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: reply + srcText } : m));
            }
          }
        } catch (err: unknown) {
          setIsLoading(false);
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(), role: 'assistant', content: '', timestamp: new Date(),
            agentError: err instanceof Error ? err.message : 'Network error reaching RAG agent',
          }]);
        }
        return;
      }

      // ── SQL Agent path ──────────────────────────────────────
      try {
        const res = await fetch(`${agentRepoUrl}/agents/${activeAgent.agent_id}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: content }),
        });
        const data = await res.json();
        setIsLoading(false);
        const assistantId = crypto.randomUUID();

        if (!res.ok || data.error) {
          const errText = data.error || 'Agent query failed';
          const partialSql = data.sql ? `\n\nGenerated SQL:\n\`\`\`sql\n${data.sql}\n\`\`\`` : '';
          setMessages(prev => [...prev, {
            id: assistantId, role: 'assistant', content: '', timestamp: new Date(),
            agentError: errText + partialSql,
          }]);
        } else {
          const { sql, columns, rows, total_rows, execution_time, truncated, description } = data;
          setMessages(prev => [...prev, {
            id: assistantId, role: 'assistant', content: '', timestamp: new Date(),
            sqlResult: { sql, columns, rows, total_rows, execution_time, truncated },
          }]);
          if (description) {
            await typewriterEffect(description);
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: description } : m));
            setTypingText('');
          }
        }
      } catch (err: unknown) {
        setIsLoading(false);
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(), role: 'assistant', content: '', timestamp: new Date(),
          agentError: err instanceof Error ? err.message : 'Network error reaching agent',
        }]);
      }
      return;
    }

    // ── Normal Mercury-1 path ──────────────────────────────────────
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    const { reply, conversation_id } = await fetchReply(content, apiUrl, history, serverConvId, user?.token, undefined);
    setServerConvId(conversation_id);

    // First message: register this conversation (use server's ID to avoid re-loading)
    if (isFirstSend) {
      justCreatedRef.current = conversation_id;
      onChatCreated(conversation_id, content.length > 45 ? content.slice(0, 45) + '…' : content);
    }

    setIsLoading(false);

    // Typewriter animation
    const assistantId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: new Date() }]);
    await typewriterEffect(reply);
    setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: reply } : m));
    setTypingText('');
  };

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--main-bg)', position: 'relative' }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--main-bg)' }}
      >
        <div className="flex items-center gap-3">
          {/* Hamburger – mobile only */}
          <button
            onClick={onMenuClick}
            className="md:hidden p-1.5 rounded-lg transition-all hover:scale-105"
            style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>

          {/* Model pill + dropdown */}
          <div ref={agentDropRef} style={{ position: 'relative' }}>
            <div
              onClick={() => { fetchAgents(); setAgentSearch(''); setAgentDropOpen(v => !v); setTimeout(() => agentSearchRef.current?.focus(), 60); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold cursor-pointer"
              style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', userSelect: 'none' }}
            >
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse-slow" />
              {activeAgent ? activeAgent.agent_name : 'Mercury-1'}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>

            {/* Dropdown */}
            {agentDropOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  minWidth: 220,
                  background: 'var(--main-bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                  zIndex: 9000,
                  overflow: 'hidden',
                  padding: '4px',
                }}
              >
                {/* Header */}
                <div style={{ padding: '7px 10px 5px', fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  Select Agent
                </div>

                {/* Search input */}
                <div style={{ padding: '4px 6px 6px' }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ position: 'absolute', left: 8, color: 'var(--text-faint)', flexShrink: 0 }}>
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input
                      ref={agentSearchRef}
                      type="text"
                      placeholder="Search agents…"
                      value={agentSearch}
                      onChange={e => setAgentSearch(e.target.value)}
                      onKeyDown={e => e.key === 'Escape' && setAgentDropOpen(false)}
                      style={{
                        width: '100%',
                        paddingLeft: 26,
                        paddingRight: 8,
                        paddingTop: 5,
                        paddingBottom: 5,
                        fontSize: 12,
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        color: 'var(--text)',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                {/* Mercury-1 (default) — hidden when searching */}
                {!agentSearch && (
                  <AgentOption
                    label="Mercury-1"
                    subtitle="Default — General purpose AI"
                    isActive={!activeAgent}
                    isDefault
                    onClick={() => { onAgentChange?.(null); setAgentDropOpen(false); }}
                  />
                )}

                {/* Custom agents */}
                {(() => {
                  const filtered = agentList.filter(a =>
                    a.agent_name.toLowerCase().includes(agentSearch.toLowerCase()) ||
                    a.agent_id.toLowerCase().includes(agentSearch.toLowerCase())
                  );
                  if (filtered.length === 0 && agentList.length > 0) {
                    return (
                      <div style={{ padding: '6px 10px 8px', fontSize: 11, color: 'var(--text-faint)' }}>
                        No agents match &ldquo;{agentSearch}&rdquo;
                      </div>
                    );
                  }
                  if (filtered.length === 0) {
                    return (
                      <div style={{ padding: '8px 10px 6px', fontSize: 11, color: 'var(--text-faint)' }}>
                        No custom agents yet. Use{' '}
                        <span style={{ color: 'var(--accent)' }}>Semantic Layer → Apply Layer</span>{' '}
                        to create one.
                      </div>
                    );
                  }
                  return (
                    <>
                      {!agentSearch && <div style={{ height: 1, background: 'var(--border)', margin: '4px 2px' }} />}
                      {(() => {
                        const sqlAgents      = filtered.filter(a => a.agent_type === 'sql');
                        const ragAgents      = filtered.filter(a => a.agent_type === 'rag');
                        const searchAgents   = filtered.filter(a => a.agent_type === 'search');
                        const crawlAgents    = filtered.filter(a => a.agent_type === 'crawl');
                        const workflowAgents = filtered.filter(a => a.agent_type === 'workflow');
                        return (
                          <>
                            {sqlAgents.length > 0 && (
                              <>
                                {!agentSearch && <div style={{ height: 1, background: 'var(--border)', margin: '4px 2px' }} />}
                                <div style={{ padding: '5px 10px 3px', fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>SQL Agents</div>
                                <div style={{ maxHeight: 3 * 52, overflowY: 'auto' }}>
                                  {sqlAgents.map(agent => (
                                    <AgentOption key={agent.agent_id} label={agent.agent_name}
                                      subtitle={`SQL · ${agent.agent_id.slice(0, 8)}…`}
                                      isActive={activeAgent?.agent_id === agent.agent_id}
                                      agentType="sql"
                                      visibility={agent.visibility}
                                      onClick={() => { onAgentChange?.({ agent_id: agent.agent_id, agent_name: agent.agent_name, agent_type: 'sql' }); setAgentDropOpen(false); setAgentSearch(''); }}
                                    />
                                  ))}
                                </div>
                              </>
                            )}
                            {ragAgents.length > 0 && (
                              <>
                                <div style={{ height: 1, background: 'var(--border)', margin: '4px 2px' }} />
                                <div style={{ padding: '5px 10px 3px', fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>RAG Agents</div>
                                <div style={{ maxHeight: 3 * 52, overflowY: 'auto' }}>
                                  {ragAgents.map(agent => (
                                    <AgentOption key={agent.agent_id} label={agent.agent_name}
                                      subtitle={`RAG · ${agent.agent_id.slice(0, 8)}…`}
                                      isActive={activeAgent?.agent_id === agent.agent_id}
                                      agentType="rag"
                                      visibility={agent.visibility}
                                      onClick={() => { onAgentChange?.({ agent_id: agent.agent_id, agent_name: agent.agent_name, agent_type: 'rag' }); setAgentDropOpen(false); setAgentSearch(''); }}
                                    />
                                  ))}
                                </div>
                              </>
                            )}
                            {searchAgents.length > 0 && (
                              <>
                                <div style={{ height: 1, background: 'var(--border)', margin: '4px 2px' }} />
                                <div style={{ padding: '5px 10px 3px', fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Search Agents</div>
                                <div style={{ maxHeight: 3 * 52, overflowY: 'auto' }}>
                                  {searchAgents.map(agent => (
                                    <AgentOption key={agent.agent_id} label={agent.agent_name}
                                      subtitle={`Web Search · ${agent.agent_id.slice(0, 8)}…`}
                                      isActive={activeAgent?.agent_id === agent.agent_id}
                                      agentType="search"
                                      onClick={() => { onAgentChange?.({ agent_id: agent.agent_id, agent_name: agent.agent_name, agent_type: 'search' }); setAgentDropOpen(false); setAgentSearch(''); }}
                                    />
                                  ))}
                                </div>
                              </>
                            )}
                            {crawlAgents.length > 0 && (
                              <>
                                <div style={{ height: 1, background: 'var(--border)', margin: '4px 2px' }} />
                                <div style={{ padding: '5px 10px 3px', fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Crawl Agents</div>
                                <div style={{ maxHeight: 3 * 52, overflowY: 'auto' }}>
                                  {crawlAgents.map(agent => (
                                    <AgentOption key={agent.agent_id} label={agent.agent_name}
                                      subtitle={`Crawl · ${agent.agent_id.slice(0, 8)}…`}
                                      isActive={activeAgent?.agent_id === agent.agent_id}
                                      agentType="crawl"
                                      onClick={() => { onAgentChange?.({ agent_id: agent.agent_id, agent_name: agent.agent_name, agent_type: 'crawl' }); setAgentDropOpen(false); setAgentSearch(''); }}
                                    />
                                  ))}
                                </div>
                              </>
                            )}
                            {workflowAgents.length > 0 && (
                              <>
                                <div style={{ height: 1, background: 'var(--border)', margin: '4px 2px' }} />
                                <div style={{ padding: '5px 10px 3px', fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Workflows</div>
                                <div style={{ maxHeight: 3 * 52, overflowY: 'auto' }}>
                                  {workflowAgents.map(agent => (
                                    <AgentOption key={agent.agent_id} label={agent.agent_name}
                                      subtitle={`Workflow · ${agent.agent_id.slice(0, 8)}…`}
                                      isActive={activeAgent?.agent_id === agent.agent_id}
                                      agentType="workflow"
                                      onClick={() => { onAgentChange?.({ agent_id: agent.agent_id, agent_name: agent.agent_name, agent_type: 'workflow' }); setAgentDropOpen(false); setAgentSearch(''); }}
                                    />
                                  ))}
                                </div>
                              </>
                            )}
                          </>
                        );
                      })()}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs"
            style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            API Live
          </div>
          {messages.length > 0 && (
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105"
              style={{ background: 'var(--accent)', color: '#fff', boxShadow: '0 2px 8px rgba(42,147,213,0.4)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>
              Share
            </button>
          )}
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────── */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        {loadingHistory ? (
          /* Loading history spinner */
          <div className="flex items-center justify-center min-h-full">
            <div className="flex flex-col items-center gap-3">
              <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading conversation…</p>
            </div>
          </div>
        ) : messages.length === 0 ? (

          /* Welcome */
          <div className="flex flex-col items-center justify-center min-h-full px-6 py-16 animate-fade-in">
            {/* Logo */}
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl text-white mb-6 shadow-xl"
              style={{ background: 'linear-gradient(135deg, var(--accent), #1a7ab8)' }}
            >
              ⚡
            </div>
            <h1
              className="text-3xl md:text-4xl font-bold text-center mb-3 tracking-tight"
              style={{ color: 'var(--text)' }}
            >
              How can I help you today?
            </h1>
            <p className="text-sm text-center mb-12" style={{ color: 'var(--text-muted)' }}>
              Powered by <span style={{ color: 'var(--accent)', fontWeight: 600 }}>AWS Lambda + Bedrock</span> · 
              Hosted on <span style={{ color: 'var(--accent)', fontWeight: 600 }}>S3 + CloudFront</span>
            </p>

            {/* Prompt cards */}
            <div className="grid grid-cols-2 gap-3 w-full max-w-2xl">
              {PROMPTS.map(p => (
                <button
                  key={p.label}
                  onClick={() => sendMessage(p.text)}
                  className="flex flex-col items-start gap-2 p-4 rounded-xl text-left transition-all hover:-translate-y-0.5 hover:shadow-lg"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                  }}
                >
                  <span className="text-xl">{p.icon}</span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{p.label}</span>
                  <span className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{p.text}</span>
                </button>
              ))}
            </div>
          </div>

        ) : (

          /* Messages */
          <div className="max-w-3xl mx-auto w-full py-2">
            {messages.map((msg, idx) => {
              // Show typewriter text on the last assistant message while typing
              const isLastAssistant = isTyping && idx === messages.length - 1 && msg.role === 'assistant';
              return (
                <ChatMessage
                  key={msg.id}
                  message={isLastAssistant ? { ...msg, content: typingText } : msg}
                />
              );
            })}

            {/* Typing indicator — only when waiting for server, not during typewriter */}
            {isLoading && !isTyping && (
              <div className="flex gap-2 py-3 px-4 animate-fade-in items-center">
                {/* Small pulsing assistant icon */}
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center text-white flex-shrink-0 shadow-md animate-breathe"
                  style={{
                    background: 'linear-gradient(135deg, #2A93D5, #1a7ab8)',
                    minWidth: '1.5rem',
                    fontSize: '11px',
                    transformOrigin: 'bottom left',
                  }}
                >
                  ⚡
                </div>
                {/* Breathing bubble with dots */}
                <div
                  className="flex items-center gap-1 px-3 py-2.5 rounded-2xl rounded-bl-sm animate-breathe"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    transformOrigin: 'bottom left',
                  }}
                >
                  {[0, 220, 440].map(delay => (
                    <span
                      key={delay}
                      className="w-1.5 h-1.5 rounded-full animate-bounce-dot"
                      style={{ background: 'var(--accent)', animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
                {/* Typewriter cycling status text */}
                <TypingPhrase />
                <style>{`@keyframes cursorBlink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
              </div>
            )}
            <div ref={messagesEndRef} className="h-4" />
          </div>
        )}
      </div>

      {/* Scroll-to-bottom FAB — appears when user scrolls up */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          title="Scroll to bottom"
          style={{
            position: 'absolute', bottom: 88, right: 22, zIndex: 30,
            width: 34, height: 34, borderRadius: '50%',
            background: 'var(--accent)', border: '1px solid rgba(255,255,255,0.2)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(42,147,213,0.5)', color: '#fff',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      )}

      {/* ── Input ──────────────────────────────────────────── */}
      <div className="flex-shrink-0">
        {/* Active agent indicator banner */}
        {activeAgent && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 16px',
              background: activeAgent.agent_type === 'rag' ? '#10b98118' : 'var(--accent)12',
              borderTop: `1px solid ${activeAgent.agent_type === 'rag' ? '#10b98130' : 'var(--accent)30'}`,
              fontSize: 11,
              color: activeAgent.agent_type === 'rag' ? '#10b981' : 'var(--accent)',
            }}
          >
            {activeAgent.agent_type === 'rag' ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                <polyline points="2 17 12 22 22 17"/>
                <polyline points="2 12 12 17 22 12"/>
              </svg>
            )}
            <span>
              Using agent <strong>{activeAgent.agent_name}</strong> ·{' '}
              {activeAgent.agent_type === 'rag' ? 'Document Q&A mode' : 'Schema-aware SQL mode'}
            </span>
            <button
              onClick={() => onAgentChange?.(null)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 10 }}
            >
              ✕ Reset
            </button>
          </div>
        )}
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={() => sendMessage()}
          isLoading={isLoading || isTyping}
          placeholder={activeAgent ? `Ask ${activeAgent.agent_name} a question about your data…` : 'Message Mercury Grid…'}
        />
      </div>
    </div>
  );
}

// ── AgentOption ────────────────────────────────────────────────────────────
function AgentOption({
  label, subtitle, isActive, isDefault, agentType, visibility, onClick,
}: {
  label: string; subtitle: string; isActive: boolean; isDefault?: boolean; agentType?: 'sql' | 'rag' | 'workflow' | 'search' | 'crawl'; visibility?: 'public' | 'owned' | 'shared'; onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '7px 10px',
        borderRadius: '8px',
        cursor: 'pointer',
        background: isActive ? 'var(--accent)15' : 'transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--surface)'; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      {/* Icon */}
      <div
        style={{
          width: 28, height: 28, borderRadius: '7px', flexShrink: 0,
          background: isDefault
            ? 'linear-gradient(135deg,var(--accent),#1a7ab8)'
            : agentType === 'rag'
            ? 'linear-gradient(135deg,#10b981,#059669)'
            : agentType === 'workflow'
            ? 'linear-gradient(135deg,#d946ef,#a21caf)'
            : agentType === 'search'
            ? 'linear-gradient(135deg,#0ea5e9,#0284c7)'
            : agentType === 'crawl'
            ? 'linear-gradient(135deg,#f59e0b,#d97706)'
            : 'linear-gradient(135deg,#f59e0b,#d97706)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {isDefault
          ? <span style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>⚡</span>
          : agentType === 'rag'
          ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
            </svg>
          : agentType === 'workflow'
          ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
              <line x1="7" y1="12" x2="17" y2="12"/>
              <polyline points="14 9 17 12 14 15"/>
            </svg>
          : agentType === 'search'
          ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          : agentType === 'crawl'
          ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2"/>
              <polyline points="2 17 12 22 22 17"/>
              <polyline points="2 12 12 17 22 12"/>
            </svg>
        }
      </div>
      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>
          {subtitle}
        </div>
      </div>
      {/* Visibility badge */}
      {visibility === 'public' && (
        <span title="Public agent" style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 9, fontWeight: 600, color: '#10b981', background: '#10b98115', border: '1px solid #10b98130', borderRadius: 4, padding: '1px 4px', flexShrink: 0 }}>
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
          Public
        </span>
      )}
      {visibility === 'shared' && (
        <span title="Shared with you" style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 9, fontWeight: 600, color: '#6366f1', background: '#6366f115', border: '1px solid #6366f130', borderRadius: 4, padding: '1px 4px', flexShrink: 0 }}>
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          Shared
        </span>
      )}
      {/* Active check */}
      {isActive && (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      )}
    </div>
  );
}
