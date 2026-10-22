import { lazy, Suspense, useEffect } from "react";

const SpatialDashboard = lazy(() => import("./pages/SpatialDashboard").then(module => ({ default: module.SpatialDashboard })));

function LandingEntry() {
  useEffect(() => { window.location.replace(`/landing/${window.location.search}${window.location.hash}`); }, []);
  return <p role="status">Opening OmniSense… <a href="/landing/">Visit the landing page</a></p>;
}

export function App() {
  const query = new URLSearchParams(window.location.search);
  // Existing bookmarked spatial URLs continue to work; new visitors enter through the landing page.
  if (["/", "/index.html"].includes(window.location.pathname) && query.get("experience") !== "spatial" && !query.has("view")) return <LandingEntry />;
  return <Suspense fallback={<p role="status">Opening floor overview…</p>}><SpatialDashboard /></Suspense>;
}
