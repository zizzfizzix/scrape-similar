#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# update-shadcn.sh
#
# Scans src/components/ui/ for .tsx components and checks each one against the
# shadcn registry (URL derived from the "style" property in components.json).
#
# - Components found in the registry are updated via `pnpm dlx shadcn@latest add`.
# - Components NOT found in the registry are treated as custom components:
#   they are moved to src/components/custom/ and all import paths across the
#   codebase are updated accordingly.
# ------------------------------------------------------------------------------
set -euo pipefail

UI_DIR="src/components/ui"
CUSTOM_DIR="src/components/custom"
SRC_DIR="src"
STYLE=$(grep -o '"style":\s*"[^"]*"' components.json | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
REGISTRY_URL="https://ui.shadcn.com/r/styles/$STYLE"

echo "Registry URL: $REGISTRY_URL"
read -r -p "Is this correct? [y/N] " confirm
if [[ ! "$confirm" =~ ^[yY]$ ]]; then
  echo "Aborted."
  exit 1
fi

shadcn_components=()
custom_components=()

echo ""
echo "Scanning $UI_DIR for components..."

for file in "$UI_DIR"/*.tsx; do
  [ -f "$file" ] || continue
  name="$(basename "$file" .tsx)"

  # Check against shadcn registry
  http_code=$(curl -s -o /dev/null -w "%{http_code}" "$REGISTRY_URL/$name.json")

  if [ "$http_code" = "200" ]; then
    echo "  [shadcn]  $name"
    shadcn_components+=("$name")
  else
    echo "  [custom]  $name"
    custom_components+=("$name")
  fi
done

# Move custom components
if [ ${#custom_components[@]} -gt 0 ]; then
  echo ""
  echo "Moving custom components to $CUSTOM_DIR..."
  mkdir -p "$CUSTOM_DIR"

  for name in "${custom_components[@]}"; do
    src_file="$UI_DIR/$name.tsx"
    dst_file="$CUSTOM_DIR/$name.tsx"

    if [ -f "$src_file" ]; then
      mv "$src_file" "$dst_file"
      echo "  Moved: $src_file -> $dst_file"

      # Update imports in all .ts/.tsx files under src/
      echo "  Updating imports for $name..."
      find "$SRC_DIR" -type f \( -name "*.ts" -o -name "*.tsx" \) -exec \
        sed -i '' "s|@/components/ui/$name|@/components/custom/$name|g" {} +
    fi
  done
fi

# Update shadcn components
if [ ${#shadcn_components[@]} -gt 0 ]; then
  echo ""
  echo "Updating ${#shadcn_components[@]} shadcn components..."
  echo "  Components: ${shadcn_components[*]}"
  pnpm dlx shadcn@latest add "${shadcn_components[@]}" --overwrite --yes
else
  echo ""
  echo "No shadcn components found to update."
fi

echo ""
echo "Done."
