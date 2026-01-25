// src/components/UserProfile.tsx
// User profile dropdown showing logged-in user info

import { useState, useRef, useEffect } from "react";
import { LogOut, User, Github, ChevronDown, Settings } from "lucide-react";
import { useAuth, useUserInfo } from "../stores/authStore";
import { cn } from "../lib/cn";

interface UserProfileProps {
  collapsed?: boolean;
}

export function UserProfile({ collapsed = false }: UserProfileProps) {
  const { signOut, isLoading } = useAuth();
  const userInfo = useUserInfo();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown]);

  if (!userInfo) {
    return null;
  }

  const handleSignOut = async () => {
    setShowDropdown(false);
    await signOut();
  };

  // Get initials for avatar fallback
  const initials = userInfo.name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* User Button */}
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={cn(
          "flex items-center gap-2 rounded-lg transition-colors",
          collapsed
            ? "p-2 hover:bg-slate-100 dark:hover:bg-zinc-800"
            : "w-full px-3 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800"
        )}
        title={collapsed ? userInfo.name : undefined}
      >
        {/* Avatar */}
        {userInfo.avatarUrl ? (
          <img
            src={userInfo.avatarUrl}
            alt={userInfo.name}
            className="w-8 h-8 rounded-full flex-shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-white font-medium text-sm flex-shrink-0">
            {initials}
          </div>
        )}

        {/* User info (hidden when collapsed) */}
        {!collapsed && (
          <>
            <div className="flex-1 text-left min-w-0">
              <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                {userInfo.name}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                {userInfo.email || userInfo.githubUsername}
              </div>
            </div>
            <ChevronDown
              size={14}
              className={cn(
                "text-zinc-400 transition-transform flex-shrink-0",
                showDropdown && "rotate-180"
              )}
            />
          </>
        )}
      </button>

      {/* Dropdown Menu */}
      {showDropdown && (
        <div
          className={cn(
            "absolute z-50 bg-white dark:bg-zinc-900 rounded-lg shadow-lg border border-slate-200 dark:border-zinc-700 overflow-hidden",
            collapsed ? "left-full ml-2 bottom-0 w-64" : "left-0 right-0 bottom-full mb-2"
          )}
        >
          {/* User Info Header */}
          <div className="p-4 border-b border-slate-200 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              {userInfo.avatarUrl ? (
                <img
                  src={userInfo.avatarUrl}
                  alt={userInfo.name}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-teal-600 flex items-center justify-center text-white font-medium">
                  {initials}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-zinc-900 dark:text-white truncate">
                  {userInfo.name}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  {userInfo.email}
                </div>
              </div>
            </div>
          </div>

          {/* GitHub Info */}
          <div className="p-4 border-b border-slate-200 dark:border-zinc-800">
            <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 mb-2">
              <Github size={14} />
              <span>Authenticated with GitHub</span>
            </div>
            {userInfo.githubUsername && (
              <div className="text-xs text-zinc-500 dark:text-zinc-500">
                @{userInfo.githubUsername}
              </div>
            )}
            <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mt-2">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Connected</span>
            </div>
          </div>

          {/* Actions */}
          <div className="p-2">
            <button
              onClick={() => setShowDropdown(false)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded transition-colors"
            >
              <User size={16} />
              Profile
            </button>
            <button
              onClick={() => setShowDropdown(false)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded transition-colors"
            >
              <Settings size={16} />
              Settings
            </button>
            <div className="my-1 border-t border-slate-200 dark:border-zinc-800" />
            <button
              onClick={handleSignOut}
              disabled={isLoading}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
            >
              <LogOut size={16} />
              {isLoading ? "Signing out..." : "Sign Out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Compact version for activity bar
export function UserAvatar() {
  const userInfo = useUserInfo();

  if (!userInfo) {
    return (
      <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
    );
  }

  const initials = userInfo.name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  if (userInfo.avatarUrl) {
    return (
      <img
        src={userInfo.avatarUrl}
        alt={userInfo.name}
        className="w-8 h-8 rounded-full"
        title={userInfo.name}
      />
    );
  }

  return (
    <div
      className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-white font-medium text-sm"
      title={userInfo.name}
    >
      {initials}
    </div>
  );
}
