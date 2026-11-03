import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useChat } from '../../hooks/useChat';
import { useUIStore } from '../../store/uiStore';
import ChatLauncher from './ChatLauncher';
import type { PanelState } from './types';

const loadPanel = () => import('./ChatPanel');
const ChatPanel = lazy(loadPanel);

/** The assistant on every page: the launcher, and the panel once opened. */
export default function ChatWidget() {
  const hidden = useUIStore((s) => s.hideBalances);
  const [state, setState] = useState<PanelState>('closed');
  const [unread, setUnread] = useState(0);
  const launcherRef = useRef<HTMLButtonElement>(null);
  // The panel state as of the latest render, read when a reply lands.
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const chat = useChat({
    onReply: (count) => {
      if (stateRef.current !== 'open') setUnread((n) => n + count);
    },
  });

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
            entries={chat.entries}
            pending={chat.pending}
            hidden={hidden}
            failure={chat.failure}
            onRetry={chat.retry}
            onClose={close}
            onMinimize={() => setState('minimized')}
            onExpand={open}
            onSend={chat.send}
            onAction={chat.sendAction}
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
