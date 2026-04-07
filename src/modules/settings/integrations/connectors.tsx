// src/modules/settings/integrations/connectors.tsx
//
// The full connector registry for the Integrations hub.
//
// A connector is the normalized description of something the app talks to.
// It carries:
//   - an identity (id, name, description, category, icon)
//   - a `useStatus` hook that reads the provider's store/hook and returns a
//     uniform {state, label} the card uses for its status pill
//   - a `DetailView` component that renders when the card is opened
//
// Adding a new integration means appending one entry here — no other file
// touched.

import { useEffect, useState, type ComponentType } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Globe,
  Server,
} from "lucide-react";

// Brand marks fetched from each vendor's official site. Apollo is an SVG;
// Gamma/Outlook/AWS are PNGs pulled from their favicon services. Using each
// vendor's own mark is standard nominative use for an integrations hub.
import apolloMark from "./icons/apollo.svg";
import gammaMark from "./icons/gamma.jpg";
import outlookMark from "./icons/outlook.png";
import awsMark from "./icons/aws.png";

/** Turn a raster/svg asset URL into a component that matches ConnectorIcon. */
function makeImageIcon(src: string, alt: string): ConnectorIcon {
  return function ImageIcon({ size = 22, className }) {
    return (
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        className={className}
        style={{ objectFit: "contain" }}
      />
    );
  };
}
import {
  SiNotion,
  SiNotionHex,
  SiGoogleanalytics,
  SiGoogleanalyticsHex,
  SiGooglegemini,
  SiGooglegeminiHex,
  SiAnthropic,
  SiAnthropicHex,
  SiSupabase,
  SiSupabaseHex,
  SiGithub,
  SiGithubHex,
  SiIntercom,
} from "@icons-pack/react-simple-icons";

import { useOutlookAuth } from "../../../hooks/useOutlook";
import { useGA4Auth } from "../../../hooks/useGA4";
import { useNotionSyncConfigs } from "../../../hooks/useNotion";
import { useDiscoverDomains } from "../../../hooks/val-sync";
import { useKnowledgePaths } from "../../../hooks/useKnowledgePaths";
import { useSettings, API_KEYS, type ApiKeyName } from "../../../hooks/useSettings";

import { OutlookConnectionView } from "../OutlookConnectionView";
import { GA4ConnectionView } from "../GA4ConnectionView";
import { NotionSyncConfigs } from "../../notion/NotionSyncConfigs";
import { McpEndpointsView } from "../McpEndpointsView";
import { ClaudeCodeSetupView } from "../ClaudeCodeSetupView";
import { ApiKeyDetail } from "./KeyEditor";
import { AwsDetail } from "./AwsDetail";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectorId =
  | "outlook"
  | "ga4"
  | "notion"
  | "mcp"
  | "claude"
  | "gamma"
  | "gemini"
  | "intercom"
  | "apollo"
  | "aws"
  | "supabase"
  | "github"
  | "tv-api";

export type ConnectorCategory =
  | "Communication"
  | "Sales & CRM"
  | "Content"
  | "Analytics"
  | "AI Tools"
  | "Storage"
  | "Platform"
  | "Internal Services"
  | "Infrastructure";

type ConnectorState = "connected" | "disconnected" | "error" | "loading";

export interface ConnectorStatus {
  state: ConnectorState;
  /** Secondary line — account email, key count, "Not installed", etc. */
  label?: string;
}

/** Icon components accept both Lucide and react-simple-icons shapes.
 *  Lucide's `size` is `string | number`; simple-icons is `number`. Accept both. */
export type ConnectorIcon = ComponentType<{
  size?: string | number;
  className?: string;
  color?: string;
}>;

export interface Connector {
  id: ConnectorId;
  name: string;
  description: string;
  category: ConnectorCategory;
  icon: ConnectorIcon;
  /** Optional brand color — passed as the `color` prop on the icon component. */
  iconColor?: string;
  useStatus: () => ConnectorStatus;
  DetailView: ComponentType;
}

