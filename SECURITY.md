# Public repository security

This repository is intentionally public. Every reachable commit, test and asset
must be safe for public access. Private deployment is not a substitute for
repository hygiene or database authorization.

- Commit only placeholder environment templates. Never commit real secrets,
  reader passwords/sessions, firmware credentials or Vercel OIDC tokens.
- Keep private approved manifests out of Git. The tracked approval registry must
  contain an empty `approved` array; never stage its populated local version.
  `.gitignore` does not protect an already tracked registry.
- Do not add raw database exports, packet captures or runtime logs/screenshots.
  Historical engineering reports contain non-secret identifiers, not credentials
  or permission grants.
- The frontend accepts a publishable key only. Backend keys belong only in the
  separate Writer. Keep exact origins, memory-only sessions, RLS and exact-run ACLs.
- Run `python scripts/audit-public-release.py` before and after staging and
  against the final release commit. It checks reachable history, the index and
  candidate files without printing matched credential values.
- Private-value comparisons and binary/screenshot review are still required by
  the operator before a public push. Automated detection cannot prove arbitrary
  data safe to publish.

If a real credential is found in history, stop release and notify its owner
privately. Revoke/rotate it under separate authorization. Deleting a later version
does not remove history. Never post credentials in public issues, rewrite public
history or force-push without a separately approved incident plan.
