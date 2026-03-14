-- Migration: Add team management columns to users table
-- Run this in Supabase SQL Editor

-- Add role column (admin or member, default member)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member'
  CHECK (role IN ('admin', 'member'));

-- Add visible_modules column (NULL = all modules visible / use defaults)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS visible_modules text[] DEFAULT NULL;

-- Ensure unique constraint on github_username for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_github_username_key'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_github_username_key UNIQUE (github_username);
  END IF;
END$$;

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_users_github_username ON users(github_username);

-- Set Melvin as admin
UPDATE users SET role = 'admin' WHERE github_username = 'melvinwang';
