import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { errorMessage, useLoginMutation, useSignupMutation } from "../app/api";
import { Button } from "../components/ui/Button";
import { Logo } from "../components/ui/Logo";
import { useDemoLogin } from "../features/workspace/useDemoLogin";
import { safeNext } from "../lib/redirect";

export default function AuthPage({ mode }: { mode: "signin" | "signup" }) {
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const navigate = useNavigate();
  const [login, loginState] = useLoginMutation();
  const [signup, signupState] = useSignupMutation();
  const demo = useDemoLogin();
  const [error, setError] = useState<string | null>(null);
  const busy = loginState.isLoading || signupState.isLoading;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null);
    try {
      if (mode === "signin") {
        await login({ email: String(f.get("email")), password: String(f.get("password")) }).unwrap();
        navigate(next);
      } else {
        const r = await signup({ name: String(f.get("name")), email: String(f.get("email")), password: String(f.get("password")) }).unwrap();
        navigate(next === "/app" ? `/w/${r.workspaceId}` : next);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const other = mode === "signin" ? "/signup" : "/signin";
  return (
    <main id="main" className="flex min-h-full items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Link to="/" aria-label="TeamOS home">
          <Logo />
        </Link>
        <h1 className="mt-8 text-2xl font-semibold">{mode === "signin" ? "Sign in" : "Create your account"}</h1>
        <p className="mt-1 text-muted">
          {mode === "signin" ? "Welcome back." : "You'll start with a workspace and a short getting-started project."}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <label className="block">
              <span className="text-sm font-semibold">Name</span>
              <input name="name" required maxLength={60} autoComplete="name" className="field mt-1" />
            </label>
          )}
          <label className="block">
            <span className="text-sm font-semibold">Email</span>
            <input name="email" type="email" required autoComplete="email" className="field mt-1" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Password</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className="field mt-1"
            />
            {mode === "signup" && <span className="mt-1 block text-[13px] text-muted">At least 8 characters.</span>}
          </label>
          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={busy} className="w-full">
            {busy ? "Just a moment…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3 text-[13px] text-muted">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>
        <Button onClick={demo.start} disabled={demo.busy} className="w-full">
          {demo.label}
        </Button>
        {demo.error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {demo.error}
          </p>
        )}
        <p className="mt-6 text-sm text-muted">
          {mode === "signin" ? "New here? " : "Already have an account? "}
          <Link to={`${other}${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-pine underline underline-offset-4">
            {mode === "signin" ? "Create an account" : "Sign in"}
          </Link>
        </p>
      </div>
    </main>
  );
}
