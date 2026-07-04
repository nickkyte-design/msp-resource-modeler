import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vkxryacaewoqgiilvtst.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const _supabase = supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const noopAuth = {
  signUp: async () => ({ data: null, error: new Error('Supabase not configured') }),
  signInWithPassword: async () => ({ data: null, error: new Error('Supabase not configured') }),
  signInWithOtp: async () => ({ data: null, error: new Error('Supabase not configured') }),
  signOut: async () => ({ error: null }),
  getSession: async () => ({ data: { session: null }, error: null }),
  getUser: async () => ({ data: { user: null }, error: null }),
};

const supabaseProxy = {
  auth: _supabase ? _supabase.auth : noopAuth,
};

export const supabase = (supabaseProxy as typeof supabaseProxy & { auth: typeof supabaseProxy.auth });

/**
 * Sign up with email and password.
 */
export async function signUp(email: string, password: string) {
  if (!_supabase) return { data: null, error: new Error('Supabase not configured') };
  const { data, error } = await _supabase.auth.signUp({ email, password });
  return { data, error };
}

/**
 * Sign in with email and password.
 */
export async function signIn(email: string, password: string) {
  if (!_supabase) return { data: null, error: new Error('Supabase not configured') };
  const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
  return { data, error };
}

/**
 * Send a magic link to the user's email.
 */
export async function signInWithMagicLink(email: string) {
  if (!_supabase) return { data: null, error: new Error('Supabase not configured') };
  const { data, error } = await _supabase.auth.signInWithOtp({ email });
  return { data, error };
}

/**
 * Sign out the current user.
 */
export async function signOut() {
  if (!_supabase) return { error: null };
  const { error } = await _supabase.auth.signOut();
  return { error };
}

/**
 * Get the current user session.
 */
export async function getSession() {
  if (!_supabase) return null;
  const { data: { session } } = await _supabase.auth.getSession();
  return session;
}

/**
 * Get the current user.
 */
export async function getCurrentUser() {
  if (!_supabase) return null;
  const { data: { user } } = await _supabase.auth.getUser();
  return user;
}
