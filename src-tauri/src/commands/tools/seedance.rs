// Seedance video generation via OpenRouter.
//
// Two-step pipeline:
//   1. Distill a markdown file into a concise cinematic prompt via Anthropic (Sonnet 4.6).
//   2. Submit the prompt to OpenRouter's video API and poll until a video URL is returned.
//
// API references:
//   - https://openrouter.ai/docs/guides/overview/multimodal/video-generation
//   - https://openrouter.ai/bytedance/seedance-2.0-fast
//   - https://openrouter.ai/bytedance/seedance-2.0

use crate::commands::error::{CmdResult, CommandError};
use crate::commands::settings::{self, KEY_OPENROUTER_API};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::{Path, PathBuf};
use tauri::command;
use tokio::fs as tokio_fs;
use tokio::io::AsyncWriteExt;

const OPENROUTER_VIDEOS_URL: &str = "https://openrouter.ai/api/v1/videos";
const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const DISTILL_MODEL: &str = "claude-sonnet-4-6";

const DEFAULT_SEEDANCE_MODEL: &str = "bytedance/seedance-2.0-fast";
const DEFAULT_ASPECT: &str = "16:9";
const DEFAULT_DURATION: u32 = 5;

// ============================================================================
// Sidecar config (.seedance.json)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeedanceConfig {
    pub model: String,
    pub prompt: String,
    pub aspect_ratio: String,
    pub duration: u32,
    pub generate_audio: bool,
    /// Filename (not path) of the source markdown, relative to the sidecar.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_md: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolution: Option<String>,
}

// ============================================================================
// OpenRouter response types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeedanceJobStatus {
    pub id: String,
    pub status: String,
    #[serde(default)]
    pub unsigned_urls: Vec<String>,
    #[serde(default)]
    pub error: Option<String>,
}

// ============================================================================
// Anthropic distill
// ============================================================================

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContentBlock>,
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum AnthropicContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
}

const DISTILL_SYSTEM_PROMPT: &str = "You are a video prompt engineer. Convert the user's markdown document into a single cinematic video prompt for a text-to-video model (ByteDance Seedance).

Rules:
- Output ONE paragraph, 1-3 sentences, no markdown, no headings, no lists, no quotes.
- Lead with the subject, then action, then setting, then style/mood/lighting.
- Concrete and visual: describe what is seen and how it moves. No abstract concepts.
- Do not invent narrative details that aren't in the source.
- No camera jargon unless the source explicitly calls for it.
- Output ONLY the prompt text, no preamble or explanation.";