// ---------------------------------------------------------------------------
// Generic status hook for key-based connectors — returns connected iff all
// required keys are set. Reading `useSettings` here means each hook triggers
// one `settings_list_keys` invoke on mount; that's acceptable for the hub
// since it's already loading other status hooks in parallel.
// ---------------------------------------------------------------------------

function useApiKeyStatus(required: ApiKeyName[]): ConnectorStatus {
  const { keys, loading } = useSettings();
  if (loading) return { state: "loading" };
  const present = required.filter((name) => keys.find((k) => k.name === name)?.is_set);
  // Don't set `label` on success — the card falls back to connector.description,
  // which is friendlier than internal jargon like "Key set".
  if (present.length === required.length) return { state: "connected" };
  if (present.length === 0) return { state: "disconnected" };
  return {
    state: "error",
    label: `Missing ${required.length - present.length} of ${required.length} credentials`,
  };
}

// ---------------------------------------------------------------------------
// OAuth / custom status hooks
// ---------------------------------------------------------------------------

function useOutlookStatus(): ConnectorStatus {
  const { data, isLoading } = useOutlookAuth();
  if (isLoading) return { state: "loading" };
  if (data?.isAuthenticated) {
    return { state: "connected", label: data.userEmail ?? "Connected" };
  }
  return { state: "disconnected", label: "Not connected" };
}

function useGA4Status(): ConnectorStatus {
  const { data, isLoading } = useGA4Auth();
  if (isLoading) return { state: "loading" };
  if (data?.isAuthenticated) {
    return { state: "connected", label: data.userEmail ?? "Connected" };
  }
  return { state: "disconnected", label: "Not connected" };
}

function useNotionStatus(): ConnectorStatus {
  const { keys, loading: keysLoading } = useSettings();
  const { data: configs, isLoading: configsLoading } = useNotionSyncConfigs();
  if (keysLoading || configsLoading) return { state: "loading" };
  const hasKey = keys.find((k) => k.name === API_KEYS.NOTION)?.is_set ?? false;
  const count = configs?.length ?? 0;
  if (!hasKey) return { state: "disconnected", label: "No API key set" };
  if (count === 0) return { state: "error", label: "Key set but no databases configured" };
  return { state: "connected", label: `${count} database${count === 1 ? "" : "s"} synced` };
}

function useMcpStatus(): ConnectorStatus {
  const paths = useKnowledgePaths();
  const domainsPath = paths ? `${paths.platform}/domains` : null;
  const { data: domains, isLoading } = useDiscoverDomains(domainsPath);
  const [configured, setConfigured] = useState<number | null>(null);

  useEffect(() => {
    if (!domains || domains.length === 0) {
      setConfigured(0);
      return;
    }
    let cancelled = false;
    Promise.all(
      domains.map((d) =>
        invoke<string | null>("settings_get_key", { keyName: `mcp_url_${d.domain}` })
          .then((v) => (v && v.trim() ? 1 : 0))
          .catch(() => 0),
      ),
    ).then((vals) => {
      if (cancelled) return;
      setConfigured(vals.reduce((a, b) => a + b, 0));
    });
    return () => {
      cancelled = true;
    };
  }, [domains]);

  if (isLoading || configured === null) return { state: "loading" };
  const total = domains?.length ?? 0;
  if (total === 0) return { state: "disconnected", label: "No domains discovered" };
  if (configured === 0) return { state: "disconnected", label: `0 of ${total} endpoints configured` };
  return {
    state: "connected",
    label: `${configured} of ${total} endpoint${total === 1 ? "" : "s"} configured`,
  };
}

interface ClaudeMcpStatus {
  binary_installed: boolean;
  config_has_tv_mcp: boolean;
}

function useClaudeStatus(): ConnectorStatus {
  const [status, setStatus] = useState<ClaudeMcpStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    invoke<ClaudeMcpStatus>("claude_mcp_status")
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return { state: "loading" };
  if (!status || !status.binary_installed) return { state: "disconnected", label: "Not installed" };
  if (!status.config_has_tv_mcp) return { state: "error", label: "tv-mcp not registered" };
  return { state: "connected" };
}

// ---------------------------------------------------------------------------
// Key-based status bindings
// ---------------------------------------------------------------------------

