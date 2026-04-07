// Account selector — horizontal tab strip at the top of the Investment
// module. Lets the user pivot every page between "All accounts" (consolidated
// view) and a specific account's data.
//
// Hidden when the workspace has 0 or 1 account: with a single account there's
// nothing to pick, and the "All" view already renders just that account.

import { cn } from "../../lib/cn";

interface AccountSelectorProps {
  accounts: string[];
  selected: string | null;  // null = All
  onChange: (accountId: string | null) => void;
}

export function AccountSelector({ accounts, selected, onChange }: AccountSelectorProps) {
  // Single-account workspaces don't need a selector — consolidated IS that account.
  if (accounts.length < 2) return null;

  return (
    <div className="flex items-center gap-1 px-6 pt-4 border-b border-zinc-200 dark:border-zinc-800">
      <Tab label="All Accounts" active={selected === null} onClick={() => onChange(null)} />
      {accounts.map((id) => (
        <Tab
          key={id}
          label={id}
          active={selected === id}
          onClick={() => onChange(id)}
        />
      ))}
    </div>
  );
}

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
        active
          ? "border-teal-600 text-zinc-900 dark:text-zinc-100"
          : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300",
      )}
    >
      {label}
    </button>
  );
}
