"""Read-only public-release gate. No network; findings never include matched values."""
import argparse
import base64
import io
import json
import pathlib
import re
import subprocess
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--private-env', action='append', default=[], help='Optional local dotenv path; values never printed')
args = parser.parse_args()

def git(*parts):
    return subprocess.check_output(['git', '--no-optional-locks', *parts], cwd=ROOT, stderr=subprocess.DEVNULL)

known = []
for name in args.private_env:
    for line in pathlib.Path(name).read_text(encoding='utf-8-sig').splitlines():
        match = re.match(r'\s*([A-Za-z_]\w*)\s*=\s*(.*?)\s*$', line)
        if match and re.search(r'PASSWORD|SECRET|SERVICE_ROLE|TOKEN|MQTT_USERNAME', match[1]):
            value = match[2].strip('\"\'')
            if len(value) >= 8:
                known.append(value.encode())

patterns = [
    ('secret-key', rb'sb_secret_[A-Za-z0-9_-]{12,}'),
    ('github-token', rb'(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})'),
    ('jwt', rb'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}'),
    ('private-key', rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    ('aws-key', rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
    ('credential-url', rb'(?:mqtts?|https?|postgres(?:ql)?)://[^/\s:@]+:[^/\s@]{5,}@'),
]
literal_secret = re.compile(rb'''(?i)(?:password|passwd|service_role_key|secret_key|mqtt_password|access_token|refresh_token|vercel_oidc_token)\s*["']?\s*[:=]\s*["']([^"'\r\n]{8,})["']''')
placeholder = re.compile(rb'(?i)FAKE|OFFLINE|TEST_ONLY|TEST_SECRET|EXAMPLE|PLACEHOLDER|YOUR[-_]|REPLACE|DUMMY|REDACTED')
failures, fixtures, metadata = set(), set(), set()

def report(target, path, kind):
    target.add((path, kind))

def check(path, data, scope):
    label = f'{scope}:{path}'
    leaf = path.rsplit('/', 1)[-1]
    template = leaf.endswith('.example')
    if not template and (leaf == '.env' or leaf.startswith('.env.') or re.match(r'hybrid-.*\.env(?:\.|$)', leaf)):
        report(failures, label, 'private-environment-file')
    if any(part in path.split('/') for part in ['.vercel', 'private', 'runtime-evidence', 'deployment-staging']):
        report(failures, label, 'private-artifact-path')
    if re.search(r'hybrid-target\.(?!example\.json$).+\.json$', leaf):
        report(failures, label, 'private-manifest')
    if leaf == 'approved-hybrid-targets.json':
        try:
            value = json.loads(data)
            if value != {'schema_version': 'omnisense.hybrid-approvals.v1', 'approved': []}:
                report(failures, label, 'populated-or-invalid-approval-registry')
        except (ValueError, UnicodeDecodeError):
            report(failures, label, 'invalid-approval-registry')
    for kind, expression in patterns:
        for match in re.finditer(expression, data):
            value = match[0]
            if placeholder.search(value):
                report(fixtures, label, kind)
                continue
            if kind == 'credential-url' and '/test/' in '/' + path and re.search(rb'://user:(?:pass|password)@', value):
                report(fixtures, label, kind)
                continue
            if kind == 'jwt':
                try:
                    claim = json.loads(base64.urlsafe_b64decode(value.split(b'.')[1] + b'==='))
                    if claim.get('role') == 'anon':
                        report(metadata, label, 'public-anon-key')
                        continue
                except (ValueError, UnicodeDecodeError):
                    pass
            report(failures, label, kind)
    for match in literal_secret.finditer(data):
        value = match[1]
        # Prose/error strings and expressions are not credential literals.
        if re.search(rb'[{}();\\]|=>|\s', value):
            continue
        if placeholder.search(value) or '/test/' in '/' + path:
            report(fixtures, label, 'literal-secret-reviewed-fixture')
        else:
            report(failures, label, 'literal-secret-review-required')
    # Exact comparisons include binary metadata. Encoding alphabets/common numeric
    # examples are reported for review rather than represented as credential leaks.
    comparable = re.sub(rb'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789[+/_-]{0,2}', b'', data)
    for value in known:
        if value not in comparable:
            continue
        if value.isdigit() and not re.search(rb'(?<![0-9])' + re.escape(value) + rb'(?![0-9.])', comparable):
            report(metadata, label, 'numeric-example-private-value-collision')
        else:
            report(failures, label, 'exact-local-private-value')
    if zipfile.is_zipfile(io.BytesIO(data)):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for member in archive.infolist():
                if not member.is_dir():
                    if member.file_size > 20_000_000:
                        report(failures, label, 'archive-member-requires-manual-review')
                    else:
                        check(path + '/' + member.filename, archive.read(member), scope)

paths = [p for p in git('ls-files', '-z').decode().split('\0') if p]
others = [p for p in git('ls-files', '--others', '--exclude-standard', '-z').decode().split('\0') if p]
for path in sorted(set(paths + others)):
    file = ROOT / path
    if file.is_file():
        check(path, file.read_bytes(), 'worktree')

objects = git('rev-list', '--objects', 'HEAD').decode().splitlines()
batch = subprocess.Popen(['git', 'cat-file', '--batch'], cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE)
history_blobs = 0
for row in objects:
    oid, _, path = row.partition(' ')
    batch.stdin.write((oid + '\n').encode())
    batch.stdin.flush()
    header = batch.stdout.readline().decode().split()
    if len(header) != 3:
        raise RuntimeError('Unreadable Git object')
    data = batch.stdout.read(int(header[2]))
    batch.stdout.read(1)
    if header[1] == 'blob':
        history_blobs += 1
        check(path, data, 'history')
    elif header[1] in ['commit', 'tag']:
        check('git-message', data, 'history')
batch.stdin.close()
if batch.wait():
    raise RuntimeError('Git history audit failed')

index_batch = subprocess.Popen(['git', 'cat-file', '--batch'], cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE)
for row in git('ls-files', '--stage', '-z').decode().split('\0'):
    if not row:
        continue
    details, path = row.split('\t', 1)
    _, oid, stage = details.split()
    if stage != '0':
        raise RuntimeError('Resolve index conflicts before auditing')
    index_batch.stdin.write((oid + '\n').encode())
    index_batch.stdin.flush()
    header = index_batch.stdout.readline().decode().split()
    if len(header) != 3 or header[1] != 'blob':
        raise RuntimeError('Unreadable index object')
    data = index_batch.stdout.read(int(header[2]))
    index_batch.stdout.read(1)
    check(path, data, 'index')
index_batch.stdin.close()
if index_batch.wait():
    raise RuntimeError('Git index audit failed')

print(json.dumps({
    'head': git('rev-parse', 'HEAD').decode().strip(),
    'history_commits': int(git('rev-list', '--count', 'HEAD')),
    'history_blobs': history_blobs,
    'index_files': len(paths),
    'candidate_files': len(set(paths + others)),
    'failures': [dict(path=p, kind=k) for p, k in sorted(failures)],
    'fixture_findings': len(fixtures),
    'review_notes': [dict(path=p, kind=k) for p, k in sorted(metadata)],
    'limitations': 'No screenshot OCR, credential-strength analysis or hosted permission verification.'
}, indent=2))
sys.exit(1 if failures else 0)
