#!/usr/bin/env sh
set -eu

APP_REPO="${1:-project-journal-app}"
DATA_REPO="${2:-project-journal-data}"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required for this optional helper."
  exit 1
fi

echo "Creating private data repository: $DATA_REPO"
gh repo create "$DATA_REPO" --private --add-readme

echo "Creating public app repository: $APP_REPO"
gh repo create "$APP_REPO" --public

echo "Repositories created. Follow DEPLOYMENT.md to push this package, set the Pages source, and create the fine-grained token."
