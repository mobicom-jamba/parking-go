import { createClient } from '@supabase/supabase-js';
import { getEnv, requireEnv } from './env';

let supabaseSingleton: any | null = null;

function createSupabase() {
  const supabaseUrl = getEnv('VITE_SUPABASE_URL') ?? requireEnv('SUPABASE_URL');
  const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY') ?? requireEnv('SUPABASE_ANON_KEY');
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
}

export function getSupabaseServer() {
  if (!supabaseSingleton) supabaseSingleton = createSupabase();
  return supabaseSingleton;
}

