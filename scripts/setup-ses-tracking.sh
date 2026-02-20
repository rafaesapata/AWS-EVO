#!/bin/bash
# Setup SES Event Publishing for email delivery tracking
# Uses the dedicated SES credentials account

SES_KEY="${AWS_SES_ACCESS_KEY_ID:-}"
SES_SECRET="${AWS_SES_SECRET_ACCESS_KEY:-}"
REGION="us-east-1"
PROFILE="EVO_PRODUCTION"
CONFIG_SET_NAME="evo-email-tracking"
SNS_TOPIC_NAME="evo-ses-email-events"

if [ -z "$SES_KEY" ] || [ -z "$SES_SECRET" ]; then
  echo "Reading SES credentials from SSM..."
  SES_KEY=$(aws ssm get-parameter --name "/evo/production/ses-access-key-id" --with-decryption --query 'Parameter.Value' --output text --profile "$PROFILE" --region "$REGION" 2>/dev/null)
  SES_SECRET=$(aws ssm get-parameter --name "/evo/production/ses-secret-access-key" --with-decryption --query 'Parameter.Value' --output text --profile "$PROFILE" --region "$REGION" 2>/dev/null)
fi

if [ -z "$SES_KEY" ] || [ -z "$SES_SECRET" ]; then
  echo "ERROR: SES credentials not found. Set AWS_SES_ACCESS_KEY_ID/AWS_SES_SECRET_ACCESS_KEY or store in SSM."
  exit 1
fi

export AWS_ACCESS_KEY_ID="$SES_KEY"
export AWS_SECRET_ACCESS_KEY="$SES_SECRET"
export AWS_DEFAULT_REGION="$REGION"

echo "=== Step 1: Create SES Configuration Set ==="
aws ses create-configuration-set \
  --configuration-set Name="$CONFIG_SET_NAME" \
  2>&1 || echo "(may already exist)"

echo ""
echo "=== Step 2: Create SNS Topic ==="
# Use the main account profile for SNS (SES IAM user may not have SNS permissions)
unset AWS_ACCESS_KEY_ID
unset AWS_SECRET_ACCESS_KEY
TOPIC_ARN=$(aws sns create-topic \
  --name "$SNS_TOPIC_NAME" \
  --profile "$PROFILE" \
  --region "$REGION" \
  --query 'TopicArn' \
  --output text 2>&1)
echo "Topic ARN: $TOPIC_ARN"

echo ""
echo "=== Step 3: Subscribe webhook Lambda to SNS topic ==="
# Get the Lambda ARN
LAMBDA_ARN=$(aws lambda get-function \
  --function-name "evo-uds-v3-production-ses-webhook" \
  --profile "$PROFILE" \
  --region "$REGION" \
  --query 'Configuration.FunctionArn' \
  --output text 2>/dev/null)

if [ -n "$LAMBDA_ARN" ] && [ "$LAMBDA_ARN" != "None" ]; then
  echo "Lambda ARN: $LAMBDA_ARN"
  
  # Add SNS invoke permission to Lambda
  aws lambda add-permission \
    --function-name "evo-uds-v3-production-ses-webhook" \
    --statement-id "sns-ses-events" \
    --action "lambda:InvokeFunction" \
    --principal "sns.amazonaws.com" \
    --source-arn "$TOPIC_ARN" \
    --profile "$PROFILE" \
    --region "$REGION" 2>&1 || echo "(permission may already exist)"
  
  # Subscribe Lambda to SNS
  aws sns subscribe \
    --topic-arn "$TOPIC_ARN" \
    --protocol lambda \
    --notification-endpoint "$LAMBDA_ARN" \
    --profile "$PROFILE" \
    --region "$REGION" 2>&1
else
  echo "WARNING: ses-webhook Lambda not found yet. Subscribe after deploy."
  echo "  Run: aws sns subscribe --topic-arn $TOPIC_ARN --protocol lambda --notification-endpoint <LAMBDA_ARN> --profile $PROFILE --region $REGION"
fi

echo ""
echo "=== Step 4: Allow SES to publish to SNS topic ==="
# Set SNS topic policy to allow SES to publish
# IMPORTANT: SES is in account 563366818355, not the infra account
INFRA_ACCOUNT_ID=$(aws sts get-caller-identity --profile "$PROFILE" --region "$REGION" --query 'Account' --output text)
SES_ACCOUNT_ID="563366818355"
POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSESPublish",
      "Effect": "Allow",
      "Principal": {"Service": "ses.amazonaws.com"},
      "Action": "SNS:Publish",
      "Resource": "'"$TOPIC_ARN"'",
      "Condition": {
        "StringEquals": {"AWS:SourceAccount": "'"$SES_ACCOUNT_ID"'"}
      }
    },
    {
      "Sid": "AllowOwnerAccount",
      "Effect": "Allow",
      "Principal": {"AWS": "arn:aws:iam::'"$INFRA_ACCOUNT_ID"':root"},
      "Action": ["SNS:Publish", "SNS:Subscribe", "SNS:GetTopicAttributes", "SNS:SetTopicAttributes"],
      "Resource": "'"$TOPIC_ARN"'"
    }
  ]
}'
aws sns set-topic-attributes \
  --topic-arn "$TOPIC_ARN" \
  --attribute-name Policy \
  --attribute-value "$POLICY" \
  --profile "$PROFILE" \
  --region "$REGION" 2>&1

echo ""
echo "=== Step 5: Create SES Event Destination ==="
export AWS_ACCESS_KEY_ID="$SES_KEY"
export AWS_SECRET_ACCESS_KEY="$SES_SECRET"

aws ses create-configuration-set-event-destination \
  --configuration-set-name "$CONFIG_SET_NAME" \
  --event-destination Name="sns-all-events",Enabled=true,MatchingEventTypes=send,reject,bounce,complaint,delivery,open,click,renderingFailure,SNSDestination="{TopicARN=$TOPIC_ARN}" \
  --region "$REGION" \
  2>&1 || echo "(may already exist)"

echo ""
echo "=== Done ==="
echo "Configuration Set: $CONFIG_SET_NAME"
echo "SNS Topic: $TOPIC_ARN"
echo "Events tracked: send, reject, bounce, complaint, delivery, open, click"
echo ""
echo "NEXT: Deploy the ses-webhook Lambda, then run this script again to subscribe it."
