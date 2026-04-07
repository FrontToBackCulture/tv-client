// React Query keys for the Investment module.
//
// Every data query is scoped by account: an optional `accountId` segment
// appears in the key so React Query can cache account-specific views
// separately from the "all accounts" consolidated view without collisions.
// `null` means "all accounts" and is encoded as the literal string "all" in
// the cache key to keep key stability across re-renders.

type AccountScope = string | null;

function acct(id: AccountScope): string {
  return id ?? "all";
}

export const investmentKeys = {
  all: ["investment"] as const,

  accounts: () => [...investmentKeys.all, "accounts"] as const,

  positions: () => [...investmentKeys.all, "positions"] as const,
  positionsLatest: (accountId: AccountScope = null) =>
    [...investmentKeys.positions(), "latest", acct(accountId)] as const,

  trades: () => [...investmentKeys.all, "trades"] as const,
  tradesList: (accountId: AccountScope = null, filters?: unknown) =>
    [...investmentKeys.trades(), "list", acct(accountId), filters] as const,

  cash: () => [...investmentKeys.all, "cash"] as const,
  dividends: (accountId: AccountScope = null) =>
    [...investmentKeys.cash(), "dividends", acct(accountId)] as const,

  nav: () => [...investmentKeys.all, "nav"] as const,
  navLatest: (accountId: AccountScope = null) =>
    [...investmentKeys.nav(), "latest", acct(accountId)] as const,
  navHistory: (accountId: AccountScope = null) =>
    [...investmentKeys.nav(), "history", acct(accountId)] as const,
};
