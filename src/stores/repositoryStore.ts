// src/stores/repositoryStore.ts
// Global store for managing multiple knowledge repositories

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Repository {
  id: string;
  name: string;
  path: string;
  addedAt: number;
}

interface RepositoryState {
  repositories: Repository[];
  activeRepositoryId: string | null;

  // Actions
  addRepository: (name: string, path: string) => void;
  removeRepository: (id: string) => void;
  setActiveRepository: (id: string) => void;
  getActiveRepository: () => Repository | null;
}

// Generate a simple ID
function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export const useRepositoryStore = create<RepositoryState>()(
  persist(
    (set, get) => ({
      repositories: [
        // Default repository
        {
          id: "default",
          name: "tv-knowledge",
          path: "/Users/melvinwang/Thinkval Dropbox/ThinkVAL team folder/SkyNet/tv-knowledge",
          addedAt: Date.now(),
        },
      ],
      activeRepositoryId: "default",

      addRepository: (name: string, path: string) => {
        const id = generateId();
        set((state) => ({
          repositories: [
            ...state.repositories,
            { id, name, path, addedAt: Date.now() },
          ],
          activeRepositoryId: id, // Switch to the new repo
        }));
      },

      removeRepository: (id: string) => {
        set((state) => {
          const newRepos = state.repositories.filter((r) => r.id !== id);
          // If we're removing the active repo, switch to the first available
          const newActiveId =
            state.activeRepositoryId === id
              ? newRepos[0]?.id || null
              : state.activeRepositoryId;
          return {
            repositories: newRepos,
            activeRepositoryId: newActiveId,
          };
        });
      },

      setActiveRepository: (id: string) => {
        set({ activeRepositoryId: id });
      },

      getActiveRepository: () => {
        const state = get();
        return (
          state.repositories.find((r) => r.id === state.activeRepositoryId) ||
          null
        );
      },
    }),
    {
      name: "tv-client-repositories",
    }
  )
);

// Hook for convenience
export function useRepository() {
  const store = useRepositoryStore();
  const activeRepo = store.repositories.find(
    (r) => r.id === store.activeRepositoryId
  );

  return {
    repositories: store.repositories,
    activeRepository: activeRepo || null,
    addRepository: store.addRepository,
    removeRepository: store.removeRepository,
    setActiveRepository: store.setActiveRepository,
  };
}
