-- =============================================================================
-- Migration: Add skill_type column to skills table
-- Date: 2026-03-22
-- =============================================================================
-- Adds a `skill_type` column so each skill declares whether it's a report,
-- diagnostic, or chat skill. This maps directly to skill_library.type
-- when publishing to the website.
-- =============================================================================

ALTER TABLE skills
ADD COLUMN IF NOT EXISTS skill_type text NOT NULL DEFAULT 'report';

-- Set known types based on naming conventions
UPDATE skills SET skill_type = 'chat' WHERE slug LIKE 'analyzing-%';
UPDATE skills SET skill_type = 'diagnostic' WHERE slug LIKE 'diagnosing-%' OR slug LIKE 'recon-%';
UPDATE skills SET skill_type = 'report' WHERE slug LIKE 'generating-%';

-- Verify
-- SELECT skill_type, count(*) FROM skills GROUP BY skill_type;
