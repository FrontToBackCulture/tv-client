// src/stores/favoritesStore.ts
// Global store for favorites using Zustand with localStorage persistence

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Favorite {
  path: string;
  name: string;
  isDirectory: boolean;
  addedAt: number;
}

interface FavoritesState {
  items: Favorite[];

  // Actions
  addFavorite: (path: string, name: string, isDirectory?: boolean) => void;
  removeFavorite: (path: string) => void;
  toggleFavorite: (path: string, name: string, isDirectory?: boolean) => void;
  isFavorite: (path: string) => boolean;
  clearFavorites: () => void;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      items: [],

      addFavorite: (path: string, name: string, isDirectory: boolean = false) => {
        set((state) => {
          // Don't add if already exists
          if (state.items.some((f) => f.path === path)) {
            return state;
          }

          const newItems: Favorite[] = [
            ...state.items,
            { path, name, isDirectory, addedAt: Date.now() },
          ];

          // Sort: directories first, then alphabetically
          newItems.sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) {
              return a.isDirectory ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          });

          return { items: newItems };
        });
      },

      removeFavorite: (path: string) => {
        set((state) => ({
          items: state.items.filter((f) => f.path !== path),
        }));
      },

      toggleFavorite: (path: string, name: string, isDirectory: boolean = false) => {
        const { isFavorite, addFavorite, removeFavorite } = get();
        if (isFavorite(path)) {
          removeFavorite(path);
        } else {
          addFavorite(path, name, isDirectory);
        }
      },

      isFavorite: (path: string) => {
        return get().items.some((f) => f.path === path);
      },

      clearFavorites: () => {
        set({ items: [] });
      },
    }),
    {
      name: "tv-client-favorites",
    }
  )
);

// Hook wrapper for backward compatibility
export function useFavorites() {
  const store = useFavoritesStore();
  return {
    favorites: store.items,
    isFavorite: store.isFavorite,
    addFavorite: store.addFavorite,
    removeFavorite: store.removeFavorite,
    toggleFavorite: store.toggleFavorite,
    clearFavorites: store.clearFavorites,
  };
}
