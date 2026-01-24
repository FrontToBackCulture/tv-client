import { createClient } from '@supabase/supabase-js';

// Supabase configuration
// These will be set via environment variables in production
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Create Supabase client
// Used by React components for Work, CRM, and Inbox data
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Type exports will be added in Phase 4 (Supabase integration)
