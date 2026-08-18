from pathlib import Path
import re
import subprocess

root = Path('/home/ubuntu/cutreal-ai-fixed')
backup = Path('/home/ubuntu/cutreal-ai-fixed-backup')

required_files = [
    'index.html', 'style.css', 'workspace.css', 'main.js', 'sandbox.js',
    'workspace.js', 'api/chat.js', 'api/groq-client.js',
    'api/sandbox-agent.js', 'api/workspace-model-client.js',
]
for rel in required_files:
    path = root / rel
    if not path.exists() or path.stat().st_size == 0:
        raise SystemExit(f'Missing or empty required file: {rel}')

html = (root / 'index.html').read_text()
print('CANVAS_COUNT', html.count('id="sandbox-canvas"'))
print('PANEL_RIGHT_COUNT', html.count('class="sbx-panel-right"'))
print('STYLE_BEFORE_WORKSPACE', html.find('href="style.css"') < html.find('href="workspace.css"'))
print('MOBILE_TAB_IDS', all(token in html for token in ('sandbox-tab-chat', 'sandbox-tab-scene', 'sandbox-tab-workspace')))

for rel in ('style.css', 'workspace.css'):
    text = (root / rel).read_text()
    stripped = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    stripped = re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'', '', stripped)
    balance = stripped.count('{') - stripped.count('}')
    print(rel, 'BRACE_BALANCE', balance, 'LINES', len(text.splitlines()))
    if balance != 0:
        raise SystemExit(f'Unbalanced CSS braces in {rel}')

# Heredoc contamination must not be newly introduced. The original source is the baseline.
for rel in ('style.css', 'workspace.css'):
    current = (root / rel).read_text()
    baseline_path = backup / rel
    if baseline_path.exists():
        baseline = baseline_path.read_text()
        for bad in ('CSSEOF', 'style.css written:', 'cat > '):
            current_count = current.count(bad)
            baseline_count = baseline.count(bad)
            print(rel, bad, 'BASELINE', baseline_count, 'CURRENT', current_count)
            if current_count > baseline_count:
                raise SystemExit(f'New forbidden residue {bad!r} in {rel}')

# Provider isolation: normal chat retains Groq; Sandbox transport is OpenRouter-only.
normal = (root / 'api/chat.js').read_text() + (root / 'api/groq-client.js').read_text()
sandbox = (root / 'api/sandbox-agent.js').read_text() + (root / 'api/workspace-model-client.js').read_text()
assert 'groq' in normal.lower() or 'GROQ' in normal
assert 'callGroqWithRotation' not in sandbox
assert 'openrouter.ai/api/v1/chat/completions' in sandbox
assert 'OPENROUTER_API_KEY' in sandbox
assert 'z-ai/glm-5.2:free' in sandbox
assert 'cohere/north-mini-code:free' in sandbox
print('PROVIDER_ISOLATION', 'normal=Groq sandbox=OpenRouter')

# Syntax check all JS files whose behavior was reviewed.
for rel in ('main.js', 'sandbox.js', 'workspace.js', 'api/chat.js', 'api/groq-client.js', 'api/sandbox-agent.js', 'api/workspace-model-client.js'):
    subprocess.run(['node', '--check', str(root / rel)], check=True, stdout=subprocess.DEVNULL)
print('JS_SYNTAX', 'ok')
print('CONSERVATION_VALIDATION', 'ok')
