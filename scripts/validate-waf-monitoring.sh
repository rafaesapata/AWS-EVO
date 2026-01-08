#!/bin/bash

# WAF Monitoring Validation Script
# Run this in the CUSTOMER AWS account to validate WAF monitoring setup
#
# Usage: ./validate-waf-monitoring.sh <WAF_ACL_ARN> <REGION>
# Example: ./validate-waf-monitoring.sh arn:aws:wafv2:us-east-1:081337268589:regional/webacl/my-waf/abc123 us-east-1

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
WAF_ACL_ARN="${1}"
REGION="${2:-us-east-1}"
EVO_ACCOUNT="383234048592"

if [ -z "$WAF_ACL_ARN" ]; then
    echo -e "${RED}Error: WAF ACL ARN is required${NC}"
    echo "Usage: $0 <WAF_ACL_ARN> <REGION>"
    echo "Example: $0 arn:aws:wafv2:us-east-1:081337268589:regional/webacl/my-waf/abc123 us-east-1"
    exit 1
fi

# Extract WAF ID from ARN
WAF_ID=$(echo "$WAF_ACL_ARN" | awk -F'/' '{print $NF}')
LOG_GROUP_NAME="aws-waf-logs-${WAF_ID}"
EVO_DESTINATION_ARN="arn:aws:logs:${REGION}:${EVO_ACCOUNT}:destination:evo-waf-logs-destination"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}WAF Monitoring Validation${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "WAF ACL ARN: $WAF_ACL_ARN"
echo "Region: $REGION"
echo "Expected Log Group: $LOG_GROUP_NAME"
echo ""

# Step 1: Check if WAF logging is enabled
echo -e "${BLUE}Step 1: Checking WAF Logging Configuration...${NC}"
if aws wafv2 get-logging-configuration --resource-arn "$WAF_ACL_ARN" --region "$REGION" > /dev/null 2>&1; then
    LOGGING_CONFIG=$(aws wafv2 get-logging-configuration --resource-arn "$WAF_ACL_ARN" --region "$REGION" 2>/dev/null)
    LOG_DESTINATION=$(echo "$LOGGING_CONFIG" | jq -r '.LoggingConfiguration.LogDestinationConfigs[0]' 2>/dev/null || echo "")
    
    if [ -n "$LOG_DESTINATION" ] && [ "$LOG_DESTINATION" != "null" ]; then
        echo -e "${GREEN}✓ WAF logging is ENABLED${NC}"
        echo "  Destination: $LOG_DESTINATION"
    else
        echo -e "${RED}✗ WAF logging is NOT configured${NC}"
        echo ""
        echo -e "${YELLOW}To enable WAF logging:${NC}"
        echo "1. Go to AWS WAF Console"
        echo "2. Select your Web ACL"
        echo "3. Go to 'Logging and metrics' tab"
        echo "4. Click 'Enable logging'"
        echo "5. Select 'CloudWatch Logs'"
        echo "6. Use log group name: $LOG_GROUP_NAME"
        exit 1
    fi
else
    echo -e "${RED}✗ Failed to get WAF logging configuration${NC}"
    echo "  Make sure you have the correct permissions and WAF ARN"
    exit 1
fi

echo ""

# Step 2: Check if log group exists
echo -e "${BLUE}Step 2: Checking CloudWatch Log Group...${NC}"
if aws logs describe-log-groups --log-group-name-prefix "$LOG_GROUP_NAME" --region "$REGION" 2>/dev/null | grep -q "$LOG_GROUP_NAME"; then
    LOG_GROUP_INFO=$(aws logs describe-log-groups --log-group-name-prefix "$LOG_GROUP_NAME" --region "$REGION" 2>/dev/null | jq -r ".logGroups[] | select(.logGroupName == \"$LOG_GROUP_NAME\")")
    STORED_BYTES=$(echo "$LOG_GROUP_INFO" | jq -r '.storedBytes // 0')
    CREATION_TIME=$(echo "$LOG_GROUP_INFO" | jq -r '.creationTime')
    CREATION_DATE=$(date -r $((CREATION_TIME / 1000)) 2>/dev/null || echo "Unknown")
    
    echo -e "${GREEN}✓ Log Group EXISTS${NC}"
    echo "  Name: $LOG_GROUP_NAME"
    echo "  Created: $CREATION_DATE"
    echo "  Stored Bytes: $STORED_BYTES"
else
    echo -e "${RED}✗ Log Group NOT FOUND${NC}"
    echo "  Expected: $LOG_GROUP_NAME"
    echo ""
    echo -e "${YELLOW}The log group should be created automatically when you enable WAF logging.${NC}"
    exit 1
fi

echo ""

# Step 3: Check if there are recent log streams
echo -e "${BLUE}Step 3: Checking for Recent Log Streams...${NC}"
LOG_STREAMS=$(aws logs describe-log-streams \
    --log-group-name "$LOG_GROUP_NAME" \
    --order-by LastEventTime \
    --descending \
    --max-items 5 \
    --region "$REGION" 2>/dev/null || echo "")

if [ -n "$LOG_STREAMS" ]; then
    STREAM_COUNT=$(echo "$LOG_STREAMS" | jq -r '.logStreams | length')
    if [ "$STREAM_COUNT" -gt 0 ]; then
        echo -e "${GREEN}✓ Found $STREAM_COUNT recent log stream(s)${NC}"
        echo "$LOG_STREAMS" | jq -r '.logStreams[] | "  - \(.logStreamName) (Last event: \(.lastEventTimestamp // 0 | tonumber / 1000 | strftime("%Y-%m-%d %H:%M:%S")))"' 2>/dev/null || echo "  (Unable to parse stream details)"
    else
        echo -e "${YELLOW}⚠ No log streams found${NC}"
        echo "  This means the WAF hasn't received any traffic yet, or logging was just enabled."
    fi
else
    echo -e "${YELLOW}⚠ Unable to check log streams${NC}"
fi

echo ""

# Step 4: Check subscription filters
echo -e "${BLUE}Step 4: Checking Subscription Filters...${NC}"
SUBSCRIPTION_FILTERS=$(aws logs describe-subscription-filters \
    --log-group-name "$LOG_GROUP_NAME" \
    --region "$REGION" 2>/dev/null || echo "")

if [ -n "$SUBSCRIPTION_FILTERS" ]; then
    FILTER_COUNT=$(echo "$SUBSCRIPTION_FILTERS" | jq -r '.subscriptionFilters | length')
    
    if [ "$FILTER_COUNT" -gt 0 ]; then
        echo -e "${GREEN}✓ Found $FILTER_COUNT subscription filter(s)${NC}"
        
        # Check each filter
        for i in $(seq 0 $((FILTER_COUNT - 1))); do
            FILTER_NAME=$(echo "$SUBSCRIPTION_FILTERS" | jq -r ".subscriptionFilters[$i].filterName")
            DESTINATION=$(echo "$SUBSCRIPTION_FILTERS" | jq -r ".subscriptionFilters[$i].destinationArn")
            FILTER_PATTERN=$(echo "$SUBSCRIPTION_FILTERS" | jq -r ".subscriptionFilters[$i].filterPattern // \"(empty - all logs)\"")
            
            echo ""
            echo "  Filter $((i + 1)): $FILTER_NAME"
            echo "    Destination: $DESTINATION"
            echo "    Filter Pattern: $FILTER_PATTERN"
            
            # Check if destination points to EVO
            if [ "$DESTINATION" == "$EVO_DESTINATION_ARN" ]; then
                echo -e "    ${GREEN}✓ Correctly points to EVO destination${NC}"
            else
                echo -e "    ${YELLOW}⚠ Does NOT point to EVO destination${NC}"
                echo "    Expected: $EVO_DESTINATION_ARN"
            fi
        done
    else
        echo -e "${RED}✗ No subscription filters found${NC}"
        echo ""
        echo -e "${YELLOW}The subscription filter should be created automatically by EVO.${NC}"
        echo -e "${YELLOW}If it wasn't created, you can create it manually:${NC}"
        echo ""
        echo "aws logs put-subscription-filter \\"
        echo "  --log-group-name \"$LOG_GROUP_NAME\" \\"
        echo "  --filter-name \"evo-waf-monitoring\" \\"
        echo "  --filter-pattern \"\" \\"
        echo "  --destination-arn \"$EVO_DESTINATION_ARN\" \\"
        echo "  --role-arn \"arn:aws:iam::\$(aws sts get-caller-identity --query Account --output text):role/EVOCloudWatchLogsRole\" \\"
        echo "  --region \"$REGION\""
        exit 1
    fi
else
    echo -e "${RED}✗ Unable to check subscription filters${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Final summary
if [ "$FILTER_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ WAF monitoring is properly configured!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Generate some traffic to your WAF-protected resources"
    echo "2. Wait a few minutes for logs to flow"
    echo "3. Check the EVO dashboard for WAF events"
    echo ""
    echo "If you don't see events in EVO after 5-10 minutes:"
    echo "- Verify the WAF has rules that BLOCK or COUNT requests"
    echo "- Check CloudWatch Logs to confirm events are being logged"
    echo "- Contact EVO support for assistance"
else
    echo -e "${YELLOW}⚠ WAF monitoring is partially configured${NC}"
    echo ""
    echo "Issues found:"
    echo "- Subscription filter is missing or misconfigured"
    echo ""
    echo "Please review the output above and follow the suggested actions."
fi

echo ""
