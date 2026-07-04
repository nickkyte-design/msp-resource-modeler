import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://vkxryacaewoqgiilvtst.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * Browser-safe Supabase client (anon key for public operations).
 * Null when SUPABASE_ANON_KEY is not configured.
 */
export const supabaseBrowser = supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * Server-side Supabase client (service role for admin operations).
 * Null when SUPABASE_SERVICE_ROLE_KEY is not configured.
 */
export const supabaseServer = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

/**
 * Verify JWT token and extract user.
 * Returns null if Supabase is not configured or verification fails.
 */
export async function verifyJWT(token: string) {
  if (!supabaseServer) return null;
  try {
    const {
      data: { user },
      error,
    } = await supabaseServer.auth.getUser(token);
    if (error || !user) return null;
    return user;
  } catch (error) {
    console.error('[Supabase] JWT verification failed:', error);
    return null;
  }
}
