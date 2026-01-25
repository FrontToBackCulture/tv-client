// src/lib/inbox/types.ts
// Inbox/Email types

export interface EmailAddress {
  name: string;
  email: string;
}

export interface EmailAttachment {
  name: string;
  size: number;
  path: string;
  contentType?: string;
}

export interface Email {
  id: string;
  messageId: string;
  conversationId?: string;
  subject: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  date: string;
  receivedAt: string;
  folder: string;
  isRead: boolean;
  hasAttachments: boolean;
  attachments?: EmailAttachment[];
  preview: string;
  bodyPath: string; // Path to markdown file with full body

  // Classification from AI
  classification?: {
    category: 'client' | 'deal' | 'lead' | 'internal' | 'vendor' | 'noise' | 'unknown';
    priority: 'high' | 'medium' | 'low';
    summary?: string;
    actionRequired?: boolean;
  };

  // Status
  status: 'inbox' | 'read' | 'archived';

  // CRM linking
  linkedCompanyId?: string;
  linkedCompanyName?: string;
}

export interface EmailFolder {
  id: string;
  name: string;
  displayName: string;
  unreadCount: number;
  totalCount: number;
}

export interface EmailIndex {
  lastUpdated: string;
  userEmail: string;
  emails: Email[];
  folders: EmailFolder[];
}

export type EmailCategory = NonNullable<Email['classification']>['category'];
export type EmailStatus = Email['status'];
export type EmailPriority = NonNullable<Email['classification']>['priority'];
