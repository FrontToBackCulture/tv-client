#!/usr/bin/env node

/**
 * Generate Tauri Commands JSON
 * 
 * Reads main.rs and extracts all command names from the invoke_handler! macro,
 * then outputs a JSON file with command metadata.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const MAIN_RS_PATH = path.join(__dirname, '../src-tauri/src/main.rs');
const OUTPUT_DIR = path.join(__dirname, '../src/modules/system/generated');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'tauri-commands.json');

/**
 * Parse module from a command path like "commands::files::read_file"
 * Returns the module name (e.g., "files") or "root" for top-level commands
 */
function parseModule(commandPath) {
  // Remove "commands::" prefix
  const withoutPrefix = commandPath.replace(/^commands::/, '');
  
  // Split by "::"
  const parts = withoutPrefix.split('::');
  
  if (parts.length === 1) {
    // Top-level command like "greet"
    return 'root';
  }
  
  // Return the first part as the module
  // For nested modules like "val_sync::config::val_sync_load_config", return "val_sync"
  return parts[0];
}

/**
 * Extract command name from a full path
 * "commands::files::read_file" -> "read_file"
 */
function parseCommandName(commandPath) {
  const parts = commandPath.split('::');
  return parts[parts.length - 1];
}

/**
 * Extract all commands from the invoke_handler! macro in main.rs
 */
function extractCommands(rustSource) {
  // Find the invoke_handler! macro content
  const invokeHandlerMatch = rustSource.match(/invoke_handler\(tauri::generate_handler!\[([^\]]+)\]/s);
  
  if (!invokeHandlerMatch) {
    throw new Error('Could not find invoke_handler! macro in main.rs');
  }
  
  const handlerContent = invokeHandlerMatch[1];
  
  // Extract all command paths (skip comments)
  const commands = [];
  const lines = handlerContent.split('\n');
  
  for (const line of lines) {
    // Skip comment-only lines
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed === '') {
      continue;
    }
    
    // Remove inline comments and trailing commas
    const cleaned = trimmed
      .replace(/\/\/.*$/, '')  // Remove inline comments
      .replace(/,$/, '')       // Remove trailing comma
      .trim();
    
    if (cleaned && cleaned.startsWith('commands::')) {
      const module = parseModule(cleaned);
      const name = parseCommandName(cleaned);
      commands.push({ name, module });
    }
  }
  
  return commands;
}

/**
 * Main function
 */
function main() {
  console.log('Reading main.rs...');
  const rustSource = fs.readFileSync(MAIN_RS_PATH, 'utf-8');
  
  console.log('Extracting commands...');
  const commands = extractCommands(rustSource);
  
  // Sort by module, then by name
  commands.sort((a, b) => {
    if (a.module !== b.module) {
      return a.module.localeCompare(b.module);
    }
    return a.name.localeCompare(b.name);
  });
  
  // Create output
  const output = {
    generated: new Date().toISOString(),
    commands
  };
  
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Write JSON
  console.log(`Writing ${commands.length} commands to ${OUTPUT_PATH}...`);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
  
  // Print summary
  const modules = [...new Set(commands.map(c => c.module))].sort();
  console.log('\nCommands by module:');
  for (const mod of modules) {
    const count = commands.filter(c => c.module === mod).length;
    console.log(`  ${mod}: ${count}`);
  }
  console.log(`\nTotal: ${commands.length} commands`);
}

main();
