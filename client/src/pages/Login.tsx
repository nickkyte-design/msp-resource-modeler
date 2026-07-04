import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { signIn, signUp, signInWithMagicLink } from '@/lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'signin' | 'signup' | 'magic'>('signin');
  const [, navigate] = useLocation();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const { error: err } = await signIn(email, password);
      if (err) {
        setError(err.message);
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const { error: err } = await signUp(email, password);
      if (err) {
        setError(err.message);
      } else {
        setError('Check your email to confirm your account!');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const { error: err } = await signInWithMagicLink(email);
      if (err) {
        setError(err.message);
      } else {
        setError('Check your email for the magic link!');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Team Rota</CardTitle>
          <CardDescription>
            {mode === 'signin' && 'Sign in to your account'}
            {mode === 'signup' && 'Create a new account'}
            {mode === 'magic' && 'Sign in with a magic link'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={mode === 'signin' ? handleSignIn : mode === 'signup' ? handleSignUp : handleMagicLink} className="space-y-4">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
            {(mode === 'signin' || mode === 'signup') && (
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <Loader2 className="animate-spin" /> : mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Sign Up' : 'Send Magic Link'}
            </Button>
          </form>
          <div className="mt-4 space-y-2 text-sm">
            {mode !== 'signin' && (
              <button onClick={() => setMode('signin')} className="w-full text-slate-600 hover:text-slate-900">
                Back to Sign In
              </button>
            )}
            {mode !== 'signup' && (
              <button onClick={() => setMode('signup')} className="w-full text-slate-600 hover:text-slate-900">
                Don't have an account? Sign up
              </button>
            )}
            {mode !== 'magic' && (
              <button onClick={() => setMode('magic')} className="w-full text-slate-600 hover:text-slate-900">
                Use magic link instead
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
