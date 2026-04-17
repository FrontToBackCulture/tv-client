// One-time migration from ~/.tv-desktop/ → ~/.tv-mcp/ (shared) + ~/.tv-client/ (private)
// Runs on first launch after upgrade. Idempotent — writes a marker to skip subsequent runs.

use std::fs;
use std::path::Path;

const MIGRATION_MARKER: &str = ".migrated-from-tv-desktop";

pub fn migrate_from_tv_desktop() {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return,
    };

    let tv_desktop = home.join(".tv-desktop");
    let tv_mcp = home.join(".tv-mcp");
    let tv_client = home.join(".tv-client");

    // Skip if already migrated
    if tv_client.join(MIGRATION_MARKER).exists() {
        return;
    }

    // Nothing to migrate
    if !tv_desktop.exists() {
        let _ = fs::create_dir_all(&tv_client);
        let _ = fs::write(tv_client.join(MIGRATION_MARKER), "");
        return;
    }

    eprintln!("[tv-client] Migrating ~/.tv-desktop → ~/.tv-mcp/ + ~/.tv-client/");

    let _ = fs::create_dir_all(&tv_mcp);
    let _ = fs::create_dir_all(&tv_client);

    // Settings.json → shared with tv-mcp (but only if tv-mcp doesn't already have it)
    let old_settings = tv_desktop.join("settings.json");
    let new_settings = tv_mcp.join("settings.json");
    if old_settings.exists() && !new_settings.exists() {
        if let Err(e) = fs::copy(&old_settings, &new_settings) {
            eprintln!("[tv-client] Failed to copy settings.json: {}", e);
        }
    }

    // Rewrite any stale `.tv-desktop/` paths inside settings.json — e.g. users
    // often have ga4_service_account_path pointing at the old folder.
    if new_settings.exists() {
        if let Ok(content) = fs::read_to_string(&new_settings) {
            let tv_desktop_str = tv_desktop.display().to_string();
            let tv_client_str = tv_client.display().to_string();
            if content.contains(&tv_desktop_str) {
                let rewritten = content.replace(&tv_desktop_str, &tv_client_str);
                if let Err(e) = fs::write(&new_settings, rewritten) {
                    eprintln!("[tv-client] Failed to rewrite settings paths: {}", e);
                } else {
                    eprintln!("[tv-client] Rewrote stale .tv-desktop paths in settings.json");
                }
            }
        }
    }

    // All other tv-client-private files/folders → ~/.tv-client/
    // Intentionally excluded:
    //   - bin/        (old tv-mcp sidecar — dead, users install standalone now)
    //   - scheduler/  (moved to Supabase in an earlier migration)
    let items = [
        "val-sync-config.json",
        "val-tokens.json",
        "github-sync-config.json",
        "drive-scan-config.json",
        "drive-scan-results.json",
        "ga4-service-account.json",
        "outlook",
        "analytics",
        "linkedin",
    ];

    for name in items {
        let src = tv_desktop.join(name);
        let dst = tv_client.join(name);
        if src.exists() && !dst.exists() {
            if let Err(e) = copy_recursive(&src, &dst) {
                eprintln!("[tv-client] Failed to migrate {}: {}", name, e);
            }
        }
    }

    // Mark complete so we skip on next launch
    let _ = fs::write(tv_client.join(MIGRATION_MARKER), "");

    eprintln!("[tv-client] Migration complete. Old ~/.tv-desktop/ can be deleted manually.");
}

fn copy_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    if src.is_dir() {
        fs::create_dir_all(dst)?;
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            let src_path = entry.path();
            let dst_path = dst.join(entry.file_name());
            copy_recursive(&src_path, &dst_path)?;
        }
    } else {
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(src, dst)?;
    }
    Ok(())
}

