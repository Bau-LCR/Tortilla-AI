import json
from pathlib import Path

models = json.loads(Path('/home/ubuntu/tmp/openrouter-models.json').read_text())['data']
rows = []
for m in models:
    pricing = m.get('pricing') or {}
    prompt = str(pricing.get('prompt', ''))
    completion = str(pricing.get('completion', ''))
    if prompt == '0' and completion == '0':
        arch = m.get('architecture') or {}
        params = m.get('supported_parameters') or []
        name = (m.get('name') or '').lower()
        desc = (m.get('description') or '').lower()
        if any(k in name or k in desc for k in ('coder', 'code', 'program', 'reason', 'thinking', 'qwen', 'deepseek', 'glm', 'mistral', 'llama')):
            rows.append({
                'id': m.get('id'),
                'name': m.get('name'),
                'context_length': m.get('context_length'),
                'supported_parameters': params,
                'input_modalities': arch.get('input_modalities'),
                'output_modalities': arch.get('output_modalities'),
            })
rows.sort(key=lambda r: ((r['context_length'] or 0), r['id'] or ''), reverse=True)
for r in rows[:80]:
    print(json.dumps(r, ensure_ascii=False))
