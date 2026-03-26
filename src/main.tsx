import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/instrument-serif/latin.css';
import App from './App';
import './styles/globals.css';

// Global error handler — shows errors on screen instead of blank white page
window.onerror = (msg, src, line, col, err) => {
  const el = document.getElementById('root');
  if (el) el.innerHTML = `<pre style="padding:2rem;color:red;font-size:12px;white-space:pre-wrap">CRASH: ${msg}\n\nSource: ${src}:${line}:${col}\n\nStack: ${err?.stack || 'N/A'}</pre>`;
};
window.addEventListener('unhandledrejection', (e) => {
  const el = document.getElementById('root');
  if (el) el.innerHTML = `<pre style="padding:2rem;color:red;font-size:12px;white-space:pre-wrap">UNHANDLED PROMISE: ${e.reason?.message || e.reason}\n\nStack: ${e.reason?.stack || 'N/A'}</pre>`;
});

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
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
