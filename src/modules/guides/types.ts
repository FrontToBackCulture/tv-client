export interface Guide {
  id: string;
  slug: string;
  title: string;
  description: string;
  content: string | null;
  category: string;
  author: string;
  cover_image: string | null;
  tags: string[];
  order: number;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
  updated_at: string;
}
