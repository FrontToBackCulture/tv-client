// src/components/Login.tsx
// Login page with GitHub OAuth

import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Loader2 } from "lucide-react";
import { useAuth, isGitHubConfigured } from "../stores/authStore";

export function Login() {
  const { signInWithGitHub, isLoading, error, clearError } = useAuth();

  // Clear error on mount
  useEffect(() => {
    clearError();
  }, [clearError]);

  const handleSignIn = async () => {
    await signInWithGitHub();
  };

  // If GitHub is not configured, show setup instructions
  if (!isGitHubConfigured) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-zinc-50 via-zinc-100 to-zinc-200 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-800">
        {/* Draggable title bar */}
        <div
          data-tauri-drag-region
          className="h-10 flex-shrink-0 flex items-center"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div className="w-20 flex-shrink-0" />
          <div className="flex-1 flex justify-center">
            <span className="text-xs text-zinc-500 pointer-events-none">TV Desktop</span>
          </div>
          <div className="w-20 flex-shrink-0" />
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-sm">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-teal-600 text-white mb-6 shadow-lg shadow-teal-600/25">
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">
                TV Desktop
              </h1>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl shadow-zinc-200/50 dark:shadow-none border border-zinc-200/50 dark:border-zinc-800 p-6">
              <div className="text-center mb-6">
                <h2 className="text-lg font-medium text-zinc-900 dark:text-white">
                  Setup Required
                </h2>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  GitHub configuration is missing
                </p>
              </div>

              <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
                <p>Add these to your <code className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-xs">.env</code> file:</p>
                <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3 font-mono text-xs">
                  <p>VITE_GITHUB_CLIENT_ID=...</p>
                  <p>VITE_GITHUB_CLIENT_SECRET=...</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-zinc-50 via-zinc-100 to-zinc-200 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-800">
      {/* Draggable title bar */}
      <div
        data-tauri-drag-region
        className="h-10 flex-shrink-0 flex items-center"
        onMouseDown={() => getCurrentWindow().startDragging()}
      >
        <div className="w-20 flex-shrink-0" />
        <div className="flex-1 flex justify-center pointer-events-none">
          <span className="text-xs text-zinc-500">TV Desktop</span>
        </div>
        <div className="w-20 flex-shrink-0" />
      </div>
      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {/* Logo & Branding */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-teal-600 text-white mb-6 shadow-lg shadow-teal-600/25">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">
              TV Desktop
            </h1>
            <p className="mt-2 text-zinc-500 dark:text-zinc-400 text-sm">
              Knowledge management for ThinkVAL
            </p>
          </div>

          {/* Login Card */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl shadow-zinc-200/50 dark:shadow-none border border-zinc-200/50 dark:border-zinc-800 p-6">
            <div className="text-center mb-6">
              <h2 className="text-lg font-medium text-zinc-900 dark:text-white">
                Welcome back
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Sign in to continue to your workspace
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* Sign In Button */}
            <button
              onClick={handleSignIn}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-medium py-3 px-4 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              <span>{isLoading ? "Opening browser..." : "Continue with GitHub"}</span>
            </button>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-200 dark:border-zinc-700" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-white dark:bg-zinc-900 text-zinc-400">
                  Secure authentication
                </span>
              </div>
            </div>

            {/* Info */}
            <div className="space-y-3">
              <div className="flex items-start gap-3 text-sm">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-zinc-700 dark:text-zinc-200">Repository access</p>
                  <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">Read and write to your connected repositories</p>
                </div>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-zinc-700 dark:text-zinc-200">Organization access</p>
                  <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">View members of your GitHub organization</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
            By signing in, you agree to our terms of service
          </p>
        </div>
      </div>

      {/* Bottom branding */}
      <div className="py-4 text-center">
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Powered by <span className="font-medium text-teal-600 dark:text-teal-400">ThinkVAL</span>
        </p>
      </div>
    </div>
  );
}
