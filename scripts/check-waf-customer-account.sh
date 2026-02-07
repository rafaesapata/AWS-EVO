#!/bin/bash

# WAF Monitoring Customer Account Validation
# Run this script with AWS credentials for the CUSTOMER account
#
# Usage: ./check-waf-customer-account.sh <WAF_ACL_ARN> <REGION>
# Example: ./check-waf-customer-account.sh arn:aws:wafv2:us-east-1:081337268589:regional/webacl/my-waf/abc123 us-east-1

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Configuration
WAF_ACL_ARN="${1}"
REGION="${2:-us-east-1}"
EVO_ACCOUNT="523115032346"

if [ -z "$WAF_ACL_ARN" ]; then
    echo -e "${RED}Error: WAF ACL ARN is required${NC}"
    echo ""
    echo "Usage: $0 <WAF_ACL_ARN> <REGION>"
    echo ""
    echo "Example:"
    echo "  $0 arn:aws:wafv2:us-east-1:081337268589:regional/webacl/my-waf/abc123 us-east-1"
    echo ""
    exit 1
fi

# Extract info from ARN
WAF_ID=$(echo "$WAF_ACL_ARN" | awk -F'/' '{print $NF}')
WAF_NAME=$(echo "$WAF_ACL_ARN" | awk -F'/' '{print $(NF-1)}')
LOG_GROUP_NAME="aws-waf-logs-${WAF_ID}"
EVO_DESTINATION_ARN="arn:aws:logs:${REGION}:${EVO_ACCOUNT}:destination:evo-uds-v3-production-waf-logs-destination"

echo ""
echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}WAF Monitoring Validation${NC}"
echo -e "${BOLD}========================================${NC}"
echo ""
echo -e "${CYAN}WAF ACL ARN:${NC} $WAF_ACL_ARN"
echo -e "${CYAN}WAF Name:${NC} $WAF_NAME"
echo -e "${CYAN}Region:${NC} $REGION"
echo -e "${CYAN}Expected Log Group:${NC} $LOG_GROUP_NAME"
echo ""

# Step 1: Check WAF logging configuration
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 1: WAF Logging Configuration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if aws wafv2 get-logging-configuration --resource-arn "$WAF_ACL_ARN" --region "$REGION" > /tmp/waf-logging.json 2>&1; then
    LOG_DESTINATION=$(jq -r '.LoggingConfiguration.LogDestinationConfigs[0] // empty' /tmp/waf-logging.json 2>/dev/null)
    
    if [ -n "$LOG_DESTINATION" ]; then
        echo -e "${GREEN}✓ WAF logging is ENABLED${NC}"
        echo -e "  ${CYAN}Destination:${NC} $LOG_DESTINATION"
    else
        echo -e "${RED}✗ WAF logging is NOT configured${NC}"
        echo ""
        echo -e "${YELLOW}To enable WAF logging:${NC}"
        echo "  1. Go to AWS WAF Console"
        echo "  2. Select your Web ACL: $WAF_NAME"
        echo "  3. Go to 'Logging and metrics' tab"
        echo "  4. Click 'Enable logging'"
        echo "  5. Select 'CloudWatch Logs'"
        echo "  6. Use log group name: $LOG_GROUP_NAME"
        echo ""
        exit 1
    fi
else
    ERROR_MSG=$(cat /tmp/waf-logging.json 2>/dev/null | jq -r '.message // empty')
    if echo "$ERROR_MSG" | grep -q "LoggingConfiguration"; then
        echo -e "${RED}✗ WAF logging is NOT enabled${NC}"
        echo ""
        echo -e "${YELLOW}To enable WAF logging:${NC}"
        echo "  1. Go to AWS WAF Console"
        echo "  2. Select your Web ACL: $WAF_NAME"
        echo "  3. Go to 'Logging and metrics' tab"
        echo "  4. Click 'Enable logging'"
        echo "  5. Select 'CloudWatch Logs'"
        echo "  6. Use log group name: $LOG_GROUP_NAME"
        echo ""
        exit 1
    else
        echo -e "${RED}✗ Failed to get WAF logging configuration${NC}"
        echo -e "  ${YELLOW}Error:${NC} $ERROR_MSG"
        echo ""
        echo "  Make sure you have the correct permissions and WAF ARN"
        exit 1
    fi
