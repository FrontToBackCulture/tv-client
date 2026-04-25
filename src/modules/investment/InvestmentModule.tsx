// Investment module — personal-workspace-only top-level module.
//
// Owns two axes of view state:
//   1. Which page is visible (Overview / Positions / Trades / Dividends) —
//      passed to the InvestmentSidebar
//   2. Which account is selected (null = All accounts consolidated, or a
//      specific IBKR account ID) — passed to every page as a prop; pages
//      forward it to their data hooks
//
// Workspace visibility is gated in moduleVisibilityStore: `investment` only
// returns true for workspaces whose slug is in the personal allowlist
// (currently just `melly`). ActivityBar consults the visibility store, so
// this module never renders in ThinkVAL or client workspaces.

import { useState } from "react";
import { InvestmentSidebar, type InvestmentView } from "./InvestmentSidebar";
import { AccountSelector } from "./AccountSelector";
import { OverviewPage } from "./OverviewPage";
import { PositionsPage } from "./PositionsPage";
import { SignalsPage } from "./SignalsPage";
import { TradesPage } from "./TradesPage";
import { DividendsPage } from "./DividendsPage";
import { StockDetailPage } from "./StockDetailPage";
import { InvestmentToolbar } from "./InvestmentToolbar";
import { useAccounts } from "../../hooks/investment";

export function InvestmentModule() {
  const [view, setView] = useState<InvestmentView>("overview");
  const [accountId, setAccountId] = useState<string | null>(null);
  // Symbol drill-down: when set, overlays Positions with StockDetailPage.
  // Cleared when navigating to any other view or clicking "Back".
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null);
  const { data: accounts = [] } = useAccounts();

  const handleViewChange = (next: InvestmentView) => {
    setDetailSymbol(null);
    setView(next);
  };

  // Layout note: we use a single scroll container for the whole content area
  // (selector + page). Earlier versions nested a flex/overflow-hidden wrapper
  // around the selector, which collapsed to 0 height when the module's
  // parent didn't cascade a concrete height — resulting in a blank module.
  // Keeping the structure flat matches the pattern used by InboxModule et al.
  return (
    <div className="flex h-full bg-zinc-50 dark:bg-zinc-950">
      <InvestmentSidebar active={view} onChange={handleViewChange} />
      <div className="flex-1 overflow-auto flex flex-col">
        <InvestmentToolbar />
        {detailSymbol ? (
          <StockDetailPage symbol={detailSymbol} onBack={() => setDetailSymbol(null)} />
        ) : (
          <>
            <AccountSelector accounts={accounts} selected={accountId} onChange={setAccountId} />
            {view === "overview" && <OverviewPage accountId={accountId} accounts={accounts} />}
            {view === "positions" && (
              <PositionsPage
                accountId={accountId}
                hasMultipleAccounts={accounts.length > 1}
                onSelectSymbol={setDetailSymbol}
              />
            )}
            {view === "signals" && <SignalsPage onSelectSymbol={setDetailSymbol} />}
            {view === "trades" && <TradesPage accountId={accountId} hasMultipleAccounts={accounts.length > 1} />}
            {view === "dividends" && <DividendsPage accountId={accountId} hasMultipleAccounts={accounts.length > 1} />}
          </>
        )}
      </div>
    </div>
  );
}
