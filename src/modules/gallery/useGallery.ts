// src/modules/gallery/useGallery.ts

import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export interface GalleryItem {
  file_name: string;
  file_path: string;
  relative_path: string;
  folder: string;
  extension: string;
  size_bytes: number;
  modified: string;
  gallery_type: "image" | "excalidraw" | "video";
}

export interface SkillExample {
  slug: string;
  skill_name: string;
  file_name: string;
  file_path: string;
  modified: string;
  demo_type: "report" | "deck";
}

export type GalleryTab = "reports" | "decks" | "questions" | "images" | "excalidraw" | "videos";

export function useGalleryScan() {
  return useQuery({
    queryKey: ["gallery-scan"],
    queryFn: async () => {
      return invoke<GalleryItem[]>("gallery_scan");
    },
    staleTime: 60_000,
  });
}

export function useSkillDemos() {
  return useQuery({
    queryKey: ["skill-examples"],
    queryFn: async () => {
      return invoke<SkillExample[]>("skill_list_examples");
    },
    staleTime: 60_000,
  });
}
