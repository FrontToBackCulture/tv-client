-- Notifications table — triggered by @mentions in discussions
-- Each mention creates a notification for the mentioned user

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient TEXT NOT NULL,           -- username of the person being notified (e.g., 'melvin')
  type TEXT NOT NULL DEFAULT 'mention',  -- 'mention' or 'reply'
  discussion_id UUID REFERENCES discussions(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,         -- same as discussions.entity_type
  entity_id TEXT NOT NULL,           -- same as discussions.entity_id
  actor TEXT NOT NULL,               -- who triggered the notification (e.g., 'darren')
  body_preview TEXT NOT NULL,        -- first ~100 chars of the comment
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary query: unread notifications for a user, newest first
CREATE INDEX idx_notifications_recipient ON notifications(recipient, read, created_at DESC);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
