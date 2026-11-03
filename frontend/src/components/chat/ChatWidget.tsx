import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import type { ChatAction } from '../../types';
import ChatLauncher from './ChatLauncher';
import { mockReply } from './mockReplies';
import type { ChatEntry, PanelState } from './types';

const loadPanel = () => import('./ChatPanel');
const ChatPanel = lazy(loadPanel);

const REPLY_DELAY_MS = 450;

/**
 * The assistant on every page: the launcher, and the panel once opened.
 * Replies are mocked until it calls POST /api/chat.
 */
export default function ChatWidget() {
  const hidden = useUIStore((s) => s.hideBalances);
  const [state, setState] = useState<PanelState>('closed');
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [pending, setPending] = useState(false);
  const [unread, setUnread] = useState(0);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const nextId = useRef(0);
  // The panel state as of the latest render, read when a reply lands.
  const stateRef = useRef(state);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const id = () => `m${nextId.current++}`;

  const respond = useCallback((userText: string) => {
    setEntries((prev) => [...prev, { id: id(), role: 'user', text: userText }]);
    setPending(true);
    timers.current.push(
      window.setTimeout(() => {
        const replies = mockReply();
        setEntries((prev) => [
          ...prev,
          ...replies.map((message) => ({ id: id(), role: 'bot' as const, message })),
        ]);
        setPending(false);
        if (stateRef.current !== 'open') setUnread((n) => n + replies.length);
      }, REPLY_DELAY_MS),
    );
  }, []);

  const open = useCallback(() => {
    setState('open');
    setUnread(0);
  }, []);

  const close = useCallback(() => {
    setState('closed');
    // Give focus back to the launcher once it renders again.
    window.setTimeout(() => launcherRef.current?.focus(), 0);
  }, []);

  return (
    <>
      {state === 'closed' && (
        <ChatLauncher
          onOpen={open}
          unread={unread}
          onPrefetch={() => void loadPanel()}
          buttonRef={launcherRef}
        />
      )}
      {state !== 'closed' && (
        <Suspense fallback={null}>
          <ChatPanel
            state={state}
            entries={entries}
            pending={pending}
            hidden={hidden}
            onClose={close}
            onMinimize={() => setState('minimized')}
            onExpand={open}
            onSend={respond}
            onAction={(_action: ChatAction, label: string) => respond(label)}
            onNavigate={() => {
              // On phones the panel covers the page; get out of the way.
              if (window.matchMedia?.('(max-width: 639px)').matches) setState('minimized');
            }}
          />
        </Suspense>
      )}
    </>
  );
}
