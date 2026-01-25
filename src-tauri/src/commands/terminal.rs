// src-tauri/src/commands/terminal.rs
// Terminal/PTY commands for the Console module

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::State;

// Terminal session state
pub struct TerminalSessions {
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

struct TerminalSession {
    writer: Box<dyn Write + Send>,
    reader: Arc<Mutex<Box<dyn Read + Send>>>,
    _child: Box<dyn portable_pty::Child + Send + Sync>,
}

impl Default for TerminalSessions {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TerminalInfo {
    pub id: String,
    pub rows: u16,
    pub cols: u16,
}

/// Create a new terminal session
#[tauri::command]
pub fn terminal_create(
    id: String,
    rows: u16,
    cols: u16,
    cwd: Option<String>,
    sessions: State<'_, TerminalSessions>,
) -> Result<TerminalInfo, String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    // Build shell command
    let mut cmd = CommandBuilder::new(get_default_shell());
    cmd.arg("-l"); // Login shell

    // Set working directory
    if let Some(dir) = cwd {
        cmd.cwd(dir);
    } else if let Some(home) = dirs::home_dir() {
        cmd.cwd(home);
    }

    // Set environment
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    // Spawn the shell
    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    // Get reader and writer
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone reader: {}", e))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take writer: {}", e))?;

    let session = TerminalSession {
        writer,
        reader: Arc::new(Mutex::new(reader)),
        _child: child,
    };

    sessions
        .sessions
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?
        .insert(id.clone(), session);

    Ok(TerminalInfo { id, rows, cols })
}

/// Write data to terminal
#[tauri::command]
pub fn terminal_write(
    id: String,
    data: String,
    sessions: State<'_, TerminalSessions>,
) -> Result<(), String> {
    let mut sessions_guard = sessions
        .sessions
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let session = sessions_guard
        .get_mut(&id)
        .ok_or_else(|| "Session not found".to_string())?;

    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Write error: {}", e))?;

    session
        .writer
        .flush()
        .map_err(|e| format!("Flush error: {}", e))?;

    Ok(())
}

/// Read data from terminal (non-blocking)
#[tauri::command]
pub fn terminal_read(id: String, sessions: State<'_, TerminalSessions>) -> Result<String, String> {
    let sessions_guard = sessions
        .sessions
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let session = sessions_guard
        .get(&id)
        .ok_or_else(|| "Session not found".to_string())?;

    let reader = session.reader.clone();
    drop(sessions_guard); // Release lock before blocking read

    let mut reader_guard = reader.lock().map_err(|e| format!("Reader lock error: {}", e))?;

    let mut buffer = [0u8; 4096];

    // Try to read available data
    match reader_guard.read(&mut buffer) {
        Ok(0) => Ok(String::new()),
        Ok(n) => {
            let data = String::from_utf8_lossy(&buffer[..n]).to_string();
            Ok(data)
        }
        Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => Ok(String::new()),
        Err(e) => Err(format!("Read error: {}", e)),
    }
}

/// Resize terminal
#[tauri::command]
pub fn terminal_resize(
    id: String,
    rows: u16,
    cols: u16,
    sessions: State<'_, TerminalSessions>,
) -> Result<(), String> {
    // Note: portable-pty doesn't easily support resize after creation
    // This is a placeholder - in practice, you might need to recreate the session
    log::info!("Terminal {} resize requested: {}x{}", id, cols, rows);

    let sessions_guard = sessions
        .sessions
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    if !sessions_guard.contains_key(&id) {
        return Err("Session not found".to_string());
    }

    Ok(())
}

/// Close terminal session
#[tauri::command]
pub fn terminal_close(id: String, sessions: State<'_, TerminalSessions>) -> Result<(), String> {
    let mut sessions_guard = sessions
        .sessions
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    sessions_guard.remove(&id);
    log::info!("Terminal {} closed", id);

    Ok(())
}

/// List active terminal sessions
#[tauri::command]
pub fn terminal_list(sessions: State<'_, TerminalSessions>) -> Result<Vec<String>, String> {
    let sessions_guard = sessions
        .sessions
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    Ok(sessions_guard.keys().cloned().collect())
}

fn get_default_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| {
        if cfg!(target_os = "windows") {
            "powershell.exe".to_string()
        } else {
            "/bin/zsh".to_string()
        }
    })
}
