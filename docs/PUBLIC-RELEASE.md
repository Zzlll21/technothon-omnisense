# Stable public submission boundaries

This branch retains the existing public Git ancestry and combines the completed
Spatial UI, exact-run Hybrid readers, refined login/navigation, deployment source,
and validated Supervisor diagnostics. Unfinished PMV code and migration 004 are
excluded. Original development worktrees remain independent and unchanged.

The submission is real sensor ingestion plus a read-only authenticated monitoring
product. It is not physical HVAC control, a validated comfort model, a trained
forecast service, calibrated sensing coverage or measured energy savings.

## Public-history review

The retained engineering history includes sanitized fixture telemetry, synthetic
design screenshots, public-source code, migration text and historical engineering
reports. Some older reports record non-secret project references, run IDs and test
account identifiers. Removing a file at the tip cannot remove its ancestor version.
No secrets, populated target registries, private target manifests, environment files
or new raw live-session artifacts may be included in the release ancestry.

Automated scans must inspect HEAD ancestry and every candidate/index blob. Review
all findings without printing values; deliberate offline test tokens are fixtures,
not operational credentials. Keep additional local validation logs/audit evidence
outside the source worktree. Compare the final built static assets against known
private configuration values and run the existing static-output allowlist audit.

## Review and publishing

Do not use `git add .`, `git push --all` or a force push. Review each staged diff,
run offline validation and the public-release audit, and confirm the registry is
empty before committing. Request approval before any remote push or Pull Request.
The intended PR base is `main`; organizers should ultimately see the approved
submission from the default branch. No push, merge or deployment is implicit.

Keep Vercel Git integration disconnected. The existing audited prebuilt deployment
does not change when local release commits are prepared. Packaging is local-only;
deployment remains a separate authorization.
