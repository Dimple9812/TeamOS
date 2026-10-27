import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { errorMessage, useInvitePreviewQuery, useJoinWorkspaceMutation } from "../app/api";
import { Button } from "../components/ui/Button";
import { Logo } from "../components/ui/Logo";

export default function JoinPage() {
  const { code = "" } = useParams();
  const preview = useInvitePreviewQuery(code);
  const [join, { isLoading, error }] = useJoinWorkspaceMutation();
  const navigate = useNavigate();

  if (preview.data?.alreadyMember) return <Navigate to={`/w/${preview.data.workspace.id}`} replace />;

  return (
    <main id="main" className="flex min-h-full items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm text-center">
        <Logo />
        {preview.isLoading && <p className="mt-8 text-muted">Checking the invite…</p>}
        {preview.isError && (
          <>
            <h1 className="mt-8 text-2xl font-semibold">This invite doesn't work</h1>
            <p className="mt-2 text-muted">{errorMessage(preview.error)} Ask whoever sent it for a new link.</p>
            <Link to="/app" className="mt-6 inline-block font-semibold text-pine underline underline-offset-4">
              Go to your workspace
            </Link>
          </>
        )}
        {preview.data && (
          <>
            <h1 className="mt-8 text-2xl font-semibold">Join {preview.data.workspace.name}</h1>
            <p className="mt-2 text-muted">
              {preview.data.workspace.memberCount} member{preview.data.workspace.memberCount === 1 ? "" : "s"}. You'll join as a member.
            </p>
            {error && <p className="mt-3 text-sm text-danger">{errorMessage(error)}</p>}
            <Button
              variant="primary"
              className="mt-6 w-full"
              disabled={isLoading}
              onClick={async () => {
                const ws = await join(code).unwrap();
                navigate(`/w/${ws.id}`);
              }}
            >
              Join workspace
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
