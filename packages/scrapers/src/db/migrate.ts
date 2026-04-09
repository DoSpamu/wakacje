#!/usr/bin/env node
/**
 * Migration runner for Supabase.
 *
 * Usage:
 *   pnpm migrate
 *
 * Reads SQL migration files from supabase/migrations/ and executes them
 * in order against the Supabase database using the management API.
 *
 * Requires:
 *   SUPABASE_URL          — e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (not anon key)
 *   SUPABASE_DB_URL       — direct postgres URL (optional, for local dev)
 *
 * If SUPABASE_DB_URL is not set, this script will print the SQL to stdout
 * so you can apply it manually via Supabase SQL Editor.
 */

import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../../../../supabase/migrations');

async function getMigrationFiles(): Promise<string[]> {
  const files = await readdir(MIGRATIONS_DIR);
  return files
    .filter((f) => f.endsWith('.sql'))
    .sort(); // lexicographic order — 001_, 002_, etc.
}

async function runMigrationsViaManagementApi(
  projectRef: string,
  accessToken: string,
  migrations: { name: string; sql: string }[],
): Promise<void> {
  for (const migration of migrations) {
    console.log(`  Applying: ${migration.name} ...`);
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: migration.sql }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Migration ${migration.name} failed: ${res.status} ${body}`);
    }

    console.log(`  ✓ ${migration.name}`);
  }
}

async function main() {
  console.log('\n📦 Wakacje — Database Migration Runner\n');

  const files = await getMigrationFiles();
  if (files.length === 0) {
    console.log('No migration files found in', MIGRATIONS_DIR);
    return;
  }

  const migrations = await Promise.all(
    files.map(async (file) => ({
      name: file,
      sql: await readFile(join(MIGRATIONS_DIR, file), 'utf-8'),
    })),
  );

  console.log(`Found ${migrations.length} migration file(s):\n`);
  migrations.forEach((m) => console.log(`  - ${m.name}`));
  console.log();

  const supabaseUrl = process.env['SUPABASE_URL'];
  const accessToken = process.env['SUPABASE_ACCESS_TOKEN'];

  // Extract project ref from URL (https://<ref>.supabase.co)
  const projectRef = supabaseUrl?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

  if (accessToken && projectRef) {
    // Use Supabase Management API
    console.log(`Applying migrations via Supabase Management API (project: ${projectRef})...\n`);
    try {
      await runMigrationsViaManagementApi(projectRef, accessToken, migrations);
      console.log('\n✅ All migrations applied successfully!\n');
    } catch (err) {
      console.error('\n❌ Migration failed:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  } else {
    // Print instructions for manual application
    console.log('─'.repeat(60));
    console.log('SUPABASE_ACCESS_TOKEN not set — manual apply required.');
    console.log('─'.repeat(60));
    console.log('\nOption 1: Apply via Supabase SQL Editor');
    console.log('  1. Open https://supabase.com/dashboard → SQL Editor');
    console.log('  2. Paste each migration file below and run in order\n');

    for (const m of migrations) {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`-- ${m.name}`);
      console.log('═'.repeat(60));
      console.log(m.sql);
    }

    console.log('\nOption 2: Use Supabase CLI');
    console.log('  npx supabase db push\n');

    console.log('Option 3: Set SUPABASE_ACCESS_TOKEN env var to auto-apply');
    console.log(
      '  Get your token: https://supabase.com/dashboard/account/tokens\n',
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
