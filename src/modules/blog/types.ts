export interface BlogArticle {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  content: string | null;
  category: string | null;
  author: string | null;
  read_time: string | null;
  color: string | null;
  illustration: string | null;
  featured: boolean;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
  updated_at: string;
}
