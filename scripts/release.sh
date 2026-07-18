#!/usr/bin/env bash
set -euo pipefail

BUMP="patch"
INSTALL=false

usage() {
  echo "Usage: $0 [--major|--minor|--patch] [--install]"
  echo "  --major    Bump major version"
  echo "  --minor    Bump minor version"
  echo "  --patch    Bump patch version (default)"
  echo "  --install  Install the VSIX into all VS Code profiles after building"
  exit 1
}

for arg in "$@"; do
  case "$arg" in
    --major) BUMP="major" ;;
    --minor) BUMP="minor" ;;
    --patch) BUMP="patch" ;;
    --install) INSTALL=true ;;
    --help|-h) usage ;;
    *) echo "Unknown option: $arg"; usage ;;
  esac
done

cd "$(dirname "$0")/.."

PACKAGE_NAME=$(node -p "require('./package.json').name")
OLD_VERSION=$(node -p "require('./package.json').version")

# Always bump before building so VS Code sees a newly installed VSIX as an update.
# --no-git-tag-version keeps this as a working-tree change for the release commit.
NEW_VERSION=$(npm version "$BUMP" --no-git-tag-version | sed 's/^v//')
if [[ "$NEW_VERSION" == "$OLD_VERSION" ]]; then
  echo "Version did not change ($OLD_VERSION); aborting." >&2
  exit 1
fi
echo "Bumped version: $OLD_VERSION -> $NEW_VERSION"

# Build extension artifacts with the bumped package metadata.
npm run vscode:prepublish

# Package VSIX into releases/ using the expected versioned filename.
mkdir -p releases
VSIX="releases/${PACKAGE_NAME}-${NEW_VERSION}.vsix"
npx @vscode/vsce package --no-dependencies --out "$VSIX"
if [[ ! -f "$VSIX" ]]; then
  echo "Expected VSIX was not created: $VSIX" >&2
  exit 1
fi
echo "Built $VSIX"

if $INSTALL; then
  echo "Installing $VSIX to all profiles..."

  # Install to the default profile first.
  echo "Installing to [Default] profile..."
  code --install-extension "$VSIX" --force

  # Profile directory names are opaque IDs. Human-readable names accepted by
  # `code --profile` live in globalStorage/storage.json under userDataProfiles.
  USER_DIR=""
  if [[ "$OSTYPE" == "darwin"* ]]; then
    USER_DIR="$HOME/Library/Application Support/Code/User"
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    USER_DIR="$HOME/.config/Code/User"
  fi

  STORAGE_JSON="$USER_DIR/globalStorage/storage.json"
  if [[ -n "$USER_DIR" && -f "$STORAGE_JSON" ]]; then
    node -e '
      const profiles = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).userDataProfiles ?? [];
      for (const profile of profiles) if (profile.name) console.log(profile.name);
    ' "$STORAGE_JSON" | while IFS= read -r profile; do
      echo "Installing to [$profile] profile..."
      code --profile "$profile" --install-extension "$VSIX" --force
    done
  fi

  echo "Installed $PACKAGE_NAME@$NEW_VERSION across all profiles. Reload VS Code to activate."
fi
