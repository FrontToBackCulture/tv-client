// src/hooks/useSettings.ts
// Hook for managing app settings and API keys via secure OS keychain

import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

// Key names (must match Rust constants)
export const API_KEYS = {
  GAMMA: "gamma_api_key",
  GEMINI: "gemini_api_key",
  GITHUB_CLIENT_ID: "github_client_id",
  GITHUB_CLIENT_SECRET: "github_client_secret",
  SUPABASE_URL: "supabase_url",
  SUPABASE_ANON_KEY: "supabase_anon_key",
  INTERCOM: "intercom_api_key",
  GA4_SERVICE_ACCOUNT_PATH: "ga4_service_account_path",
  GA4_PROPERTY_ID: "ga4_property_id",
} as const;

export type ApiKeyName = (typeof API_KEYS)[keyof typeof API_KEYS];

export interface ApiKeyInfo {
  name: string;
  description: string;
  is_set: boolean;
  masked_value: string | null;
}

export interface SettingsStatus {
  gamma_api_key: boolean;
  gemini_api_key: boolean;
  github_client_id: boolean;
  github_client_secret: boolean;
  supabase_url: boolean;
  supabase_anon_key: boolean;
}

/**
 * Hook for managing API keys in secure storage
 */
export function useSettings() {
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load status on mount
  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [statusResult, keysResult] = await Promise.all([
        invoke<SettingsStatus>("settings_get_status"),
        invoke<ApiKeyInfo[]>("settings_list_keys"),
      ]);

      setStatus(statusResult);
      setKeys(keysResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Set a key
  const setKey = useCallback(
    async (keyName: ApiKeyName, value: string) => {
      try {
        await invoke("settings_set_key", { keyName, value });
        await refresh();
      } catch (e) {
        throw new Error(e instanceof Error ? e.message : String(e));
      }
    },
    [refresh]
  );

  // Delete a key
  const deleteKey = useCallback(
    async (keyName: ApiKeyName) => {
      try {
        await invoke("settings_delete_key", { keyName });
        await refresh();
      } catch (e) {
        throw new Error(e instanceof Error ? e.message : String(e));
      }
    },
    [refresh]
  );

  // Check if a key exists
  const hasKey = useCallback(async (keyName: ApiKeyName): Promise<boolean> => {
    try {
      return await invoke<boolean>("settings_has_key", { keyName });
    } catch {
      return false;
    }
  }, []);

  // Get a key value (use sparingly - prefer masked values for display)
  const getKey = useCallback(
    async (keyName: ApiKeyName): Promise<string | null> => {
      try {
        return await invoke<string | null>("settings_get_key", { keyName });
      } catch {
        return null;
      }
    },
    []
  );

  return {
    status,
    keys,
    loading,
    error,
    refresh,
    setKey,
    deleteKey,
    hasKey,
    getKey,
  };
}

/**
 * Hook for getting Gamma API key
 */
export function useGammaKey() {
  const [key, setKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<string | null>("settings_get_gamma_key")
      .then(setKey)
      .catch(() => setKey(null))
      .finally(() => setLoading(false));
  }, []);

  return { key, loading, hasKey: key !== null };
}

/**
 * Hook for getting Gemini API key
 */
export function useGeminiKey() {
  const [key, setKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<string | null>("settings_get_gemini_key")
      .then(setKey)
      .catch(() => setKey(null))
      .finally(() => setLoading(false));
  }, []);

  return { key, loading, hasKey: key !== null };
}

/**
 * Hook for getting Supabase credentials
 */
export function useSupabaseCredentials() {
  const [url, setUrl] = useState<string | null>(null);
  const [anonKey, setAnonKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<[string | null, string | null]>("settings_get_supabase_credentials")
      .then(([u, k]) => {
        setUrl(u);
        setAnonKey(k);
      })
      .catch(() => {
        setUrl(null);
        setAnonKey(null);
      })
      .finally(() => setLoading(false));
  }, []);

  return { url, anonKey, loading, isConfigured: url !== null && anonKey !== null };
}
