import React, { Component, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/instrument-serif/latin.css';
import App from './App';
import './styles/globals.css';

// Global error handler — shows errors on screen instead of blank white page
window.onerror = (msg, src, line, col, err) => {
  document.title = `CRASH: ${msg}`;
  const el = document.getElementById('crash-log');
  if (el) el.textContent += `\n[onerror] ${msg}\nSource: ${src}:${line}:${col}\nStack: ${err?.stack || 'N/A'}\n`;
  const root = document.getElementById('root');
  if (root) root.style.display = 'none';
  const crash = document.getElementById('crash-screen');
  if (crash) crash.style.display = 'block';
};
window.addEventListener('unhandledrejection', (e) => {
  const el = document.getElementById('crash-log');
  if (el) el.textContent += `\n[promise] ${e.reason?.message || e.reason}\nStack: ${e.reason?.stack || 'N/A'}\n`;
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

const queryClient = new QueryClient({
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
