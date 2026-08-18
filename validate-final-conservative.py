from pathlib import Path
import subprocess
import difflib

orig = Path('/home/ubuntu/cutreal-ai-original-sources')
cur = Path('/home/ubuntu/cutreal-ai-fixed')
files = [
    'index.html', 'style.css', 'main.js', 'loquendo.js', 'sandbox.js', 'orb.js',
    'api/chat.js', 'api/groq-client.js', 'api/sandbox-agent.js',
    'api/workspace-model-client.js', 'workspace.css', 'workspace.js',
]
unchanged = {'index.html', 'main.js', 'loquendo.js', 'orb.js', 'api/chat.js', 'api/groq-client.js'}
for rel in files:
    if not (orig / rel).exists() or not (cur / rel).exists():
        raise SystemExit(f'Missing file: {rel}')
    a = (orig / rel).read_text()
    b = (cur / rel).read_text()
    if rel in unchanged and a != b:
        raise SystemExit(f'Unexpected change in protected file: {rel}')
    if len(b.splitlines()) < len(a.splitlines()):
        raise SystemExit(f'File was reduced: {rel}')
    diff = list(difflib.ndiff(a.splitlines(), b.splitlines()))
    removed = sum(1 for x in diff if x.startswith('- '))
    added = sum(1 for x in diff if x.startswith('+ '))
    print(rel, 'original_lines=', len(a.splitlines()), 'final_lines=', len(b.splitlines()), 'added=', added, 'removed=', removed)

normal = (cur / 'api/chat.js').read_text() + (cur / 'api/groq-client.js').read_text()
sandbox = (cur / 'api/sandbox-agent.js').read_text() + (cur / 'api/workspace-model-client.js').read_text()
checks = {
    'normal_chat_groq': 'callGroqWithRotation' in normal,
    'sandbox_no_groq_transport': 'callGroqWithRotation' not in sandbox and 'groq-client.js' not in (cur / 'api/sandbox-agent.js').read_text(),
    'sandbox_openrouter_endpoint': 'https://openrouter.ai/api/v1/chat/completions' in sandbox,
    'sandbox_openrouter_key': 'OPENROUTER_API_KEY' in sandbox,
    'sandbox_primary_model': 'z-ai/glm-5.2:free' in sandbox,
    'sandbox_fallback_model': 'cohere/north-mini-code:free' in sandbox,
    'workspace_tools_preserved': 'workspace_files' in (cur / 'api/sandbox-agent.js').read_text() or 'workspace' in (cur / 'api/sandbox-agent.js').read_text(),
    'mobile_sandbox_css': 'PARCHE ADITIVO — MOBILE CUT-REAL / SANDBOX' in (cur / 'style.css').read_text(),
    'mobile_workspace_css': 'PARCHE ADITIVO — WORKSPACE MOBILE' in (cur / 'workspace.css').read_text(),
}
for name, ok in checks.items():
    print(name, 'OK' if ok else 'FAIL')
    if not ok:
        raise SystemExit(f'Failed check: {name}')

for rel in ('main.js', 'sandbox.js', 'workspace.js', 'api/chat.js', 'api/groq-client.js', 'api/sandbox-agent.js', 'api/workspace-model-client.js'):
    subprocess.run(['node', '--check', str(cur / rel)], check=True, stdout=subprocess.DEVNULL)
print('js_syntax OK')
print('final_conservative_validation OK')
