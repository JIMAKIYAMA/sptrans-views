#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if [[ ! -x .venv/bin/python ]]; then
    python3 -m venv .venv
fi
.venv/bin/python -m pip install -r requirements.txt
echo 'Abra http://127.0.0.1:5000 no navegador. Para encerrar, pressione Ctrl+C.'
exec .venv/bin/python app.py
