-- Add visual type to feed_cards for inline chart illustrations
ALTER TABLE feed_cards ADD COLUMN IF NOT EXISTS visual text;
