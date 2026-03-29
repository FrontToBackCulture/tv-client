#!/usr/bin/env node

/**
 * CEA Salespersons' Property Transaction Records (residential)
 *
 * Phase 1: Download CSV to /tmp/cea-cache/ (~1.3M rows)
 * Phase 2: Insert from local file into Supabase (200 rows/batch)
 *
 * Usage:
 *   node scripts/public-data/ingest-cea.mjs              # both phases
 *   node scripts/public-data/ingest-cea.mjs --download    # download only
 *   node scripts/public-data/ingest-cea.mjs --upload      # upload only (from cache)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const envFile = readFileSync(resolve(__dirname, '../../.env'), 'utf-8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^\s*([\w]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) { console.error('Missing Supabase credentials'); process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseKey, { db: { schema: 'public_data' } });

const CACHE_DIR = '/tmp/cea-cache';
const DOWNLOAD_BASE = 'https://api-open.data.gov.sg/v1/public/api/datasets';
const DATASET_ID = 'd_ee7e46d3c57f7865790704632b0aef71';

function clean(val) {
  if (!val) return null;
  const v = val.trim();
  if (!v || v.toLowerCase() === 'na' || v === '-' || v.toLowerCase() === 'n/a') return null;
  return v;
}

const MON = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

function parseTxDate(val) {
  if (!val) return null;
  const m = val.trim().toUpperCase().match(/^([A-Z]{3})-(\d{4})$/);
  if (!m) return null;
  const mon = MON[m[1]];
  if (mon === undefined) return null;
  const d = new Date(parseInt(m[2]), mon, 1);
  return d.toISOString().split('T')[0];
}

// ─── Phase 1: Download ──────────────────────────────────

async function download() {
  mkdirSync(CACHE_DIR, { recursive: true });
  console.log('\n=== Phase 1: Download CSV ===\n');

  const cacheFile = `${CACHE_DIR}/${DATASET_ID}.csv`;

  if (existsSync(cacheFile)) {
    const size = readFileSync(cacheFile).length;
    console.log(`  Cached (${(size / 1024 / 1024).toFixed(1)}MB)`);
    return true;
  }

  process.stdout.write('  Downloading...');
  try {
    const initRes = await fetch(`${DOWNLOAD_BASE}/${DATASET_ID}/initiate-download`);
    const initJson = await initRes.json();
    const url = initJson.data?.url;
    if (!url) throw new Error('No URL');

    let csvText;
    if (url.includes('s3.') && url.includes('amazonaws.com')) {
      csvText = await (await fetch(url)).text();
    } else {
      for (let j = 0; j < 30; j++) {
        await new Promise(r => setTimeout(r, 2000));
        const pollText = await (await fetch(url)).text();
        try {
          const pollJson = JSON.parse(pollText);
          if (pollJson.data?.url) { csvText = await (await fetch(pollJson.data.url)).text(); break; }
        } catch { csvText = pollText; break; }
      }
    }

    if (!csvText) throw new Error('Download failed');
    writeFileSync(cacheFile, csvText);
    const lines = csvText.split('\n').length - 1;
    console.log(` ${lines.toLocaleString()} rows (${(csvText.length / 1024 / 1024).toFixed(1)}MB)`);
    return true;
  } catch (err) {
    console.log(` ERROR: ${err.message}`);
    return false;
  }
}

// ─── Phase 2: Upload ────────────────────────────────────

async function upload() {
  console.log('\n=== Phase 2: Upload to Supabase ===\n');
  const now = new Date().toISOString();
  const cacheFile = `${CACHE_DIR}/${DATASET_ID}.csv`;

  if (!existsSync(cacheFile)) {
    console.error('  CSV not found — run with --download first');
    return;
  }

  // Update source status
  await supabase.from('sources').update({
    sync_status: 'running', sync_error: null, updated_at: now,
  }).eq('id', 'cea-transactions');

  const { data: logEntry } = await supabase.from('ingestion_log')
    .insert({ source_id: 'cea-transactions' }).select().single();

  // Clear table
  console.log('  Clearing existing data...');
  await supabase.from('cea_transactions').delete().neq('id', 0);

  const csvText = readFileSync(cacheFile, 'utf-8');
  const lines = csvText.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  const col = (name) => headers.findIndex(h =>
    h.toLowerCase().replace(/[_ ]/g, '') === name.toLowerCase().replace(/[_ ]/g, '')
  );

  const iName = col('salespersonname');
  const iDate = col('transactiondate');
  const iRegNum = col('salespersonregnum');
  const iPropType = col('propertytype');
  const iTxType = col('transactiontype');
  const iRepresented = col('represented');
  const iTown = col('town');
  const iDistrict = col('district');
  const iLocation = col('generallocation');

  console.log(`  Headers: ${headers.join(', ')}`);
  console.log(`  Column indices: name=${iName} date=${iDate} reg=${iRegNum} prop=${iPropType} tx=${iTxType} rep=${iRepresented} town=${iTown} dist=${iDistrict} loc=${iLocation}`);

  let total = 0;
  let errors = 0;
  let batch = [];
  const startTime = Date.now();

  for (let j = 1; j < lines.length; j++) {
    const line = lines[j].trim();
    if (!line) continue;

    // Simple CSV parse — no quoted commas in this dataset
    const vals = line.split(',');

    const regNum = clean(vals[iRegNum]);
    const txDate = parseTxDate(vals[iDate]);
    if (!regNum || !txDate) continue;

    batch.push({
      salesperson_name: clean(vals[iName]),
      salesperson_reg_num: regNum,
      transaction_date: txDate,
      property_type: clean(vals[iPropType]),
      transaction_type: clean(vals[iTxType]),
      represented: clean(vals[iRepresented]),
      town: clean(vals[iTown]),
      district: clean(vals[iDistrict]),
      general_location: clean(vals[iLocation]),
      fetched_at: now,
    });

    if (batch.length >= 200) {
      const { error } = await supabase.from('cea_transactions').insert(batch);
      if (error) { errors++; if (errors <= 3) console.log(`  Batch error at row ${j}: ${error.message}`); }
      else total += batch.length;
      batch = [];

      if (total % 10000 === 0 && total > 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        process.stdout.write(`\r  Inserted: ${total.toLocaleString()} rows (${elapsed}s, ${errors} errors)`);
      }
    }
  }

  if (batch.length > 0) {
    const { error } = await supabase.from('cea_transactions').insert(batch);
    if (error) errors++;
    else total += batch.length;
  }

  const duration = Date.now() - startTime;
  console.log(`\n\n  Done: ${total.toLocaleString()} rows in ${(duration / 1000).toFixed(0)}s (${errors} errors)\n`);

  // Update source + log
  await supabase.from('sources').update({
    sync_status: errors > 10 ? 'error' : 'success',
    sync_error: errors > 0 ? `${errors} batch errors` : null,
    row_count: total, last_synced_at: now, updated_at: now,
  }).eq('id', 'cea-transactions');

  if (logEntry) {
    await supabase.from('ingestion_log').update({
      rows_upserted: total, status: errors > 10 ? 'error' : 'success',
      completed_at: new Date().toISOString(), duration_ms: duration,
    }).eq('id', logEntry.id);
  }
}

// ─── Main ───────────────────────────────────────────────

async function main() {
  const downloadOnly = process.argv.includes('--download');
  const uploadOnly = process.argv.includes('--upload');

  if (!uploadOnly) {
    const ok = await download();
    if (!ok && !uploadOnly) { console.error('Download failed'); process.exit(1); }
  }
  if (!downloadOnly) await upload();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
