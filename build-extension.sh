#!/usr/bin/env bash
# Build an EspoCRM installable ZIP without modifying the release version.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

python3 - "${SCRIPT_DIR}" <<'PY'
import json
import re
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(sys.argv[1])
manifest = json.loads((root / "manifest.json").read_text())
version = manifest["version"]
if not re.fullmatch(r"\d+\.\d+\.\d+", version):
    raise SystemExit(f"Unsupported manifest version: {version}")

output = root / "build" / f"add-to-target-list-{version}.zip"
output.parent.mkdir(exist_ok=True)
with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
    archive.write(root / "manifest.json", "manifest.json")
    for directory in ("custom", "client"):
        for source in sorted((root / directory).rglob("*")):
            if source.is_file():
                if source.suffix == ".json":
                    json.loads(source.read_text())
                archive.write(source, "files/" + source.relative_to(root).as_posix())

print(f"Created: {output}")
PY
