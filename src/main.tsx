// Side-effect import: resolves the active workspace for this window BEFORE
// any store is hydrated. `workspaceScopedStorage` runs `initWorkspaceScope()`
// at module load, and ES module evaluation is depth-first — so this import
// must stay the first import in the file so its evaluation completes before
// `./App` (and the stores it pulls in) runs.
import './lib/workspaceScopedStorage';

import React, { Component, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/instrument-serif/latin.css';
import App from './App';
import './stores/themeStore'; // applies theme + dark class on boot
import './styles/globals.css';

// Global error handler — shows crash screen only if React hasn't rendered yet
// (pre-mount failures). Post-mount errors are handled by CrashBoundary.
// Tauri/WebKit internal errors (permission denials, _sandbox) are logged but
// never crash the app.
const NON_FATAL = /access\.\w+ not allowed|Can't find variable: _sandbox/;
window.onerror = (msg, src, line, col, err) => {
  const text = String(msg);
  console.error('[onerror]', text, src, line, col, err);
  if (NON_FATAL.test(text)) return;
  // Only show crash screen if React hasn't rendered anything yet
  const root = document.getElementById('root');
  if (root && root.childElementCount > 0) return;
  document.title = `CRASH: ${text}`;
  const el = document.getElementById('crash-log');
  if (el) el.textContent += `\n[onerror] ${text}\nSource: ${src}:${line}:${col}\nStack: ${err?.stack || 'N/A'}\n`;
  if (root) root.style.display = 'none';
  const crash = document.getElementById('crash-screen');
  if (crash) crash.style.display = 'block';
};
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandledrejection]', e.reason);
});

// Top-level error boundary that catches React render errors
class CrashBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const el = document.getElementById('crash-log');
    if (el) el.textContent += `\n[react] ${error.message}\n${error.stack}\nComponent: ${info.componentStack}\n`;
    const root = document.getElementById('root');
    if (root) root.style.display = 'none';
    const crash = document.getElementById('crash-screen');
    if (crash) crash.style.display = 'block';
  }
  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 15, // GC unused cache entries after 15 min
      retry: 1,
      refetchOnWindowFocus: false, // Realtime handles live updates; no need to refetch on focus
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CrashBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </CrashBoundary>
  </React.StrictMode>
);
