// src/modules/questions/QuestionsModule.tsx
// Entry point for the Questions module — manages AI question library in Supabase

import { QuestionCatalogView } from "./QuestionCatalogView";

export function QuestionsModule() {
  return (
    <div className="h-full bg-white dark:bg-zinc-950">
      <QuestionCatalogView />
    </div>
  );
}
