-- Merge email_contacts into crm_contacts
-- Single contact list for both CRM and email campaigns
--
-- Changes:
-- 1. crm_contacts.company_id becomes nullable (contacts without a company)
-- 2. crm_contacts gains edm_status column (active/unsubscribed/bounced)
-- 3. email_contacts data migrated into crm_contacts
-- 4. email_contact_groups FK repointed to crm_contacts
-- 5. email_events unified: contact_id + crm_contact_id → single contact_id → crm_contacts
-- 6. email_contacts table dropped

BEGIN;

-- ============================================================
-- Step 1: Alter crm_contacts schema
-- ============================================================

-- Make company_id nullable (EDM-only contacts won't have a company)
ALTER TABLE crm_contacts ALTER COLUMN company_id DROP NOT NULL;

-- Add EDM deliverability status (separate from email_status which is Apollo verification)
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS edm_status TEXT NOT NULL DEFAULT 'active'
  CHECK (edm_status IN ('active', 'unsubscribed', 'bounced'));

-- ============================================================
-- Step 2: Deduplicate crm_contacts by email before adding unique index
-- ============================================================

-- Keep the most recently updated contact for each email, delete older dupes
DELETE FROM crm_contacts a
USING crm_contacts b
WHERE a.email = b.email
  AND a.email IS NOT NULL
  AND a.id <> b.id
  AND (a.updated_at < b.updated_at OR (a.updated_at = b.updated_at AND a.id < b.id));

-- Add unique constraint on email (needed for upsert/dedup)
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts_email_unique ON crm_contacts(email);

-- ============================================================
-- Step 3: Migrate email_contacts data into crm_contacts
-- ============================================================

-- Create temp mapping table: old email_contacts.id → new crm_contacts.id
CREATE TEMP TABLE _email_contact_mapping (
  old_id UUID NOT NULL,
  new_id UUID NOT NULL
);

-- First, map existing matches (email already in crm_contacts)
INSERT INTO _email_contact_mapping (old_id, new_id)
SELECT ec.id, cc.id
FROM email_contacts ec
JOIN crm_contacts cc ON LOWER(cc.email) = LOWER(ec.email);

-- Update edm_status on matched crm_contacts from email_contacts
UPDATE crm_contacts cc
SET edm_status = ec.status
FROM email_contacts ec
JOIN _email_contact_mapping m ON m.old_id = ec.id
WHERE cc.id = m.new_id;

-- Insert unmatched email_contacts as new crm_contacts
INSERT INTO crm_contacts (id, email, name, company_id, edm_status, source, is_active, is_primary, created_at, updated_at)
SELECT
  gen_random_uuid(),
  LOWER(ec.email),
  COALESCE(NULLIF(TRIM(CONCAT(ec.first_name, ' ', ec.last_name)), ''), ec.email),
  NULL,  -- no company
  ec.status,
  ec.source,
  true,
  false,
  ec.created_at,
  ec.updated_at
FROM email_contacts ec
WHERE NOT EXISTS (
  SELECT 1 FROM _email_contact_mapping m WHERE m.old_id = ec.id
);

-- Map the newly inserted contacts
INSERT INTO _email_contact_mapping (old_id, new_id)
SELECT ec.id, cc.id
FROM email_contacts ec
JOIN crm_contacts cc ON LOWER(cc.email) = LOWER(ec.email)
WHERE NOT EXISTS (
  SELECT 1 FROM _email_contact_mapping m WHERE m.old_id = ec.id
);

-- ============================================================
-- Step 4: Repoint email_contact_groups FK to crm_contacts
-- ============================================================

-- Update contact_id values using the mapping
UPDATE email_contact_groups ecg
SET contact_id = m.new_id
FROM _email_contact_mapping m
WHERE ecg.contact_id = m.old_id;

-- Remove duplicate (contact_id, group_id) pairs that may arise from merge
DELETE FROM email_contact_groups a
USING email_contact_groups b
WHERE a.contact_id = b.contact_id
  AND a.group_id = b.group_id
  AND a.added_at < b.added_at;

-- Drop old FK and add new one
ALTER TABLE email_contact_groups DROP CONSTRAINT IF EXISTS email_contact_groups_contact_id_fkey;
ALTER TABLE email_contact_groups
  ADD CONSTRAINT email_contact_groups_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE CASCADE;

-- ============================================================
-- Step 5: Unify email_events contact columns
-- ============================================================

-- Copy contact_id → crm_contact_id for campaign events (using mapping)
UPDATE email_events ee
SET crm_contact_id = m.new_id
FROM _email_contact_mapping m
WHERE ee.contact_id = m.old_id
  AND ee.crm_contact_id IS NULL;

-- Drop old contact_id FK (points to email_contacts)
ALTER TABLE email_events DROP CONSTRAINT IF EXISTS email_events_contact_id_fkey;

-- Drop old contact_id column
ALTER TABLE email_events DROP COLUMN IF EXISTS contact_id;

-- Rename crm_contact_id → contact_id
ALTER TABLE email_events RENAME COLUMN crm_contact_id TO contact_id;

-- Add FK constraint on the renamed column
ALTER TABLE email_events
  ADD CONSTRAINT email_events_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE SET NULL;

-- Recreate index for the renamed column
DROP INDEX IF EXISTS idx_email_events_contact;
CREATE INDEX IF NOT EXISTS idx_email_events_contact ON email_events(contact_id);

-- ============================================================
-- Step 6: Drop email_contacts table
-- ============================================================

DROP TRIGGER IF EXISTS email_contacts_updated_at ON email_contacts;
DROP POLICY IF EXISTS "email_contacts_all" ON email_contacts;
DROP INDEX IF EXISTS idx_email_contacts_status;
DROP TABLE IF EXISTS email_contacts;

-- ============================================================
-- Step 7: Add edm_status index on crm_contacts
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_crm_contacts_edm_status ON crm_contacts(edm_status);

-- Clean up temp table
DROP TABLE IF EXISTS _email_contact_mapping;

COMMIT;
