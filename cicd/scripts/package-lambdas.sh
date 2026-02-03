#!/bin/bash
# Package Lambda functions for deployment
# Creates individual ZIP files for each handler

set -e

DIST_DIR="backend/dist"
OUTPUT_DIR="/tmp/lambda-packages"
HANDLERS_DIR="$DIST_DIR/handlers"

echo "📦 Packaging Lambda functions..."

# Create output directory
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Copy shared libraries
echo "  📁 Preparing shared libraries..."
SHARED_DIR="/tmp/lambda-shared"
rm -rf "$SHARED_DIR"
mkdir -p "$SHARED_DIR"
cp -r "$DIST_DIR/lib" "$SHARED_DIR/"
cp -r "$DIST_DIR/types" "$SHARED_DIR/"

# Process each handler category
for CATEGORY_DIR in "$HANDLERS_DIR"/*/; do
  CATEGORY=$(basename "$CATEGORY_DIR")
  echo "  📂 Processing category: $CATEGORY"
  
  for HANDLER_FILE in "$CATEGORY_DIR"*.js; do
    if [ -f "$HANDLER_FILE" ]; then
      HANDLER_NAME=$(basename "$HANDLER_FILE" .js)
      ZIP_NAME="${HANDLER_NAME}.zip"
      TEMP_DIR="/tmp/lambda-build-${HANDLER_NAME}"
      
      # Create temp directory
      rm -rf "$TEMP_DIR"
      mkdir -p "$TEMP_DIR"
      
      # Copy handler file and fix imports
      sed 's|require("../../lib/|require("./lib/|g' "$HANDLER_FILE" | \
      sed 's|require("../lib/|require("./lib/|g' | \
      sed 's|require("../../types/|require("./types/|g' | \
      sed 's|require("../types/|require("./types/|g' > "$TEMP_DIR/${HANDLER_NAME}.js"
      
      # Copy shared libraries
      cp -r "$SHARED_DIR/lib" "$TEMP_DIR/"
      cp -r "$SHARED_DIR/types" "$TEMP_DIR/"
      
      # Create ZIP
      (cd "$TEMP_DIR" && zip -rq "$OUTPUT_DIR/$ZIP_NAME" .)
      
      # Cleanup
      rm -rf "$TEMP_DIR"
      
      echo "    ✅ $ZIP_NAME"
    fi
  done
done

# Count packages
PACKAGE_COUNT=$(ls -1 "$OUTPUT_DIR"/*.zip 2>/dev/null | wc -l)
echo ""
echo "✅ Created $PACKAGE_COUNT Lambda packages in $OUTPUT_DIR"
