"use client";

import { useState } from "react";
import { useLogin, useRegister } from "@/lib/hooks";
import { useRush } from "@/lib/store";
import {
  ChevronLeft,
  Loader2,
  Mail,
  Lock,
  User as UserIcon,
  Phone,
  MapPin,
} from "lucide-react";
import { isFirebaseConfigured } from "@/lib/auth-providers/firebase-client";
import { signInWithGoogle } from "@/lib/auth-providers/google";
import { toAppError } from "@/lib/errors";

type Mode = "login" | "register";

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");

  const [error, setError] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);

  const loginMut = useLogin();
  const registerMut = useRegister();
  const { pushToast, back } = useRush();

  const loading =
    loginMut.isPending ||
    registerMut.isPending ||
    googleLoading;

  const handleBack = () => {
    back();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      if (mode === "login") {
        await loginMut.mutateAsync({
          email,
          password,
        });

        pushToast({
          title: "Welcome back!",
        });
      } else {
        await registerMut.mutateAsync({
          name,
          email,
          password,
          phone,
          location,
        });

        pushToast({
          title: "Account created!",
          description: "Welcome to Rush.",
        });
      }

      window.location.href = "/";
    } catch (err: any) {
      setError(toAppError(err).message);
    }
  };

  /**
   * Google sign-in.
   *
   * The guard is important because Firebase's popup flow must only
   * have one active popup attempt at a time.
   */
  const handleGoogle = async () => {
    // Prevent double-clicks / repeated submissions while a popup
    // authentication attempt is already running.
    if (googleLoading) {
      return;
    }

    setError("");
    setGoogleLoading(true);

    try {
      await signInWithGoogle();

      pushToast({
        title: "Welcome to Rush!",
      });

      // The backend has created the RUSH session cookie.
      window.location.href = "/";
    } catch (err: any) {
      setError(toAppError(err).message);
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="rush-gradient px-6 pt-12 pb-10 text-white relative overflow-hidden">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -left-6 -bottom-12 h-32 w-32 rounded-full bg-white/10" />

        <button
          onClick={handleBack}
          className="absolute top-4 left-4 h-9 w-9 rounded-full bg-white/15 backdrop-blur-sm hover:bg-white/25 flex items-center justify-center transition-colors"
          aria-label="Go back"
          type="button"
        >
          <ChevronLeft className="h-5 w-5 text-white" />
        </button>

        <div className="relative">
          <div className="flex items-center gap-2 mb-6">
            <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <span className="text-white font-extrabold text-lg">
                R
              </span>
            </div>

            <span className="font-extrabold text-2xl tracking-tight">
              rush
            </span>
          </div>

          <h1 className="text-2xl font-extrabold leading-tight">
            {mode === "login"
              ? "Welcome back"
              : "Create your account"}
          </h1>

          <p className="text-sm opacity-90 mt-1">
            One account. Shop, sell, offer services, and ride.
          </p>
        </div>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="flex-1 px-6 pt-6 pb-10 space-y-4"
      >
        {/* Google Sign-In */}
        {isFirebaseConfigured && (
          <>
            <button
              type="button"
              onClick={handleGoogle}
              disabled={loading}
              aria-busy={googleLoading}
              className="w-full h-12 rounded-xl bg-white border border-border text-ink font-bold text-sm flex items-center justify-center gap-2.5 hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {googleLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GoogleIcon />
              )}

              {googleLoading
                ? "Signing in..."
                : "Continue with Google"}
            </button>

            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px bg-border" />

              <span className="text-[10px] font-semibold text-ink-soft uppercase">
                or
              </span>

              <div className="flex-1 h-px bg-border" />
            </div>
          </>
        )}

        {/* Registration fields */}
        {mode === "register" && (
          <>
            <Field
              icon={<UserIcon className="h-4 w-4" />}
              label="Full name"
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jesuloluwa Adeyemi"
                required
                className="auth-input"
                autoComplete="name"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field
                icon={<Phone className="h-4 w-4" />}
                label="Phone"
              >
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+234 803..."
                  className="auth-input"
                  autoComplete="tel"
                />
              </Field>

              <Field
                icon={<MapPin className="h-4 w-4" />}
                label="Location"
              >
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Yaba, Lagos"
                  className="auth-input"
                  autoComplete="address-level2"
                />
              </Field>
            </div>
          </>
        )}

        {/* Email */}
        <Field
          icon={<Mail className="h-4 w-4" />}
          label="Email"
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            required
            className="auth-input"
            autoComplete="email"
          />
        </Field>

        {/* Password */}
        <Field
          icon={<Lock className="h-4 w-4" />}
          label="Password"
        >
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
            className="auth-input"
            autoComplete={
              mode === "login"
                ? "current-password"
                : "new-password"
            }
          />
        </Field>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive font-medium">
            {error}
          </div>
        )}

        {/* Email/password submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full h-12 rounded-xl rush-gradient text-white font-bold text-sm shadow-rush flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {(loginMut.isPending || registerMut.isPending) && (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}

          {mode === "login"
            ? "Log in"
            : "Create account"}
        </button>

        {/* Switch mode */}
        <p className="text-center text-xs text-ink-soft pt-2">
          {mode === "login"
            ? "Don't have an account? "
            : "Already have an account? "}

          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setMode(
                mode === "login"
                  ? "register"
                  : "login",
              );
              setError("");
            }}
            className="font-bold text-rush disabled:opacity-50"
          >
            {mode === "login"
              ? "Sign up"
              : "Log in"}
          </button>
        </p>
      </form>

      <style jsx>{`
        :global(.auth-input) {
          width: 100%;
          background: var(--muted);
          border-radius: 0.75rem;
          padding: 0.75rem 0.875rem 0.75rem 2.25rem;
          font-size: 0.875rem;
          color: var(--ink);
          outline: none;
        }

        :global(.auth-input:focus) {
          box-shadow:
            0 0 0 2px
            color-mix(
              in oklch,
              var(--rush) 30%,
              transparent
            );
        }

        :global(.auth-input::placeholder) {
          color: var(--ink-soft);
        }
      `}</style>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />

      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
      />

      <path
        fill="#FBBC05"
        d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V6.958H.957C.347 8.173 0 9.548 0 11s.348 2.827.957 4.042l3.007-2.332z"
      />

      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-ink mb-1.5">
        {label}
      </label>

      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft">
          {icon}
        </div>

        {children}
      </div>
    </div>
  );
}
