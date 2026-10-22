import { Dashboard } from "./pages/Dashboard";
import { lazy, Suspense } from "react";

const SpatialDashboard = lazy(() => import("./pages/SpatialDashboard").then(module => ({ default: module.SpatialDashboard })));

export function App() {
  // Integration stays opt-in until the later migration phases are validated.
  if (new URLSearchParams(window.location.search).get("experience") === "spatial") {
    return <Suspense fallback={<p role="status">Opening floor overview…</p>}><SpatialDashboard /></Suspense>;
  }
  return <Dashboard />;
}

