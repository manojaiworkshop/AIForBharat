'use client';

import { useRef, KeyboardEvent, useEffect } from 'react';

interface ChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  isLoading: boolean;
  placeholder?: string;
}

export default function ChatInput({ value, onChange, onSend, isLoading, placeholder = 'Message Mercury Grid…' }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && value.trim()) onSend();
    }
  };

  const canSend = !isLoading && value.trim().length > 0;

  return (
    <div className="px-4 pb-5 pt-3">
      <div
        className="relative flex items-end max-w-3xl mx-auto rounded-2xl transition-all"
        style={{
          background: 'var(--surface)',
          border: '1.5px solid var(--border)',
          boxShadow: 'var(--shadow)',
        }}
      >
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={isLoading}
          className="flex-1 bg-transparent px-4 py-3.5 text-sm outline-none overflow-hidden"
          style={{
            color: 'var(--text)',
            lineHeight: '1.6',
            caretColor: 'var(--accent)',
            minHeight: '52px',
            maxHeight: '200px',
            overflowY: 'auto',
          }}
        />

        {/* Send button */}
        <button
          onClick={onSend}
          disabled={!canSend}
          className="flex-shrink-0 m-2 w-9 h-9 rounded-xl flex items-center justify-center transition-all"
          style={{
            background: canSend ? 'var(--accent)' : 'var(--border)',
            color: canSend ? '#fff' : 'var(--text-faint)',
            cursor: canSend ? 'pointer' : 'default',
            transform: canSend ? 'scale(1)' : 'scale(0.95)',
            boxShadow: canSend ? '0 2px 8px rgba(42,147,213,0.5)' : 'none',
          }}
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/>
              <polyline points="5 12 12 5 19 12"/>
            </svg>
          )}
        </button>
      </div>

      <p className="text-center text-xs mt-2.5" style={{ color: 'var(--text-faint)' }}>
        Mercury Grid can make mistakes. Press <kbd className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>Enter</kbd> to send · <kbd className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>Shift+Enter</kbd> for new line
      </p>
    </div>
  );
}
