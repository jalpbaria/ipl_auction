import { AlertTriangle, ArrowLeft, Eye, EyeOff, Loader2, Lock, ShieldCheck } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { EnvErrorScreen } from '../components/EnvErrorScreen';
import { BrandedSessionLoader } from '../components/auth/ProtectedRoute';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { CornerBrackets } from '../components/ui/CornerBrackets';
import { FormField, INPUT_BASE_CLASS } from '../components/ui/FormField';
import { isSupabaseConfigured, missingSupabaseEnvVars, supabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth';
import { useToastStore } from '../store/toast';

type AuthTab = 'signin' | 'signup';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapAuthError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Authentication failed. Please try again.';

  const msg = raw.toLowerCase();

  if (
    msg.includes('invalid login credentials') ||
    msg.includes('invalid credentials') ||
    msg.includes('wrong password')
  ) {
    return 'Incorrect email or password. Double-check your credentials and try again.';
  }
  if (
    msg.includes('already registered') ||
    msg.includes('user already exists') ||
    msg.includes('already been registered')
  ) {
    return 'An account with this email is already registered. Switch to "Sign in" to continue.';
  }
  if (msg.includes('password') && (msg.includes('weak') || msg.includes('short') || msg.includes('at least'))) {
    return 'Password is too weak. Choose at least 8 characters with a mix of letters and numbers.';
  }
  if (
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout')
  ) {
    return 'Network error: unable to reach the authentication server. Check your connection and retry.';
  }
  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'Too many attempts in a short period. Wait a moment before trying again.';
  }

  return raw;
}

