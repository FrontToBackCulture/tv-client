// Barrel exports for the Investment module hooks.

export { investmentKeys } from "./keys";
export { useAccounts } from "./useAccounts";
export { useLatestPositions, type IbkrPosition } from "./usePositions";
export { useTrades, type IbkrTrade } from "./useTrades";
export { useDividends, type IbkrDividend } from "./useDividends";
export { useLatestNav, useNavHistory, type IbkrNavRow } from "./useNavHistory";
export { useInvestmentSignals, type InvestmentSignal } from "./useSignals";
export {
  useStockProfile,
  useStockPrices,
  useStockRatios,
  useStockKeyMetrics,
  useStockIncomeAnnual,
  useStockIncomeQuarterly,
  type StockProfile,
  type PriceBar,
  type RatiosYearRow,
  type KeyMetricsYearRow,
  type IncomeYearRow,
  type IncomeQuarterRow,
} from "./useStock";
export {
  useStockNews,
  useStockAnalyst,
  type NewsItem,
  type AnalystSnapshot,
} from "./useStockExtras";
export {
  useStockNarrative,
  useGenerateStockNarrative,
  type StockNarrative,
} from "./useStockNarrative";
