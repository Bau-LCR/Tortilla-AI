from pathlib import Path
from collections import Counter
import re

root = Path('/home/ubuntu/cutreal-ai-fixed')
html = (root / 'index.html').read_text()
css_files = [root / 'style.css', root / 'workspace.css']

# IDs duplicados: el canvas duplicado del Sandbox debe haber quedado eliminado.
ids = re.findall(r'\bid=["\']([^"\']+)["\']', html)
counts = Counter(ids)
duplicates = {key: count for key, count in counts.items() if count > 1}
print('DUPLICATE_IDS', duplicates)

# Orden requerido de hojas.
style_pos = html.find('href="style.css"')
workspace_pos = html.find('href="workspace.css"')
print('STYLE_BEFORE_WORKSPACE', style_pos >= 0 and workspace_pos > style_pos)
print('SANDBOX_CANVAS_COUNT', html.count('id="sandbox-canvas"'))
print('MOBILE_TAB_IDS', all(token in html for token in ('sandbox-tab-chat', 'sandbox-tab-scene', 'sandbox-tab-workspace')))

# CSS braces ignoring simple quoted strings and comments sufficiently for this project.
for path in css_files:
    text = path.read_text()
    stripped = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    stripped = re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'', '', stripped)
    balance = stripped.count('{') - stripped.count('}')
    print(path.name, 'BRACE_BALANCE', balance, 'LINES', len(text.splitlines()))
    if balance != 0:
        raise SystemExit(f'Unbalanced CSS braces in {path}')

# Contaminación de shell/heredoc del archivo anterior.
for bad in ('CSSEOF', 'style.css written:', 'cat > '):
    for path in css_files:
        if bad in path.read_text():
            raise SystemExit(f'Forbidden residue {bad!r} in {path}')
print('CSS_RESIDUE', 'none')