fi

# Step 2: Check CloudWatch Log Group
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 2: CloudWatch Log Group${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if aws logs describe-log-groups --log-group-name-prefix "$LOG_GROUP_NAME" --region "$REGION" > /tmp/log-groups.json 2>&1; then
    LOG_GROUP_EXISTS=$(jq -r ".logGroups[] | select(.logGroupName == \"$LOG_GROUP_NAME\") | .logGroupName" /tmp/log-groups.json 2>/dev/null)
    
    if [ -n "$LOG_GROUP_EXISTS" ]; then
        STORED_BYTES=$(jq -r ".logGroups[] | select(.logGroupName == \"$LOG_GROUP_NAME\") | .storedBytes // 0" /tmp/log-groups.json)
        CREATION_TIME=$(jq -r ".logGroups[] | select(.logGroupName == \"$LOG_GROUP_NAME\") | .creationTime" /tmp/log-groups.json)
        CREATION_DATE=$(date -r $((CREATION_TIME / 1000)) "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "Unknown")
        
        echo -e "${GREEN}✓ Log Group EXISTS${NC}"
        echo -e "  ${CYAN}Name:${NC} $LOG_GROUP_NAME"
        echo -e "  ${CYAN}Created:${NC} $CREATION_DATE"
        echo -e "  ${CYAN}Stored Bytes:${NC} $(numfmt --to=iec-i --suffix=B $STORED_BYTES 2>/dev/null || echo $STORED_BYTES)"
    else
        echo -e "${RED}✗ Log Group NOT FOUND${NC}"
        echo -e "  ${YELLOW}Expected:${NC} $LOG_GROUP_NAME"
        echo ""
        echo -e "${YELLOW}The log group should be created automatically when you enable WAF logging.${NC}"
        exit 1
    fi
else
    echo -e "${RED}✗ Failed to check log groups${NC}"
    exit 1
fi

# Step 3: Check for recent log streams
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 3: Recent Log Streams${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if aws logs describe-log-streams \
    --log-group-name "$LOG_GROUP_NAME" \
    --order-by LastEventTime \
    --descending \
    --max-items 5 \
    --region "$REGION" > /tmp/log-streams.json 2>&1; then
    
    STREAM_COUNT=$(jq -r '.logStreams | length' /tmp/log-streams.json 2>/dev/null || echo "0")
    
    if [ "$STREAM_COUNT" -gt 0 ]; then
        echo -e "${GREEN}✓ Found $STREAM_COUNT recent log stream(s)${NC}"
        echo ""
        jq -r '.logStreams[] | "  • \(.logStreamName)\n    Last event: \(if .lastEventTimestamp then (.lastEventTimestamp / 1000 | strftime("%Y-%m-%d %H:%M:%S")) else "No events" end)"' /tmp/log-streams.json 2>/dev/null || echo "  (Unable to parse stream details)"
    else
        echo -e "${YELLOW}⚠ No log streams found${NC}"
        echo "  This means the WAF hasn't received any traffic yet, or logging was just enabled."
    fi
else
    echo -e "${YELLOW}⚠ Unable to check log streams${NC}"
fi

# Step 4: Check subscription filters
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 4: Subscription Filters${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if aws logs describe-subscription-filters \
    --log-group-name "$LOG_GROUP_NAME" \
    --region "$REGION" > /tmp/subscription-filters.json 2>&1; then
    
    FILTER_COUNT=$(jq -r '.subscriptionFilters | length' /tmp/subscription-filters.json 2>/dev/null || echo "0")
    
    if [ "$FILTER_COUNT" -gt 0 ]; then
        echo -e "${GREEN}✓ Found $FILTER_COUNT subscription filter(s)${NC}"
        echo ""
        
        # Check each filter
        for i in $(seq 0 $((FILTER_COUNT - 1))); do
            FILTER_NAME=$(jq -r ".subscriptionFilters[$i].filterName" /tmp/subscription-filters.json)
            DESTINATION=$(jq -r ".subscriptionFilters[$i].destinationArn" /tmp/subscription-filters.json)
            FILTER_PATTERN=$(jq -r ".subscriptionFilters[$i].filterPattern // \"(empty - all logs)\"" /tmp/subscription-filters.json)
            CREATION_TIME=$(jq -r ".subscriptionFilters[$i].creationTime" /tmp/subscription-filters.json)
            CREATION_DATE=$(date -r $((CREATION_TIME / 1000)) "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "Unknown")
            
            echo -e "  ${BOLD}Filter $((i + 1)):${NC} $FILTER_NAME"
            echo -e "    ${CYAN}Destination:${NC} $DESTINATION"
            echo -e "    ${CYAN}Filter Pattern:${NC} $FILTER_PATTERN"
            echo -e "    ${CYAN}Created:${NC} $CREATION_DATE"
            
            # Check if destination points to EVO
            if [ "$DESTINATION" == "$EVO_DESTINATION_ARN" ]; then
                echo -e "    ${GREEN}✓ Correctly points to EVO destination${NC}"
            else
                echo -e "    ${YELLOW}⚠ Does NOT point to EVO destination${NC}"
                echo -e "    ${CYAN}Expected:${NC} $EVO_DESTINATION_ARN"
            fi
            echo ""
        done
    else
        echo -e "${RED}✗ No subscription filters found${NC}"
        echo ""
        echo -e "${YELLOW}The subscription filter should be created automatically by EVO.${NC}"
        echo -e "${YELLOW}If it wasn't created, you can create it manually:${NC}"
        echo ""
        echo -e "${CYAN}aws logs put-subscription-filter \\${NC}"
        echo -e "${CYAN}  --log-group-name \"$LOG_GROUP_NAME\" \\${NC}"
        echo -e "${CYAN}  --filter-name \"evo-waf-monitoring\" \\${NC}"
        echo -e "${CYAN}  --filter-pattern \"\" \\${NC}"
        echo -e "${CYAN}  --destination-arn \"$EVO_DESTINATION_ARN\" \\${NC}"
        echo -e "${CYAN}  --role-arn \"arn:aws:iam::\$(aws sts get-caller-identity --query Account --output text):role/EVOCloudWatchLogsRole\" \\${NC}"
        echo -e "${CYAN}  --region \"$REGION\"${NC}"
        echo ""
        exit 1
    fi
else
    echo -e "${RED}✗ Unable to check subscription filters${NC}"
    exit 1
fi

# Final Summary
echo ""
echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}Summary${NC}"
echo -e "${BOLD}========================================${NC}"
echo ""

if [ "$FILTER_COUNT" -gt 0 ] && [ "$STREAM_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ WAF monitoring is properly configured and receiving traffic!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Check the EVO dashboard for WAF events"
    echo "  2. Events should appear within 1-2 minutes"
    echo ""
elif [ "$FILTER_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}⚠ WAF monitoring is configured but no traffic detected yet${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Generate traffic to your WAF-protected resources"
    echo "  2. Wait a few minutes for logs to appear"
    echo "  3. Check the EVO dashboard for WAF events"
    echo ""
else
    echo -e "${RED}✗ WAF monitoring is NOT properly configured${NC}"
    echo ""
    echo "Issues found:"
    echo "  - Subscription filter is missing"
    echo ""
    echo "Please review the output above and follow the suggested actions."
    echo ""
fi

# Cleanup
rm -f /tmp/waf-logging.json /tmp/log-groups.json /tmp/log-streams.json /tmp/subscription-filters.json

echo ""
