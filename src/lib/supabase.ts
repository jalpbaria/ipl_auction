import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const missingSupabaseEnvVars: string[] = [
  ...(!supabaseUrl || supabaseUrl.trim() === '' ? ['VITE_SUPABASE_URL'] : []),
  ...(!supabaseAnonKey || supabaseAnonKey.trim() === ''
    ? ['VITE_SUPABASE_ANON_KEY']
    : []),
];

export const isSupabaseConfigured = missingSupabaseEnvVars.length === 0;

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;
