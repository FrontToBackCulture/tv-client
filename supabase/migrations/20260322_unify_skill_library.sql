-- =============================================================================
-- Migration: Unify report_skill_library + question_library → skill_library
-- Date: 2026-03-22
-- =============================================================================
-- Two separate tables (report_skill_library for website report demos,
-- question_library for AI chat questions) are merged into a single
-- skill_library table with a `type` column to distinguish them.
--
-- This supports the unified "AI Skills" page on tv-website where reports,
-- diagnostics, and chat skills are displayed together with type filtering.
-- =============================================================================

-- =============================================================================
-- STEP 1: Add `type` column to report_skill_library
-- =============================================================================
-- Default to 'report' for all existing entries.

ALTER TABLE report_skill_library
ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'report';

-- =============================================================================
-- STEP 2: Migrate question_library → report_skill_library
-- =============================================================================
-- Map question fields to report_skill_library columns:
--   question      → title
--   description   → description
--   category      → category
--   subcategory   → subcategory
--   solution      → solution
--   video_url     → report_url (repurposed for demo/video URL)
--   published     → published
--   featured      → featured
--   sort_order    → sort_order
--   type          → 'chat'
--   skill_slug    → 'chat-' || solution (placeholder, no 1:1 skill mapping)
--   file_name     → 'question-' || id (unique per question)

INSERT INTO report_skill_library (
  id, skill_slug, file_name, title, description, category, subcategory,
  solution, report_url, published, featured, sort_order, type,
  created_at, updated_at
)
SELECT
  id,
  'chat-' || solution AS skill_slug,
  'question-' || id AS file_name,
  question AS title,
  description,
  category,
  COALESCE(subcategory, '') AS subcategory,
  solution,
  video_url AS report_url,
  published,
  featured,
  sort_order,
  'chat' AS type,
  created_at,
  updated_at
FROM question_library
ON CONFLICT (id) DO NOTHING;

-- Verify: count by type
-- SELECT type, count(*) FROM report_skill_library GROUP BY type;

-- =============================================================================
-- STEP 3: Rename report_skill_library → skill_library
-- =============================================================================

ALTER TABLE report_skill_library RENAME TO skill_library;

-- =============================================================================
-- STEP 4: Drop question_library
-- =============================================================================
-- All data has been migrated to skill_library with type='chat'.

DROP TABLE IF EXISTS question_library;

-- =============================================================================
-- VERIFICATION QUERIES (run manually after migration)
-- =============================================================================
-- SELECT type, count(*) FROM skill_library GROUP BY type;
-- SELECT * FROM skill_library WHERE type = 'chat' LIMIT 5;
-- SELECT count(*) FROM information_schema.tables WHERE table_name = 'question_library';