const useGammaStatus = () => useApiKeyStatus([API_KEYS.GAMMA]);
const useGeminiStatus = () => useApiKeyStatus([API_KEYS.GEMINI]);
const useIntercomStatus = () => useApiKeyStatus([API_KEYS.INTERCOM]);
const useApolloStatus = () => useApiKeyStatus([API_KEYS.APOLLO]);
const useAwsStatus = () =>
  useApiKeyStatus([API_KEYS.AWS_ACCESS_KEY_ID, API_KEYS.AWS_SECRET_ACCESS_KEY]);
const useSupabaseStatus = () =>
  useApiKeyStatus([API_KEYS.SUPABASE_URL, API_KEYS.SUPABASE_ANON_KEY]);
const useGithubStatus = () =>
  useApiKeyStatus([API_KEYS.GITHUB_CLIENT_ID, API_KEYS.GITHUB_CLIENT_SECRET]);
const useTvApiStatus = () => useApiKeyStatus([API_KEYS.EMAIL_API_BASE_URL]);

// ---------------------------------------------------------------------------
// Composite detail views — for connectors that need both an existing
// per-provider UI and an API-key editor alongside it.
// ---------------------------------------------------------------------------

function NotionDetail() {
  return (
    <div className="space-y-8">
      <ApiKeyDetail
        title="Notion"
        description="API key used to read and write Notion databases."
        keyNames={[API_KEYS.NOTION]}
      />
      <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 uppercase tracking-wide">
          Sync Databases
        </h3>
        <NotionSyncConfigs />
      </div>
    </div>
  );
}

function GA4Detail() {
  return (
    <div className="space-y-8">
      <GA4ConnectionView />
      <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
        <ApiKeyDetail
          title="Service Account (alternative)"
          description="Server-side access via a service account — used by background jobs that can't run OAuth."
          keyNames={[API_KEYS.GA4_SERVICE_ACCOUNT_PATH, API_KEYS.GA4_PROPERTY_ID]}
        />
      </div>
    </div>
  );
}

