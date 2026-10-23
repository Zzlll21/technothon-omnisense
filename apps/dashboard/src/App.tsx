import { lazy, Suspense, useEffect } from "react";
import { PrivateHybridAccess } from "./components/PrivateHybridAccess";

const SpatialDashboard = lazy(() => import("./pages/SpatialDashboard").then(module => ({ default: module.SpatialDashboard })));

function LandingEntry() {
  useEffect(() => { window.location.replace(`/landing/${window.location.search}${window.location.hash}`); }, []);
  return <p role="status">Opening OmniSense… <a href="/landing/">Visit the landing page</a></p>;
}

export function App() {
  const query = new URLSearchParams(window.location.search);
  // Public landing navigation must complete before a memory-only workspace session begins.
  // Existing spatial bookmarks remain protected; login mounts the workspace directly without a redirect.
  if (["/", "/index.html"].includes(window.location.pathname) && query.get("experience") !== "spatial" && !query.has("view")) return <LandingEntry />;
  return <PrivateHybridAccess><Suspense fallback={<p role="status">Opening floor overview…</p>}><SpatialDashboard /></Suspense></PrivateHybridAccess>;
}
