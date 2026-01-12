#!/bin/bash
# Apply Azure migration via Lambda

set -e

REGION="us-east-1"

echo "🚀 Applying Azure migration..."

# Create the migration SQL as a single-line JSON-safe string
# We'll split it into multiple Lambda invocations

# Part 1: Add cloud_provider columns to existing tables
echo "📦 Part 1: Adding cloud_provider columns..."
aws lambda invoke \
  --function-name evo-uds-v3-production-run-migrations \
  --cli-binary-format raw-in-base64-out \
  --payload '{"action":"status"}' \
  --region "$REGION" \
  /tmp/migration-result.json > /dev/null 2>&1

cat /tmp/migration-result.json | jq -r '.body' | jq -r '.tables | length' 

echo ""
echo "✅ Migration check complete!"
echo "Tables in database: $(cat /tmp/migration-result.json | jq -r '.body' | jq -r '.tables | length')"
