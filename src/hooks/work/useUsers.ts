// Work Users hook

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { User } from "../../lib/work/types";
import { workKeys } from "./keys";
import { useAuth } from "../../stores/authStore";

export function useUsers(type?: "human" | "bot") {
  return useQuery({
    queryKey: [...workKeys.users(), type],
    queryFn: async (): Promise<User[]> => {
      let query = supabase.from("users").select("*").order("name");

      if (type) {
        query = query.eq("type", type);
      }

      const { data, error } = await query;

      if (error) throw new Error(`Failed to fetch users: ${error.message}`);
      return data ?? [];
    },
  });
}

export function useCurrentUserId(): string | null {
  const appUser = useAuth((s) => s.user);
  const { data: users = [] } = useUsers();
  if (!appUser) return null;
  const login = appUser.login;
  const email = appUser.email;
  const name = appUser.name;
  const match =
    users.find(u => u.github_username === login) ||
    users.find(u => u.microsoft_email === login) ||
    users.find(u => u.microsoft_email === email) ||
    users.find(u => u.email === email && email) ||
    users.find(u => u.name === name);
  if (!match && users.length > 0) {
    console.warn("[useCurrentUserId] No match found.", { login, email, name, usersCount: users.length, sampleUser: users[0] ? { gh: users[0].github_username, ms: users[0].microsoft_email, email: users[0].email, name: users[0].name } : null });
  }
  return match?.id ?? null;
}
