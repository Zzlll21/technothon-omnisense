// Build-only presentation origin. Never edits or broadens the approved database target.
export function withDeploymentOrigin(target, origin, command) {
  if (origin === undefined) return target;
  if (!target || command !== 'build') throw new Error('HYBRID_SITE_ORIGIN requires an approved private production build');
  let parsed;
  try { parsed = new URL(origin); } catch { throw new Error('HYBRID_SITE_ORIGIN must be one exact public HTTPS origin'); }
  const labels = parsed.hostname.split('.');
  if (parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/' ||
      ![parsed.origin, parsed.origin + '/'].includes(origin) || labels.length < 2 ||
      labels.some(label => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) ||
      /^\d+(?:\.\d+){3}$/.test(parsed.hostname) || parsed.hostname.endsWith('.localhost'))
    throw new Error('HYBRID_SITE_ORIGIN must be one exact public HTTPS origin');
  return { url: target.url, run_id: target.run_id, preview_origin: parsed.origin };
}
