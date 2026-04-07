// Query skills from Supabase `skills` table and score relevance against a chat thread.
// Used by the skill chips row below the ChatComposer to suggest which skills
// the user might want to invoke for the current conversation.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";

export interface RelevantSkill {
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  owner: string | null;
  score: number;
}

interface ScoreContext {
  entityType: string;
  entityId: string;
  recentMessages: string[];
  bot?: string;
}

/** Tokenise a string into lowercase words for keyword matching. */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

/** Score a skill's relevance against the thread context. Higher = more relevant. */
function scoreSkill(
  skill: { slug: string; name: string; description: string | null; category: string | null; subcategory: string | null },
  ctx: ScoreContext,
): number {
  const corpus = [
    skill.slug,
    skill.name,
    skill.description ?? "",
    skill.category ?? "",
    skill.subcategory ?? "",
  ].join(" ").toLowerCase();

  let score = 0;

  // Entity type direct match
  if (ctx.entityType && corpus.includes(ctx.entityType.toLowerCase())) {
    score += 10;
  }

  // Subcategory match against entity_type (e.g. "task" subcategory → task threads)
  if (skill.subcategory && ctx.entityType.toLowerCase() === skill.subcategory.toLowerCase()) {
    score += 15;
  }

  // Keyword overlap with recent messages
  const messageTokens = tokenize(ctx.recentMessages.join(" "));
  const corpusTokens = tokenize(corpus);
  let overlap = 0;
  for (const t of messageTokens) {
    if (corpusTokens.has(t)) overlap++;
  }
  score += overlap * 2;

  return score;
}

/**
 * If the thread belongs to a DIO automation (entity_id like "dio:{dio_id}:daily"),
 * look up the automation's configured suggested_skills.
 */
async function getAutomationSuggestedSkills(entityId: string): Promise<string[] | null> {
  const match = entityId.match(/^dio:([^:]+):/);
  if (!match) return null;
  const dioId = match[1];
  const { data } = await supabase
    .from("automations")
    .select("suggested_skills")
    .eq("dio_id", dioId)
    .maybeSingle();
  const skills = data?.suggested_skills as string[] | undefined;
  return skills && skills.length > 0 ? skills : null;
}

export function useRelevantSkills(
  entityType: string,
  entityId: string,
  recentMessages: string[],
  bot: string = "bot-mel",
  limit: number = 6,
) {
  return useQuery({
    queryKey: ["relevant-skills", entityType, entityId, bot, recentMessages.length],
    queryFn: async (): Promise<RelevantSkill[]> => {
      // First: check if this thread belongs to an automation with curated skills
      const curatedSlugs = await getAutomationSuggestedSkills(entityId);

      if (curatedSlugs) {
        const { data, error } = await supabase
          .from("skills")
          .select("slug, name, description, category, subcategory, owner, status")
          .in("slug", curatedSlugs)
          .eq("status", "active");
        if (error) throw error;
        // Preserve the curated order
        const bySlug = new Map((data ?? []).map((s) => [s.slug, s]));
        return curatedSlugs
          .map((slug) => bySlug.get(slug))
          .filter((s): s is NonNullable<typeof s> => !!s)
          .map((s) => ({
            slug: s.slug,
            name: s.name,
            description: s.description,
            category: s.category,
            subcategory: s.subcategory,
            owner: s.owner,
            score: 100, // curated: not scored
          }));
      }

      // Fallback: keyword scoring
      const { data, error } = await supabase
        .from("skills")
        .select("slug, name, description, category, subcategory, owner, status")
        .eq("status", "active")
        .or(`owner.eq.${bot},owner.is.null`)
        .limit(200);

      if (error) throw error;

      const scored = (data ?? [])
        .map((s) => ({
          slug: s.slug,
          name: s.name,
          description: s.description,
          category: s.category,
          subcategory: s.subcategory,
          owner: s.owner,
          score: scoreSkill(s, { entityType, entityId, recentMessages, bot }),
        }))
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return scored;
    },
    staleTime: 30_000,
  });
}
