#!/usr/bin/env bash
# Create or update GitHub labels from .github/labels.yml (requires gh and python3).
set -euo pipefail
repo="${1:-scrollDynasty/chizma}"
python3 - "$repo" <<'PY'
import re, subprocess, sys
repo = sys.argv[1]
for line in open(".github/labels.yml", encoding="utf-8"):
    m = re.match(r'- \{ name: "?([^",]+)"?, color: (\w+), description: (.+) \}', line.strip())
    if m:
        name, color, desc = m.groups()
        subprocess.run(["gh", "label", "create", name, "--repo", repo, "--color", color,
                        "--description", desc, "--force"], check=True)
PY
