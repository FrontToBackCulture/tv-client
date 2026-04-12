-- Cockpit tables — Melvin's daily operating surface on the Home module.
-- Replaces the feed-card briefing with an accountability cockpit:
--   * daily_focus           — "today's one thing", sales-hours counter, interrupt count
--   * client_delivery_state — where every client sits in the 6-stage delivery pipeline
--   * escalations           — interrupts logged against the sales block, triaged later

-- ============================================================================
-- daily_focus — one row per day
-- ============================================================================
CREATE TABLE IF NOT EXISTS daily_focus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  focus_date DATE NOT NULL UNIQUE,
  one_thing TEXT,
  sales_hours_target NUMERIC(4,2) NOT NULL DEFAULT 4.0,
  sales_hours_actual NUMERIC(6,3) NOT NULL DEFAULT 0,
  sales_session_start TIMESTAMPTZ,
  interrupts_count INTEGER NOT NULL DEFAULT 0,
  outbound_target INTEGER NOT NULL DEFAULT 5,
  outbound_sent INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_focus_date ON daily_focus(focus_date DESC);

ALTER TABLE daily_focus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_focus_all" ON daily_focus
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- client_delivery_state — one row per client, tracks stage in delivery pipeline
-- ============================================================================
CREATE TABLE IF NOT EXISTS client_delivery_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  client_name TEXT NOT NULL,
  domain_id TEXT,
  current_stage TEXT NOT NULL DEFAULT 'prospect'
    CHECK (current_stage IN ('prospect','kickoff','data-loading','mapping','go-live','steady-state','paused')),
  stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_milestone TEXT,
  next_milestone_due DATE,
  blocker_flag BOOLEAN NOT NULL DEFAULT false,
  blocker_note TEXT,
  last_activity_at TIMESTAMPTZ,
  owner TEXT,
  priority SMALLINT NOT NULL DEFAULT 2 CHECK (priority BETWEEN 0 AND 4),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_state_company ON client_delivery_state(company_id);
CREATE INDEX IF NOT EXISTS idx_delivery_state_stage ON client_delivery_state(current_stage);
CREATE INDEX IF NOT EXISTS idx_delivery_state_blocker ON client_delivery_state(blocker_flag) WHERE blocker_flag = true;

ALTER TABLE client_delivery_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_delivery_state_all" ON client_delivery_state
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- escalations — interrupts that pulled Melvin out of his sales block
-- ============================================================================
CREATE TABLE IF NOT EXISTS escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_name TEXT,
  company_id UUID,
  category TEXT NOT NULL
    CHECK (category IN ('troubleshooting','incident','onboarding','engagement','self-service','team-unblock','sales-fire','other')),
  time_spent_minutes INTEGER,
  was_me BOOLEAN NOT NULL DEFAULT true,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_escalations_occurred_at ON escalations(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_escalations_unresolved ON escalations(resolved) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_escalations_category ON escalations(category);

ALTER TABLE escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "escalations_all" ON escalations
  FOR ALL USING (true) WITH CHECK (true);
