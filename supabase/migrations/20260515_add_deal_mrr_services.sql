-- Add MRR + services breakdown to deal-type projects.
-- deal_mrr, deal_setup_fee: new plain columns (writable).
-- deal_arr: generated = deal_mrr * 12.
-- deal_year_1_total: generated = ARR + setup (NULL only when both inputs NULL).
-- deal_value remains writable for legacy/manual override; reads should COALESCE.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS deal_mrr numeric,
  ADD COLUMN IF NOT EXISTS deal_setup_fee numeric;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS deal_arr numeric
    GENERATED ALWAYS AS (deal_mrr * 12) STORED;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS deal_year_1_total numeric
    GENERATED ALWAYS AS (
      CASE
        WHEN deal_mrr IS NULL AND deal_setup_fee IS NULL THEN NULL
        ELSE COALESCE(deal_mrr * 12, 0) + COALESCE(deal_setup_fee, 0)
      END
    ) STORED;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_deal_mrr_nonneg') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_deal_mrr_nonneg CHECK (deal_mrr IS NULL OR deal_mrr >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_deal_setup_nonneg') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_deal_setup_nonneg CHECK (deal_setup_fee IS NULL OR deal_setup_fee >= 0);
  END IF;
END $$;
