"""Chiamata economica a DeepSeek. Uso: python tools/deepseek.py <prompt_file> [out_file] [max_tokens]
La chiave sta in ~/.config/deepseek/api_key (mai nel repo)."""
import json, os, sys, urllib.request
key = open(os.path.expanduser("~/.config/deepseek/api_key")).read().strip()
prompt = open(sys.argv[1], encoding="utf-8").read()
out = sys.argv[2] if len(sys.argv) > 2 else None
max_tokens = int(sys.argv[3]) if len(sys.argv) > 3 else 3000
body = {"model": "deepseek-flash", "max_tokens": max_tokens, "temperature": 0.7, "reasoning_effort": "low", "thinking": {"type": "disabled"},
        "messages": [{"role": "user", "content": prompt}]}
req = urllib.request.Request("https://api.deepseek.com/chat/completions", data=json.dumps(body).encode(),
                             headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
r = json.load(urllib.request.urlopen(req, timeout=600))
text = r["choices"][0]["message"]["content"]; u = r.get("usage", {})
if out: open(out, "w", encoding="utf-8").write(text)
else: print(text)
print(f"[deepseek] tokens in={u.get('prompt_tokens')} out={u.get('completion_tokens')}", file=sys.stderr)
