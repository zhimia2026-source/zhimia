from __future__ import annotations

import re
import subprocess
import tempfile
from pathlib import Path

html_path = Path("web/zhi-token-admin.html")
html = html_path.read_text(encoding="utf-8")
scripts = re.findall(r"<script(?:\s[^>]*)?>([\s\S]*?)</script>", html, flags=re.IGNORECASE)
inline_scripts = [part for part in scripts if part.strip()]
if not inline_scripts:
    raise SystemExit("No inline browser script found in token admin page")

required = {
    "health.chat",
    "health.history.read",
    "health.consent.manage",
    "community.scene.discover",
    "community.scene.create",
    "community.scene.enter",
    "community.scene.invite",
    "community.message.read",
    "community.message.send",
}
for capability in required:
    if f'value="{capability}"' not in html:
        raise SystemExit(f"Missing token capability control: {capability}")

if 'name="capability"' not in html or "selectedCapabilities" not in html:
    raise SystemExit("Capability selection is not wired into token creation")

with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8", delete=False) as temp:
    temp.write(inline_scripts[-1])
    temp_path = Path(temp.name)

try:
    subprocess.run(["node", "--check", str(temp_path)], check=True)
finally:
    temp_path.unlink(missing_ok=True)

print("token admin HTML capability controls and inline JavaScript: OK")
