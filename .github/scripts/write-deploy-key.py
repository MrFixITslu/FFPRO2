#!/usr/bin/env python3
"""Write a GitHub Actions deploy key without logging its contents."""

import os
import sys
from pathlib import Path

key = os.environ["DEPLOY_SSH_KEY"]
# Some secret editors store a pasted multiline key with literal newline escapes.
if "\\n" in key and "\n" not in key:
    key = key.replace("\\r\\n", "\n").replace("\\n", "\n")
key = key.replace("\r\n", "\n").replace("\r", "\n")
target = Path(sys.argv[1])
target.write_text(key.rstrip("\n") + "\n", encoding="utf-8")
target.chmod(0o600)
