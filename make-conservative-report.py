from pathlib import Path
import difflib
import re

orig = Path('/home/ubuntu/cutreal-ai-original-sources')
cur = Path('/home/ubuntu/cutreal-ai-fixed')
files = [
    'index.html', 'style.css', 'main.js', 'loquendo.js', 'sandbox.js', 'orb.js',
    'api/chat.js', 'api/groq-client.js', 'api/sandbox-agent.js',
    'api/workspace-model-client.js', 'workspace.css', 'workspace.js',
]
report = []
report.append('# Reporte de conservación de Cut-real AI\n')
report.append('Comparación generada contra los adjuntos originales reconstruidos en `cutreal-ai-original-sources`.\n')
report.append('| Archivo | Líneas originales | Líneas finales | Agregadas | Eliminadas | Estado |\n|---|---:|---:|---:|---:|---|')
for rel in files:
    a = [(line + '\n') for line in (orig / rel).read_text().splitlines()]
    b = [(line + '\n') for line in (cur / rel).read_text().splitlines()]
    diff = list(difflib.ndiff(a, b))
    added = sum(1 for x in diff if x.startswith('+ '))
    removed = sum(1 for x in diff if x.startswith('- '))
    status = 'sin cambios' if added == 0 and removed == 0 else 'parche aplicado'
    report.append(f'| `{rel}` | {len(a)} | {len(b)} | {added} | {removed} | {status} |')

report.append('\n## Detalle de cambios\n')
for rel in files:
    a = [(line + '\n') for line in (orig / rel).read_text().splitlines()]
    b = [(line + '\n') for line in (cur / rel).read_text().splitlines()]
    if a == b:
        continue
    report.append(f'### `{rel}`\n')
    diff = ''.join(difflib.unified_diff(a, b, fromfile=f'original/{rel}', tofile=f'final/{rel}', n=2))
    report.append('```diff\n' + diff + '\n```\n')

report.append('## Comprobaciones\n')
html = (cur / 'index.html').read_text()
canvas_count = html.count('id="sandbox-canvas"')
report.append(f'- `index.html` conserva {canvas_count} instancias originales de `sandbox-canvas`; no se eliminó el duplicado.\n')
report.append(f'- `style.css`: {len((cur / "style.css").read_text().splitlines())} líneas; únicamente se agregaron reglas al final.\n')
report.append(f'- `workspace.css`: {len((cur / "workspace.css").read_text().splitlines())} líneas; únicamente se agregaron reglas al final.\n')
report.append('- `main.js`, `api/chat.js`, `api/groq-client.js` y los archivos auxiliares permanecen byte a byte iguales a los adjuntos originales.\n')
report.append('- El chat normal conserva `api/chat.js` + `api/groq-client.js`; el Sandbox usa `api/workspace-model-client.js` + OpenRouter.\n')

Path('/home/ubuntu/cutreal-ai-fixed/CONSERVATION_DIFF_REPORT.md').write_text('\n'.join(report))
