from __future__ import annotations

import re
import subprocess
import tempfile
from pathlib import Path

html = Path("web/zhi-community.html").read_text(encoding="utf-8")
scripts = re.findall(r"<script(?:\s[^>]*)?>([\s\S]*?)</script>", html, flags=re.IGNORECASE)
inline_scripts = [part for part in scripts if part.strip()]
if not inline_scripts:
    raise SystemExit("No inline browser script found in community page")

required = [
    "community.scene.discover",
    "community.scene.enter",
    "community.message.read",
    "community.message.send",
    "community.scene.create",
    "community.scene.invite",
]
for scope in required:
    if scope not in html:
        raise SystemExit(f"Missing community capability guidance: {scope}")

for invariant in ['credentials:"omit"', '"idempotency-key"', 'window.addEventListener("pagehide"', "clearCredential"]:
    if invariant not in html:
        raise SystemExit(f"Missing community UI security invariant: {invariant}")

if re.search(r"\\b(?:localStorage|sessionStorage)\\s*\\.", html):
    raise SystemExit("Community access token must not be persisted in browser storage")

with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8", delete=False) as temp:
    temp.write(inline_scripts[-1])
    temp_path = Path(temp.name)

try:
    subprocess.run(["node", "--check", str(temp_path)], check=True)
finally:
    temp_path.unlink(missing_ok=True)

print("community HTML capability guidance, token handling, and inline JavaScript: OK")
