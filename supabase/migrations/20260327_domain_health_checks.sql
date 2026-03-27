-- Domain Health Checks — stores per-domain, per-check-type results
-- Runner upserts after scanning each domain via execute-val-sql

CREATE TABLE IF NOT EXISTS domain_health_checks (
  domain       TEXT NOT NULL,
  check_type   TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('pass', 'warn', 'fail', 'error')),
  details      JSONB NOT NULL DEFAULT '{}',
  checked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (domain, check_type)
);

CREATE INDEX IF NOT EXISTS idx_dhc_checked_at ON domain_health_checks (checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_dhc_status ON domain_health_checks (status);

ALTER TABLE domain_health_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dhc_all" ON domain_health_checks
  FOR ALL USING (true) WITH CHECK (true);
