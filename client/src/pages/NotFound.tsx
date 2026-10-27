import { Link } from "react-router-dom";
import { Logo } from "../components/ui/Logo";

export default function NotFound() {
  return (
    <main id="main" className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo />
      <h1 className="text-2xl font-semibold">This page doesn't exist</h1>
      <p className="text-muted">The link may be old, or the project was deleted.</p>
      <Link to="/app" className="font-semibold text-pine underline underline-offset-4">
        Go to your workspace
      </Link>
    </main>
  );
}
