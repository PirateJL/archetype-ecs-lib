#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# docs-local.sh — Build and serve versioned docs locally with mike + PDF
#
# Usage:
#   ./docs-local.sh                   # deploy "preview" alias and serve
#   ./docs-local.sh 1.0.0             # deploy "preview" + versioned "1.0.0 latest" and serve
#   ./docs-local.sh --clean           # wipe local gh-pages branch first
#   ./docs-local.sh 1.0.0 --clean     # both
# ---------------------------------------------------------------------------

SITE_NAME="archetype-ecs-lib"
VENV_DIR=".venv-docs"
VERSION=""
CLEAN=false

for arg in "$@"; do
  case "$arg" in
    --clean) CLEAN=true ;;
    --help)
      grep '^#' "$0" | sed 's/^# \{0,2\}//'
      exit 0
      ;;
    *) VERSION="$arg" ;;
  esac
done

# --- Cleanup on exit (Ctrl+C or any exit) ------------------------------------

cleanup() {
  echo ""
  echo "Cleaning up..."
  deactivate 2>/dev/null || true
  rm -rf "$VENV_DIR"
  echo "Removed ${VENV_DIR}/"
}
trap cleanup EXIT

# --- Virtual environment -----------------------------------------------------

if ! command -v python3 &>/dev/null; then
  echo "ERROR: python3 not found. Install with your system package manager."
  exit 1
fi

if [[ ! -d "$VENV_DIR" ]]; then
  echo "Creating Python virtual environment in ${VENV_DIR}/ ..."
  python3 -m venv "$VENV_DIR"
fi

# Activate venv — all subsequent python/pip/mike/mkdocs calls use it
# shellcheck source=/dev/null
source "${VENV_DIR}/bin/activate"

echo "Using Python: $(which python3)"

# Install deps
pip install --quiet --upgrade pip
pip install --quiet -r requirements-docs.txt

# Weasyprint check (requires system libs, can't be auto-installed)
if ! python3 -c "import weasyprint" &>/dev/null; then
  echo ""
  echo "ERROR: weasyprint is not installed in the venv."
  echo "  1. Install system libs first:"
  echo "       sudo apt install python3-weasyprint  # Ubuntu/Debian"
  echo "       brew install weasyprint               # macOS"
  echo "  2. Then install the Python package:"
  echo "       ${VENV_DIR}/bin/pip install weasyprint"
  echo ""
  exit 1
fi

# --- Git config (needed by mike to commit to gh-pages) ----------------------

git config user.name  "local-docs-build" 2>/dev/null || true
git config user.email "local-docs-build@localhost" 2>/dev/null || true

# --- Clean local gh-pages branch --------------------------------------------

if $CLEAN; then
  echo "Wiping local gh-pages branch..."
  if git show-ref --quiet refs/heads/gh-pages; then
    git branch -D gh-pages
  else
    echo "(gh-pages branch does not exist locally, nothing to clean)"
  fi
fi

# --- Deploy preview alias ---------------------------------------------------

echo ""
echo "Deploying 'preview' alias..."
PDF_LINK="/${SITE_NAME}/preview/assets/document.pdf" \
EDIT_URI="blob/master/" \
ENABLE_PDF_EXPORT=1 \
  mike deploy preview

# --- Deploy versioned release (optional) ------------------------------------

if [[ -n "$VERSION" ]]; then
  echo ""
  echo "Deploying version '${VERSION}' with alias 'latest'..."
  PDF_LINK="/${SITE_NAME}/${VERSION}/assets/document.pdf" \
  EDIT_URI="blob/v${VERSION}/" \
  ENABLE_PDF_EXPORT=1 \
    mike deploy --update-aliases "${VERSION}" latest

  mike set-default latest
else
  mike set-default preview
fi

# --- Serve ------------------------------------------------------------------

echo ""
echo "Serving at http://127.0.0.1:8000"
echo "Press Ctrl+C to stop. Local gh-pages branch is NOT pushed to remote."
echo ""
mike serve