// Wrapper component factories so each key-based connector gets a distinct
// detail view without repeating boilerplate.
const makeApiKeyDetail = (title: string, description: string, keyNames: ApiKeyName[]) =>
  function Detail() {
    return <ApiKeyDetail title={title} description={description} keyNames={keyNames} />;
  };

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const CONNECTORS: Connector[] = [
  // --- Communication -------------------------------------------------------
  {
    id: "outlook",
    name: "Microsoft 365",
    description: "Inbox and calendar via Microsoft 365 (Outlook, Exchange)",
    category: "Communication",
    icon: makeImageIcon(outlookMark, "Microsoft 365"),
    useStatus: useOutlookStatus,
    DetailView: OutlookConnectionView,
  },
  // tv-api lives in its own "Internal Services" section below — moved out of
  // Communication because it's not a user-facing email account, it's the
  // internal tv-api deployment URL used for email tracking webhooks and
  // Apollo callbacks.

  // --- Sales & CRM ---------------------------------------------------------
  {
    id: "apollo",
    name: "Apollo",
    description: "Prospect data and contact enrichment",
    category: "Sales & CRM",
    icon: makeImageIcon(apolloMark, "Apollo"),
    useStatus: useApolloStatus,
    DetailView: makeApiKeyDetail(
      "Apollo",
      "API key for prospect search and contact enrichment.",
      [API_KEYS.APOLLO],
    ),
  },
  {
    id: "intercom",
    name: "Intercom",
    description: "Customer support conversations and collections",
    category: "Sales & CRM",
    icon: SiIntercom,
    // Intercom's brand cyan is too loud on a white tile; render in neutral
    // stroke instead. The mark is still recognisable.
    useStatus: useIntercomStatus,
    DetailView: makeApiKeyDetail(
      "Intercom",
      "API key for reading Intercom conversations and publishing Help Center articles.",
      [API_KEYS.INTERCOM],
    ),
  },

  // --- Content -------------------------------------------------------------
  {
    id: "notion",
    name: "Notion",
    description: "Mirror Notion databases into the knowledge base",
    category: "Content",
    icon: SiNotion,
    iconColor: SiNotionHex,
    useStatus: useNotionStatus,
    DetailView: NotionDetail,
  },
  {
    id: "gamma",
    name: "Gamma",
    description: "AI-generated decks and presentations",
    category: "Content",
    icon: makeImageIcon(gammaMark, "Gamma"),
    useStatus: useGammaStatus,
    DetailView: makeApiKeyDetail(
      "Gamma",
      "API key for generating slide decks via the Gamma API.",
      [API_KEYS.GAMMA],
    ),
  },

  // --- Analytics -----------------------------------------------------------
  {
    id: "ga4",
    name: "Google Analytics",
    description: "Pull GA4 metrics for client dashboards",
    category: "Analytics",
    icon: SiGoogleanalytics,
    iconColor: SiGoogleanalyticsHex,
    useStatus: useGA4Status,
    DetailView: GA4Detail,
  },

  // --- AI Tools ------------------------------------------------------------
  {
    id: "gemini",
    name: "Gemini",
    description: "Google Gemini model API",
    category: "AI Tools",
    icon: SiGooglegemini,
    iconColor: SiGooglegeminiHex,
    useStatus: useGeminiStatus,
    DetailView: makeApiKeyDetail(
      "Gemini",
      "API key for Google's Gemini model family.",
      [API_KEYS.GEMINI],
    ),
  },
  {
    id: "claude",
    name: "Claude Code",
    description: "Local CLI and tv-mcp sidecar for bot workflows",
    category: "AI Tools",
    icon: SiAnthropic,
    iconColor: SiAnthropicHex,
    useStatus: useClaudeStatus,
    DetailView: ClaudeCodeSetupView,
  },

  // --- Storage -------------------------------------------------------------
  {
    id: "aws",
    name: "AWS",
    description: "S3 buckets and SES email delivery",
    category: "Storage",
    icon: makeImageIcon(awsMark, "AWS"),
    useStatus: useAwsStatus,
    DetailView: AwsDetail,
  },

  // --- Platform ------------------------------------------------------------
  {
    id: "mcp",
    name: "MCP Endpoints",
    description: "VAL domain MCP URLs used by the console",
    category: "Platform",
    icon: Globe,
    useStatus: useMcpStatus,
    DetailView: McpEndpointsView,
  },

  // --- Internal Services ---------------------------------------------------
  {
    id: "tv-api",
    name: "tv-api",
    description: "Base URL of the tv-api deployment — email tracking webhooks, campaign sending, Apollo callbacks",
    category: "Internal Services",
    icon: Server,
    useStatus: useTvApiStatus,
    DetailView: makeApiKeyDetail(
      "tv-api",
      "Base URL of your tv-api deployment (e.g. https://api.thinkval.com). Used as the tracking endpoint for email opens, clicks, unsubscribes, and as the webhook host for Apollo callbacks.",
      [API_KEYS.EMAIL_API_BASE_URL],
    ),
  },

  // --- Infrastructure ------------------------------------------------------
  {
    id: "supabase",
    name: "Supabase",
    description: "Workspace database URL and anon key",
    category: "Infrastructure",
    icon: SiSupabase,
    iconColor: SiSupabaseHex,
    useStatus: useSupabaseStatus,
    DetailView: makeApiKeyDetail(
      "Supabase",
      "URL and anon key for the workspace Supabase project.",
      [API_KEYS.SUPABASE_URL, API_KEYS.SUPABASE_ANON_KEY],
    ),
  },
  {
    id: "github",
    name: "GitHub OAuth",
    description: "OAuth client credentials used for user login",
    category: "Infrastructure",
    icon: SiGithub,
    iconColor: SiGithubHex,
    useStatus: useGithubStatus,
    DetailView: makeApiKeyDetail(
      "GitHub OAuth",
      "Client ID and secret for GitHub OAuth — used to authenticate users into the app.",
      [API_KEYS.GITHUB_CLIENT_ID, API_KEYS.GITHUB_CLIENT_SECRET],
    ),
  },
];

/** IDs the IntegrationsView can deep-link to. */
export const INTEGRATION_IDS: ReadonlySet<string> = new Set(CONNECTORS.map((c) => c.id));
