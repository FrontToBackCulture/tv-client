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

  stock: (symbol: string | null) =>
    [...investmentKeys.all, "stock", symbol ?? "none"] as const,
  stockProfile: (symbol: string | null) =>
    [...investmentKeys.stock(symbol), "profile"] as const,
  stockPrices: (symbol: string | null, years: number) =>
    [...investmentKeys.stock(symbol), "prices", years] as const,
  stockRatios: (symbol: string | null) =>
    [...investmentKeys.stock(symbol), "ratios"] as const,
  stockKeyMetrics: (symbol: string | null) =>
    [...investmentKeys.stock(symbol), "key-metrics"] as const,
  stockIncomeAnnual: (symbol: string | null) =>
    [...investmentKeys.stock(symbol), "income-annual"] as const,
  stockIncomeQuarterly: (symbol: string | null, quarters: number) =>
    [...investmentKeys.stock(symbol), "income-quarterly", quarters] as const,

  signals: (symbols: string[]) =>
    [...investmentKeys.all, "signals", [...symbols].sort().join(",")] as const,

  stockNews: (symbol: string | null) =>
    [...investmentKeys.stock(symbol), "news"] as const,
  stockAnalyst: (symbol: string | null) =>
    [...investmentKeys.stock(symbol), "analyst"] as const,
};
