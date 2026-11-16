import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { ArrowLeft, Eye, EyeOff, Info, ShieldCheck } from 'lucide-react';
import { auth, googleProvider } from '../lib/firebase';
import { ensureUserDocument, getBusinessProfileDoc } from '../lib/firestoreRepo';
import { BusinessProfile, User } from '../types/compliance';
import { useToast } from './ToastProvider';

interface AuthViewProps {
  onSuccess: (user: User, businessProfile: BusinessProfile | null) => void;
  onBackToLanding: () => void;
}

type AuthMode = 'login' | 'register' | 'forgot';

function mapFirebaseAuthError(err: unknown): string {
  const code = (err as any)?.code || '';
  const msg = (err as Error)?.message || '';

  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists. Sign in instead or reset your password.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password is too weak. Please use at least 8 characters with letters and numbers.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email address or password. Please check your credentials and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    case 'auth/too-many-requests':
      return 'Too many consecutive attempts. Please wait a moment and try again.';
    case 'auth/popup-closed-by-user':
      return 'Google Sign-In window was closed before completing authentication.';
    case 'auth/popup-blocked':
      return 'Popup was blocked by your browser. Please allow popups for this site to use Google Sign-In.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not yet enabled in Firebase Console (Authentication -> Sign-in method). You can sign in with Google or enable Email/Password in Firebase Console.';
    case 'auth/network-request-failed':
      return 'Network error while connecting to Firebase Authentication. Check your connection and retry.';
    default:
      return msg || 'Authentication failed. Please try again.';
  }
}

export function AuthView({ onSuccess, onBackToLanding }: AuthViewProps) {
  const { notify } = useToast();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const finalizeSignIn = async (fbUser: import('firebase/auth').User, overrideName?: string) => {
    const appUser = await ensureUserDocument(fbUser, overrideName);
    const bp = await getBusinessProfileDoc(appUser.id);
    onSuccess(appUser, bp);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetSent(false);

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (mode === 'register') {
      if (fullName.trim().length < 2) {
        setError('Please enter your full name (at least 2 characters).');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const cred = await signInWithEmailAndPassword(auth, normalizedEmail, password);
        await finalizeSignIn(cred.user);
        notify('Signed in successfully.', 'success');
      } else if (mode === 'register') {
        const trimmedName = fullName.trim();
        const cred = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        await updateProfile(cred.user, { displayName: trimmedName }).catch(() => {});
        sendEmailVerification(cred.user).catch(() => {});
        await finalizeSignIn(cred.user, trimmedName);
        notify('Account created. Welcome to your compliance workspace.', 'success');
      } else if (mode === 'forgot') {
        await sendPasswordResetEmail(auth, normalizedEmail);
        setResetSent(true);
        notify('Password reset link sent if an account exists for that email.', 'info');
      }
    } catch (err) {
      setError(mapFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await finalizeSignIn(cred.user);
      notify('Signed in with Google.', 'success');
    } catch (err) {
      setError(mapFirebaseAuthError(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center overflow-x-clip bg-slate-50 px-4 py-12 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-md">
        <button
          type="button"
          onClick={onBackToLanding}
          className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to overview
        </button>

        <div className="rounded-xl border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-teal-700 dark:text-teal-400">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-xs font-semibold">Pakistan Business Compliance AI</span>
          </div>

          <h1 className="mt-3 font-display text-xl font-bold text-slate-900 dark:text-slate-100">
            {mode === 'login' && 'Sign in to your research workspace'}
            {mode === 'register' && 'Create a compliance workspace'}
            {mode === 'forgot' && 'Reset your password'}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {mode === 'login' && 'Access saved research, compliance checklists, and official-source RAG guidance.'}
            {mode === 'register' && 'Protected by Firebase Authentication and per-account Cloud Firestore isolation.'}
            {mode === 'forgot' && 'Enter your email address to receive a Firebase password reset link.'}
          </p>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          {resetSent && mode === 'forgot' && (
            <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-3.5 py-2.5 text-xs text-teal-900 dark:border-teal-900/50 dark:bg-teal-950/40 dark:text-teal-200">
              Password reset email dispatched. Check your inbox (and spam folder), then return to sign in.
            </div>
          )}

          {mode !== 'forgot' && (
            <>
              <div className="mt-5">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={loading || googleLoading}
                  className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                    />
                  </svg>
                  {googleLoading ? 'Connecting to Google...' : 'Continue with Google'}
                </button>
              </div>

              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200 dark:border-slate-800" />
                </div>
                <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
                  <span className="bg-white px-2.5 text-slate-400 dark:bg-slate-900">or with email</span>
                </div>
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className={mode === 'forgot' ? 'mt-5 space-y-4' : 'space-y-4'}>
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={120}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Bilal Ahmed"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.pk"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            {(mode === 'login' || mode === 'register') && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <div className="relative mt-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={mode === 'login' ? 1 : 8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'register' ? 'Minimum 8 characters' : 'Enter your password'}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 pr-10 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-60"
            >
              {loading
                ? 'Please wait...'
                : mode === 'login'
                ? 'Sign In'
                : mode === 'register'
                ? 'Create Account'
                : 'Send Reset Email'}
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
            {mode === 'login' ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError('');
                  }}
                  className="font-medium text-teal-700 hover:underline dark:text-teal-400"
                >
                  Create an account
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setError('');
                    setResetSent(false);
                  }}
                  className="hover:underline"
                >
                  Forgot password?
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError('');
                  setResetSent(false);
                }}
                className="font-medium text-teal-700 hover:underline dark:text-teal-400"
              >
                Back to sign in
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
            <div className="flex-1 text-xs text-slate-600 dark:text-slate-400">
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                Single-Identity Cloud Persistence
              </p>
              <p className="mt-0.5">
                Register with email/password or Google Sign-In. Your business profile, conversations, saved research, and checklists persist securely in your private Cloud Firestore workspace.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
