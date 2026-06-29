import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://vkxryacaewoqgiilvtst.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * Browser-safe Supabase client (anon key for public operations).
 */
export const supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Server-side Supabase client (service role for admin operations).
 */
export const supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Verify JWT token and extract user.
 */
export async function verifyJWT(token: string) {
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
