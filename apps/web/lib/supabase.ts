import { createClient } from '@supabase/supabase-js';

if (!process.env['NEXT_PUBLIC_SUPABASE_URL']) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
}
if (!process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']) {
  throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required');
}

/** Client-side Supabase client — uses anon key, subject to RLS */
export const supabaseClient = createClient(
  process.env['NEXT_PUBLIC_SUPABASE_URL'],
  process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
);

/** Server-side Supabase client — uses service role, bypasses RLS */
export function createServerClient() {
  if (!process.env['SUPABASE_SERVICE_ROLE_KEY']) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required on server');
  }

  return createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY'],
    { auth: { persistSession: false } },
  );
}
