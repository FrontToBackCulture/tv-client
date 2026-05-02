// src/lib/documentation/types.ts

export interface DocsSection {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
}

export interface DocsPage {
  id: string;
  section_id: string;
  slug: string;
  title: string;
  summary: string | null;
  body_md: string;
  tags: string[];
  sort_order: number;
  updated_at: string;
}
