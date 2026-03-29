#!/usr/bin/env node

/**
 * ACRA Corporate Entities Ingestion — two-phase approach
 *
 * Phase 1: Download all 27 CSVs to /tmp/acra-cache/ (skips already downloaded)
 * Phase 2: Insert from local files into Supabase (200 rows/batch)
 *
 * Usage:
 *   node scripts/public-data/ingest-acra.mjs              # both phases
 *   node scripts/public-data/ingest-acra.mjs --download    # download only
 *   node scripts/public-data/ingest-acra.mjs --upload      # upload only (from cache)
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

const CACHE_DIR = '/tmp/acra-cache';
const DOWNLOAD_BASE = 'https://api-open.data.gov.sg/v1/public/api/datasets';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ+'.split('');

const DATASET_IDS = [
  'd_af2042c77ffaf0db5d75561ce9ef5688', 'd_0cc5f52a1f298b916f317800251057f3',
  'd_4e3db8955fdcda6f9944097bef3d2724', 'd_1cd970d8351b42be4a308d628a6dd9d3',
  'd_e97e8e7fc55b85a38babf66b0fa46b73', 'd_df7d2d661c0c11a7c367c9ee4bf896c1',
  'd_fa2ed456cf2b8597bb7e064b08fc3c7c', 'd_300ddc8da4e8f7bdc1bfc62d0d99e2e7',
  'd_31af23fdb79119ed185c256f03cb5773', 'd_67e99e6eabc4aad9b5d48663b579746a',
  'd_c0650f23e94c42e7a20921f4c5b75c24', 'd_3a3807c023c61ddfba947dc069eb53f2',
  'd_478f45a9c541cbe679ca55d1cd2b970b', 'd_a2141adf93ec2a3c2ec2837b78d6d46e',
  'd_181005ca270b45408b4cdfc954980ca2', 'd_8575e84912df3c28995b8e6e0e05205a',
  'd_9af9317c646a1c881bb5591c91817cc6', 'd_5c4ef48b025fdfbc80056401f06e3df9',
  'd_5573b0db0575db32190a2ad27919a7aa', 'd_2b8c54b2a490d2fa36b925289e5d9572',
  'd_85518d970b8178975850457f60f1e738', 'd_72f37e5c5d192951ddc5513c2b134482',
  'd_4526d47d6714d3b052eed4a30b8b1ed6', 'd_b58303c68e9cf0d2ae93b73ffdbfbfa1',
  'd_acbc938ec77af18f94cecc4a7c9ec720', 'd_4130f1d9d365d9f1633536e959f62bb7',
  'd_124a9bd407c7a25f8335b93b86e50fdd',
];

function clean(val) {
  if (!val) return null;
  const v = val.trim();
  if (!v || v.toLowerCase() === 'na' || v === '-') return null;
  return v;
}

// ─── Phase 1: Download ──────────────────────────────────

async function downloadAll() {
  mkdirSync(CACHE_DIR, { recursive: true });
  console.log('\n=== Phase 1: Download CSVs ===\n');

  for (let i = 0; i < DATASET_IDS.length; i++) {
    const dsId = DATASET_IDS[i];
    const label = LETTERS[i] || '?';
    const cacheFile = `${CACHE_DIR}/${dsId}.csv`;

    if (existsSync(cacheFile)) {
      const size = readFileSync(cacheFile).length;
      console.log(`  [${i+1}/27] ${label}: cached (${(size/1024/1024).toFixed(1)}MB)`);
      continue;
    }

    process.stdout.write(`  [${i+1}/27] ${label}: downloading...`);
    try {
      const initRes = await fetch(`${DOWNLOAD_BASE}/${dsId}/initiate-download`);
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
      console.log(` ${lines.toLocaleString()} rows (${(csvText.length/1024/1024).toFixed(1)}MB)`);

      // Brief pause between downloads
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.log(` ERROR: ${err.message}`);
    }
  }

  const cached = DATASET_IDS.filter(id => existsSync(`${CACHE_DIR}/${id}.csv`)).length;
  console.log(`\nDownloaded: ${cached}/27 files\n`);
  return cached === 27;
}

// ─── Phase 2: Upload ────────────────────────────────────

async function uploadAll() {
  console.log('\n=== Phase 2: Upload to Supabase ===\n');
  const now = new Date().toISOString();

  // Update source status
  await supabase.from('sources').update({
    sync_status: 'running', sync_error: null, updated_at: now,
  }).eq('id', 'acra-entities');

  const { data: logEntry } = await supabase.from('ingestion_log')
    .insert({ source_id: 'acra-entities' }).select().single();

  // Clear table
  console.log('  Clearing existing data...');
  await supabase.from('acra_entities').delete().neq('id', 0);

  let grandTotal = 0;
  let errors = 0;
  const startTime = Date.now();

  for (let i = 0; i < DATASET_IDS.length; i++) {
    const dsId = DATASET_IDS[i];
    const label = LETTERS[i] || '?';
    const cacheFile = `${CACHE_DIR}/${dsId}.csv`;

    if (!existsSync(cacheFile)) {
      console.log(`  [${i+1}/27] ${label}: SKIPPED (not downloaded)`);
      continue;
    }

    process.stdout.write(`  [${i+1}/27] ${label}: inserting...`);
    const csvText = readFileSync(cacheFile, 'utf-8');
    const lines = csvText.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

    const col = (name) => headers.findIndex(h =>
      h.toLowerCase().replace(/[_ ]/g, '') === name.toLowerCase().replace(/[_ ]/g, '')
    );

    const iUen = col('uen');
    const iName = col('entityname') !== -1 ? col('entityname') : col('entity_name');
    const iType = col('entitytypedescription') !== -1 ? col('entitytypedescription') : col('entity_type_description');
    const iConst = col('businessconstitutiondescription') !== -1 ? col('businessconstitutiondescription') : col('business_constitution_description');
    const iStatus = col('entitystatusdescription') !== -1 ? col('entitystatusdescription') : col('entity_status_description');
    const iRegDate = col('registrationincorporationdate') !== -1 ? col('registrationincorporationdate') : col('registration_incorporation_date');
    const iSsic = col('primaryssiccode') !== -1 ? col('primaryssiccode') : col('primary_ssic_code');
    const iSsicDesc = col('primaryssicdescription') !== -1 ? col('primaryssicdescription') : col('primary_ssic_description');
    const iActivity = col('primaryuserdescribedactivity') !== -1 ? col('primaryuserdescribedactivity') : col('primary_user_described_activity');
    const iSsic2 = col('secondaryssiccode') !== -1 ? col('secondaryssiccode') : col('secondary_ssic_code');
    const iBlock = col('block');
    const iStreet = col('streetname') !== -1 ? col('streetname') : col('street_name');
    const iPostal = col('postalcode') !== -1 ? col('postalcode') : col('postal_code');
    const iBuilding = col('buildingname') !== -1 ? col('buildingname') : col('building_name');
    const iOfficers = col('noofofficers') !== -1 ? col('noofofficers') : col('no_of_officers');

    let batch = [];
    let fileTotal = 0;
    let fileErrors = 0;

    for (let j = 1; j < lines.length; j++) {
      const line = lines[j].trim();
      if (!line) continue;
      const vals = line.split(',');
      if (vals.length < 10) continue;

      const regDate = clean(vals[iRegDate]);
      batch.push({
        uen: clean(vals[iUen]),
        entity_name: clean(vals[iName]),
        entity_type: clean(vals[iType]),
        business_constitution: clean(vals[iConst]),
        entity_status: clean(vals[iStatus]),
        registration_date: regDate && regDate.match(/^\d{4}-\d{2}-\d{2}$/) ? regDate : null,
        primary_ssic_code: clean(vals[iSsic]),
        primary_ssic_description: clean(vals[iSsicDesc]),
        primary_activity: clean(vals[iActivity]),
        secondary_ssic_code: clean(vals[iSsic2]),
        block: clean(vals[iBlock]),
        street_name: clean(vals[iStreet]),
        postal_code: clean(vals[iPostal]),
        building_name: clean(vals[iBuilding]),
        no_of_officers: vals[iOfficers] ? parseInt(vals[iOfficers]) || null : null,
        fetched_at: now,
      });

      if (batch.length >= 200) {
        const { error } = await supabase.from('acra_entities').insert(batch);
        if (error) { fileErrors++; errors++; }
        else fileTotal += batch.length;
        batch = [];
      }
    }

    if (batch.length > 0) {
      const { error } = await supabase.from('acra_entities').insert(batch);
      if (error) { fileErrors++; errors++; }
      else fileTotal += batch.length;
    }

    grandTotal += fileTotal;
    const errMsg = fileErrors > 0 ? ` (${fileErrors} batch errors)` : '';
    console.log(` ${fileTotal.toLocaleString()} rows${errMsg}`);
  }

  const duration = Date.now() - startTime;

  await supabase.from('sources').update({
    sync_status: errors > 10 ? 'error' : 'success',
    sync_error: errors > 0 ? `${errors} batch errors` : null,
    row_count: grandTotal, last_synced_at: now, updated_at: now,
  }).eq('id', 'acra-entities');

  if (logEntry) {
    await supabase.from('ingestion_log').update({
      rows_upserted: grandTotal, status: errors > 10 ? 'error' : 'success',
      completed_at: new Date().toISOString(), duration_ms: duration,
    }).eq('id', logEntry.id);
  }

  console.log(`\n=== Done: ${grandTotal.toLocaleString()} rows in ${(duration/1000).toFixed(0)}s (${errors} errors) ===\n`);
}

// ─── Main ───────────────────────────────────────────────

async function main() {
  const downloadOnly = process.argv.includes('--download');
  const uploadOnly = process.argv.includes('--upload');

  if (!uploadOnly) await downloadAll();
  if (!downloadOnly) await uploadAll();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
