import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useMeQuery, useWorkspacesQuery } from "./app/api";
import { Toasts } from "./components/ui/Toasts";
import { useServerAwake, WakingServer } from "./components/ui/WakingServer";
import Landing from "./pages/Landing";
import AuthPage from "./pages/AuthPage";
import NotFound from "./pages/NotFound";

// The workspace app (drag-and-drop, sockets) loads only after sign-in.
const AppShell = lazy(() => import("./pages/AppShell"));
const WorkspaceHome = lazy(() => import("./pages/WorkspaceHome"));
const ProjectPage = lazy(() => import("./pages/ProjectPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const JoinPage = lazy(() => import("./pages/JoinPage"));

const Loading = () => <WakingServer seconds={null} failed={false} />;

/** Waits for the (possibly sleeping) API, then requires a session. */
function RequireAuth({ children }: { children: ReactNode }) {
  const server = useServerAwake();
  const location = useLocation();
  const me = useMeQuery(undefined, { skip: !server.awake });
  if (!server.awake) return <WakingServer seconds={server.seconds} failed={server.failed} />;
  if (me.isLoading || me.isUninitialized) return <Loading />;
  if (me.isError || !me.data) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/signin?next=${next}`} replace />;
  }
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}

/** /app → the first workspace you belong to. */
function FirstWorkspace() {
  const { data, isLoading } = useWorkspacesQuery();
  if (isLoading || !data) return <Loading />;
  if (!data.length) return <Navigate to="/signin" replace />;
  return <Navigate to={`/w/${data[0].id}`} replace />;
}

export default function App() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signin" element={<AuthPage mode="signin" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/app" element={<RequireAuth><FirstWorkspace /></RequireAuth>} />
        <Route path="/join/:code" element={<RequireAuth><JoinPage /></RequireAuth>} />
        <Route path="/w/:workspaceId" element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route index element={<WorkspaceHome />} />
          <Route path="p/:projectId" element={<ProjectPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toasts />
    </>
  );
}
