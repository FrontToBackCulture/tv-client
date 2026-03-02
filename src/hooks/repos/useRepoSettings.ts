import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface TrackedRepo {
  owner: string;
  repo: string;
}

interface RepoSettingsState {
  repos: TrackedRepo[];
  addRepo: (owner: string, repo: string) => void;
  removeRepo: (owner: string, repo: string) => void;
}

const DEFAULT_REPOS: TrackedRepo[] = [
  { owner: "FrontToBackCulture", repo: "tv-client" },
  { owner: "FrontToBackCulture", repo: "tv-api" },
  { owner: "FrontToBackCulture", repo: "tv-portal" },
  { owner: "FrontToBackCulture", repo: "tv-support" },
  { owner: "FrontToBackCulture", repo: "tv-website" },
];

export const useRepoSettings = create<RepoSettingsState>()(
  persist(
    (set, get) => ({
      repos: DEFAULT_REPOS,

      addRepo: (owner, repo) => {
        const { repos } = get();
        if (repos.some((r) => r.owner === owner && r.repo === repo)) return;
        set({ repos: [...repos, { owner, repo }] });
      },

      removeRepo: (owner, repo) => {
        set({
          repos: get().repos.filter(
            (r) => !(r.owner === owner && r.repo === repo)
          ),
        });
      },
    }),
    { name: "tv-client-repo-settings" }
  )
);