/// Read a `.md` file and return a distilled video prompt.
#[command]
pub async fn seedance_distill_md(md_path: String) -> CmdResult<String> {
    let api_key = settings::settings_get_anthropic_key()?.ok_or_else(|| {
        CommandError::Config(
            "Anthropic API key not configured. Go to Settings (⌘,) to add it.".into(),
        )
    })?;

    let raw = tokio_fs::read_to_string(&md_path).await?;
    let body = strip_frontmatter(&raw);

    if body.trim().is_empty() {
        return Err(CommandError::Config(
            "Markdown file is empty after stripping frontmatter".into(),
        ));
    }

    let client = crate::HTTP_CLIENT.clone();
    let response = client
        .post(ANTHROPIC_URL)
        .header("Content-Type", "application/json")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&json!({
            "model": DISTILL_MODEL,
            "max_tokens": 512,
            "temperature": 0.4,
            "system": DISTILL_SYSTEM_PROMPT,
            "messages": [
                { "role": "user", "content": body }
            ],
        }))
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        return Err(CommandError::Http {
            status,
            body: body[..body.len().min(500)].to_string(),
        });
    }

    let parsed: AnthropicResponse = response.json().await?;
    let prompt = parsed
        .content
        .iter()
        .map(|b| match b {
            AnthropicContentBlock::Text { text } => text.as_str(),
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();

    if prompt.is_empty() {
        return Err(CommandError::Internal(
            "Anthropic returned an empty distilled prompt".into(),
        ));
    }
    Ok(prompt)
}

fn strip_frontmatter(content: &str) -> &str {
    if let Some(rest) = content.strip_prefix("---") {
        if let Some(end) = rest.find("\n---") {
            return rest[end + 4..].trim_start();
        }
    }
    content
}

// ============================================================================
// Sidecar create
// ============================================================================

/// Write a `.seedance.json` next to the given `.md` file. Returns the new path.
#[command]
pub async fn seedance_create_config(md_path: String, prompt: String) -> CmdResult<String> {
    let md = PathBuf::from(&md_path);
    let stem = md
        .file_stem()
        .ok_or_else(|| CommandError::Config("Cannot derive stem from md_path".into()))?
        .to_string_lossy()
        .to_string();
    let parent = md.parent().unwrap_or(Path::new("."));
    let sidecar = parent.join(format!("{}.seedance.json", stem));

    let config = SeedanceConfig {
        model: DEFAULT_SEEDANCE_MODEL.to_string(),
        prompt,
        aspect_ratio: DEFAULT_ASPECT.to_string(),
        duration: DEFAULT_DURATION,
        generate_audio: true,
        source_md: md.file_name().map(|n| n.to_string_lossy().to_string()),
        seed: None,
        resolution: None,
    };

    let body = serde_json::to_string_pretty(&config)?;
    tokio_fs::write(&sidecar, body).await?;
    Ok(sidecar.to_string_lossy().to_string())
}

// ============================================================================
// Submit + poll
// ============================================================================

fn read_config(config_path: &str) -> CmdResult<SeedanceConfig> {
    let raw = std::fs::read_to_string(config_path)?;
    let cfg: SeedanceConfig = serde_json::from_str(&raw)?;
    if cfg.prompt.trim().is_empty() {
        return Err(CommandError::Config(
            "Seedance config has no prompt".into(),
        ));
    }
    Ok(cfg)
}

fn openrouter_key() -> CmdResult<String> {
    settings::settings_get_key(KEY_OPENROUTER_API.to_string())?.ok_or_else(|| {
        CommandError::Config(
            "OpenRouter API key not configured. Go to Settings (⌘,) to add it.".into(),
        )
    })
}

/// Submit a video generation request. Returns the job id.
#[command]
pub async fn seedance_submit_video(config_path: String) -> CmdResult<SeedanceJobStatus> {
    let cfg = read_config(&config_path)?;
    let api_key = openrouter_key()?;

    let mut body = json!({
        "model": cfg.model,
        "prompt": cfg.prompt,
        "aspect_ratio": cfg.aspect_ratio,
        "duration": cfg.duration,
        "generate_audio": cfg.generate_audio,
    });
    if let Some(seed) = cfg.seed {
        body["seed"] = json!(seed);
    }
    if let Some(resolution) = cfg.resolution.as_deref() {
        body["resolution"] = json!(resolution);
    }

    let client = crate::HTTP_CLIENT.clone();
    let response = client
        .post(OPENROUTER_VIDEOS_URL)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        return Err(CommandError::Http {
            status,
            body: text[..text.len().min(800)].to_string(),
        });
    }

    let job: SeedanceJobStatus = response.json().await?;
    Ok(job)
}

/// Poll job status. Returns the current job state.
#[command]
pub async fn seedance_poll_video(job_id: String) -> CmdResult<SeedanceJobStatus> {
    let api_key = openrouter_key()?;
    let url = format!("{}/{}", OPENROUTER_VIDEOS_URL, job_id);

    let client = crate::HTTP_CLIENT.clone();
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        return Err(CommandError::Http {
            status,
            body: text[..text.len().min(800)].to_string(),
        });
    }

    let job: SeedanceJobStatus = response.json().await?;
    Ok(job)
}

/// Download a completed video to disk next to its config and return the saved path.
#[command]
pub async fn seedance_download_video(
    video_url: String,
    config_path: String,
) -> CmdResult<String> {
    let cfg_path = PathBuf::from(&config_path);
    let parent = cfg_path.parent().unwrap_or(Path::new("."));
    let stem = cfg_path
        .file_name()
        .and_then(|n| n.to_str())
        .and_then(|n| n.strip_suffix(".seedance.json"))
        .unwrap_or("video")
        .to_string();
    let dest = parent.join(format!("{}.mp4", stem));

    let client = crate::HTTP_CLIENT.clone();
    let mut response = client.get(&video_url).send().await?;
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        return Err(CommandError::Http {
            status,
            body: text[..text.len().min(500)].to_string(),
        });
    }

    let mut file = tokio_fs::File::create(&dest).await?;
    while let Some(chunk) = response.chunk().await? {
        file.write_all(&chunk).await?;
    }
    file.flush().await?;

    Ok(dest.to_string_lossy().to_string())
}
