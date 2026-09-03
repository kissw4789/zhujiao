#!/usr/bin/env node
// Upload prepared migration payloads to Supabase through PostgREST.
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_PAYLOAD_DIR = path.join(ROOT, '_archive', '2026-09-03_supabase_migration');
const payloadDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_PAYLOAD_DIR;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const rest = `${url.replace(/\/+$/, '')}/rest/v1`;
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=minimal',
};

const order = [
  ['import_batches', 'batch_id'],
  ['families', 'family_id'],
  ['students', 'id'],
  ['classes', 'id'],
  ['orders', 'id'],
  ['schedule_items', 'schedule_id'],
  ['course_outlines', 'id'],
  ['enrollments', 'eid'],
  ['raw_roster_rows', 'batch_id,source_file,row_index'],
  ['followups', 'source_key'],
  ['leaves', 'lid'],
  ['class_progress', 'class_name'],
  ['family_assignment_rules', 'family_id,grade_key'],
  ['op_logs', 'source_hash'],
];

function readJson(table) {
  const fp = path.join(payloadDir, `${table}.json`);
  if (!fs.existsSync(fp)) return [];
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  return Array.isArray(data) ? data : [];
}

function chunks(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function upsert(table, rows, conflict) {
  if (!rows.length) {
    console.log(`${table}: 0 rows`);
    return;
  }
  const parts = chunks(rows, 400);
  let done = 0;
  for (const part of parts) {
    const res = await fetch(`${rest}/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(part),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${table} upload failed: ${res.status} ${text}`);
    }
    done += part.length;
  }
  console.log(`${table}: ${done} rows`);
}

(async () => {
  console.log(`Payload dir: ${payloadDir}`);
  for (const [table, conflict] of order) {
    await upsert(table, readJson(table), conflict);
  }
  console.log('Supabase upload completed.');
})().catch(err => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
