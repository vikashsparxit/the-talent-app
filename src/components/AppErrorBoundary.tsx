import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isChunkLoadError, recoverFromStaleBuild, recoveredRecently } from '@/lib/appRecovery';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last-resort boundary around the whole app: instead of a blank white page,
 * show a short message with a Reload button. A failed load of a build file
 * (a stale PWA after a deploy) triggers one automatic cache-busting reload.
 * Styles are inline so the screen still renders if the stylesheet failed.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App crashed', error, info.componentStack);
    if (isChunkLoadError(error) && !recoveredRecently({ storage: safeSession() })) {
      void recoverFromStaleBuild();
    }
  }

  handleReload = () => {
    void recoverFromStaleBuild({ force: true });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          color: '#1f2937',
          background: '#ffffff',
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Something went wrong</h1>
        <p style={{ maxWidth: 360, margin: 0, color: '#6b7280', fontSize: 14 }}>
          The app could not finish loading. This usually happens right after an update. Reload to get the latest
          version.
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            background: '#D64541',
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}

function safeSession(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