export default function Login() {
  const navigate = useNavigate();

  const session = useAuthStore((s) => s.session);
  const authLoading = useAuthStore((s) => s.loading);
  const kickedMessage = useAuthStore((s) => s.kickedMessage);
  const completeAuthSession = useAuthStore((s) => s.completeAuthSession);
  const clearKickedMessage = useAuthStore((s) => s.clearKickedMessage);
  const showToast = useToastStore((s) => s.showToast);

  const [tab, setTab] = useState<AuthTab>('signin');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Sign-in fields
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');

  // Create-account fields
  const [fullName, setFullName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Inline field errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setFormError(null);
    setFieldErrors({});
  }, [tab]);

  if (!isSupabaseConfigured || !supabase) {
    return (
      <EnvErrorScreen
        missingVars={missingSupabaseEnvVars}
        routeLabel="Authentication (/login)"
      />
    );
  }

  if (authLoading) {
    return <BrandedSessionLoader />;
  }

  if (session && !submitting) {
    return <Navigate to="/" replace />;
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    clearKickedMessage();
    setFormError(null);

    const errors: Record<string, string> = {};
    const email = signInEmail.trim();

    if (!email) {
      errors.signInEmail = 'Email is required.';
    } else if (!EMAIL_REGEX.test(email)) {
      errors.signInEmail = 'Enter a valid email address.';
    }

    if (!signInPassword) {
      errors.signInPassword = 'Password is required.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);

    try {
      const { data, error } = await supabase!.auth.signInWithPassword({
        email,
        password: signInPassword,
      });

      if (error) {
        setFormError(mapAuthError(error));
        return;
      }

      if (!data.session) {
        setFormError('No active session was returned. Please try signing in again.');
        return;
      }

      await completeAuthSession(data.session);
      showToast({
        title: 'Signed in',
        description: 'Device session registered. Start Game is ready on the landing page.',
        tone: 'success',
      });
      navigate('/', { replace: true });
    } catch (err) {
      setFormError(mapAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearKickedMessage();
    setFormError(null);

    const errors: Record<string, string> = {};
    const trimmedName = fullName.trim();
    const email = signUpEmail.trim();

    if (!trimmedName) {
      errors.fullName = 'Full name is required.';
    } else if (trimmedName.length < 2) {
      errors.fullName = 'Enter at least 2 characters.';
    }

    if (!email) {
      errors.signUpEmail = 'Email is required.';
    } else if (!EMAIL_REGEX.test(email)) {
      errors.signUpEmail = 'Enter a valid email address.';
    }

    if (!signUpPassword) {
      errors.signUpPassword = 'Password is required.';
    } else if (signUpPassword.length < 8) {
      errors.signUpPassword = 'Password must be at least 8 characters.';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Confirm your password.';
    } else if (confirmPassword !== signUpPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);

    try {
      const { data, error } = await supabase!.auth.signUp({
        email,
        password: signUpPassword,
        options: {
          data: {
            full_name: trimmedName,
          },
        },
      });

      if (error) {
        setFormError(mapAuthError(error));
        return;
      }

      if (!data.session) {
        setFormError(
          'Account created, but no session was returned. Check your project auth settings or try signing in.',
        );
        return;
      }

      await completeAuthSession(data.session);
      showToast({
        title: 'Account created',
        description: 'Welcome to IPL Auction. Your device session is active.',
        tone: 'success',
      });
      navigate('/', { replace: true });
    } catch (err) {
      setFormError(mapAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070B14] text-[#E8ECF4] hero-gold-diagonal flex flex-col">
      {/* Compact Top Bar */}
      <header className="border-b border-white/[0.08] bg-[#070B14]">
        <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="font-display text-2xl sm:text-[28px] tracking-[0.06em] text-[#E8ECF4] whitespace-nowrap shrink-0"
          >
            IPL <span className="text-[#F5B921]">AUCTION</span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA] transition-colors hover:text-[#E8ECF4]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Landing</span>
          </Link>
        </div>
      </header>

      {/* Split Layout */}
      <main className="mx-auto flex w-full max-w-[1360px] flex-1 items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid w-full grid-cols-1 gap-8 lg:grid-cols-12 lg:items-stretch lg:gap-10">
          {/* Left Branding Panel */}
          <section className="relative flex flex-col justify-between rounded-[4px] border border-white/[0.08] bg-[#0E1524] p-7 sm:p-10 lg:col-span-6">
            <CornerBrackets tone="gold" size="md" />

            <div>
              <div className="inline-flex items-center gap-2 rounded-[2px] border border-[#F5B921]/35 bg-[#141C2F] px-2.5 py-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#F5B921]">
                  AUCTION CORE
                </span>
                <span className="text-white/20" aria-hidden="true">
                  /
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#22D3EE]">
                  ACCESS GATE
                </span>
              </div>

              <h1 className="mt-6 font-display text-5xl sm:text-6xl leading-[0.95] tracking-[0.02em] text-[#E8ECF4]">
                AUTHENTICATE YOUR{' '}
                <span className="bg-gradient-to-r from-[#22D3EE] to-[#F5B921] bg-clip-text text-transparent">
                  FRANCHISE
                </span>{' '}
                DESK
              </h1>

              <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-[#8B95AA]">
                Sign in or create your tournament account to host an auction room, claim a
                franchise table with a one-time code, and compete live on the 20-second
                bidding clock.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-3 border-t border-white/[0.08] pt-6 sm:grid-cols-3">
              <div className="rounded-[4px] border border-white/[0.08] bg-[#070B14] p-3.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#F5B921]">
                  DEVICE CAP
                </p>
                <p className="mt-1 font-mono text-sm font-semibold text-[#E8ECF4] tabular-nums">
                  05 ACTIVE MAX
                </p>
              </div>
              <div className="rounded-[4px] border border-white/[0.08] bg-[#070B14] p-3.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#22D3EE]">
                  HEARTBEAT
                </p>
                <p className="mt-1 font-mono text-sm font-semibold text-[#E8ECF4] tabular-nums">
                  45 SEC SYNC
                </p>
              </div>
              <div className="rounded-[4px] border border-white/[0.08] bg-[#070B14] p-3.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                  POST-AUTH
                </p>
                <p className="mt-1 font-mono text-sm font-semibold text-[#E8ECF4]">
                  HOST / JOIN
                </p>
              </div>
            </div>
          </section>

          {/* Right Form Panel */}
          <section className="flex flex-col justify-center lg:col-span-6">
            {kickedMessage && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-3 rounded-[4px] border border-red-500/50 bg-red-500/10 p-4"
              >
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                <div className="flex-1">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-red-300">
                    SESSION TERMINATED
                  </p>
                  <p className="mt-1 text-sm text-[#E8ECF4]">{kickedMessage}</p>
                </div>
              </div>
            )}

            <Card brackets bracketTone="cyan" className="p-6 sm:p-8">
              {/* Segmented Tabs */}
              <div
                role="tablist"
                aria-label="Authentication mode"
                className="grid grid-cols-2 gap-1.5 rounded-[4px] border border-white/[0.08] bg-[#070B14] p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'signin'}
                  onClick={() => setTab('signin')}
                  disabled={submitting}
                  className={`rounded-[2px] py-2.5 font-mono text-xs uppercase tracking-[0.1em] transition-colors ${
                    tab === 'signin'
                      ? 'bg-[#22D3EE] font-semibold text-[#070B14]'
                      : 'text-[#8B95AA] hover:text-[#E8ECF4]'
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'signup'}
                  onClick={() => setTab('signup')}
                  disabled={submitting}
                  className={`rounded-[2px] py-2.5 font-mono text-xs uppercase tracking-[0.1em] transition-colors ${
                    tab === 'signup'
                      ? 'bg-[#F5B921] font-semibold text-[#070B14]'
                      : 'text-[#8B95AA] hover:text-[#E8ECF4]'
                  }`}
                >
                  Create account
                </button>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-3xl tracking-wide text-[#E8ECF4]">
                    {tab === 'signin' ? 'SIGN IN TO YOUR DESK' : 'CREATE TOURNAMENT ACCOUNT'}
                  </h2>
                  <Lock className="h-4 w-4 text-[#8B95AA]" aria-hidden="true" />
                </div>
                <p className="mt-1 text-xs text-[#8B95AA]">
                  {tab === 'signin'
                    ? 'Enter your registered email and password to restore your franchise desk.'
                    : 'Register once to host rooms or lead a participating IPL franchise.'}
                </p>
              </div>

              {tab === 'signin' ? (
                <form onSubmit={handleSignIn} noValidate className="mt-6 space-y-4">
                  <FormField
                    id="signin-email"
                    label="Email address"
                    required
                    error={fieldErrors.signInEmail}
                  >
                    <input
                      id="signin-email"
                      type="email"
                      autoComplete="email"
                      value={signInEmail}
                      disabled={submitting}
                      onChange={(e) => setSignInEmail(e.target.value)}
                      placeholder="captain@college.edu"
                      aria-invalid={Boolean(fieldErrors.signInEmail)}
                      className={INPUT_BASE_CLASS}
                    />
                  </FormField>

                  <FormField
                    id="signin-password"
                    label="Password"
                    required
                    error={fieldErrors.signInPassword}
                  >
                    <div className="relative">
                      <input
                        id="signin-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={signInPassword}
                        disabled={submitting}
                        onChange={(e) => setSignInPassword(e.target.value)}
                        placeholder="Enter your password"
                        aria-invalid={Boolean(fieldErrors.signInPassword)}
                        className={`${INPUT_BASE_CLASS} pr-10`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-[2px] p-1 text-[#8B95AA] hover:text-[#E8ECF4]"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </FormField>

                  {formError && (
                    <div
                      role="alert"
                      className="rounded-[4px] border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300"
                    >
                      {formError}
                    </div>
                  )}

                  <Button
                    type="submit"
                    variant="cyan"
                    size="lg"
                    disabled={submitting}
                    className="mt-2 w-full"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Signing in...</span>
                      </>
                    ) : (
                      <span>Sign in</span>
                    )}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleSignUp} noValidate className="mt-6 space-y-4">
                  <FormField
                    id="signup-name"
                    label="Full name"
                    required
                    error={fieldErrors.fullName}
                  >
                    <input
                      id="signup-name"
                      type="text"
                      autoComplete="name"
                      value={fullName}
                      disabled={submitting}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Aarav Sharma"
                      aria-invalid={Boolean(fieldErrors.fullName)}
                      className={INPUT_BASE_CLASS}
                    />
                  </FormField>

                  <FormField
                    id="signup-email"
                    label="Email address"
                    required
                    error={fieldErrors.signUpEmail}
                  >
                    <input
                      id="signup-email"
                      type="email"
                      autoComplete="email"
                      value={signUpEmail}
                      disabled={submitting}
                      onChange={(e) => setSignUpEmail(e.target.value)}
                      placeholder="captain@college.edu"
                      aria-invalid={Boolean(fieldErrors.signUpEmail)}
                      className={INPUT_BASE_CLASS}
                    />
                  </FormField>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      id="signup-password"
                      label="Password"
                      hint="MIN 8 CHARS"
                      required
                      error={fieldErrors.signUpPassword}
                    >
                      <input
                        id="signup-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={signUpPassword}
                        disabled={submitting}
                        onChange={(e) => setSignUpPassword(e.target.value)}
                        placeholder="Minimum 8 chars"
                        aria-invalid={Boolean(fieldErrors.signUpPassword)}
                        className={INPUT_BASE_CLASS}
                      />
                    </FormField>

                    <FormField
                      id="signup-confirm"
                      label="Confirm password"
                      required
                      error={fieldErrors.confirmPassword}
                    >
                      <input
                        id="signup-confirm"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirmPassword}
                        disabled={submitting}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        aria-invalid={Boolean(fieldErrors.confirmPassword)}
                        className={INPUT_BASE_CLASS}
                      />
                    </FormField>
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[#8B95AA] hover:text-[#E8ECF4]"
                    >
                      {showPassword ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      <span>{showPassword ? 'Hide passwords' : 'Show passwords'}</span>
                    </button>
                    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[#8B95AA]">
                      <ShieldCheck className="h-3.5 w-3.5 text-[#22D3EE]" />
                      INSTANT SIGN-IN
                    </span>
                  </div>

                  {formError && (
                    <div
                      role="alert"
                      className="rounded-[4px] border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300"
                    >
                      {formError}
                    </div>
                  )}

                  <Button
                    type="submit"
                    variant="gold"
                    size="lg"
                    disabled={submitting}
                    className="mt-2 w-full"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Creating account...</span>
                      </>
                    ) : (
                      <span>Create account</span>
                    )}
                  </Button>
                </form>
              )}
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}
