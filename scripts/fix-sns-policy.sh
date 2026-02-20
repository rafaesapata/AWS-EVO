#!/bin/bash
TOPIC_ARN="arn:aws:sns:us-east-1:523115032346:evo-ses-email-events"
PROFILE="EVO_PRODUCTION"
REGION="us-east-1"

POLICY='{"Version":"2012-10-17","Statement":[{"Sid":"AllowSESPublishCrossAccount","Effect":"Allow","Principal":{"Service":"ses.amazonaws.com"},"Action":"SNS:Publish","Resource":"'"$TOPIC_ARN"'","Condition":{"StringEquals":{"AWS:SourceAccount":"563366818355"}}},{"Sid":"AllowSESPublishMainAccount","Effect":"Allow","Principal":{"Service":"ses.amazonaws.com"},"Action":"SNS:Publish","Resource":"'"$TOPIC_ARN"'","Condition":{"StringEquals":{"AWS:SourceAccount":"523115032346"}}}]}'

echo "Setting SNS topic policy for cross-account SES..."
aws sns set-topic-attributes \
  --topic-arn "$TOPIC_ARN" \
  --attribute-name Policy \
  --attribute-value "$POLICY" \
  --profile "$PROFILE" \
  --region "$REGION"

echo "Creating SES event destination in SES account..."
SES_KEY="${AWS_SES_ACCESS_KEY_ID:-}"
SES_SECRET="${AWS_SES_SECRET_ACCESS_KEY:-}"
if [ -z "$SES_KEY" ] || [ -z "$SES_SECRET" ]; then
  SES_KEY=$(aws ssm get-parameter --name "/evo/production/ses-access-key-id" --with-decryption --query 'Parameter.Value' --output text --profile "$PROFILE" --region "$REGION" 2>/dev/null)
  SES_SECRET=$(aws ssm get-parameter --name "/evo/production/ses-secret-access-key" --with-decryption --query 'Parameter.Value' --output text --profile "$PROFILE" --region "$REGION" 2>/dev/null)
fi
AWS_ACCESS_KEY_ID="$SES_KEY" \
AWS_SECRET_ACCESS_KEY="$SES_SECRET" \
aws ses create-configuration-set-event-destination \
  --configuration-set-name "evo-email-tracking" \
  --event-destination "Name=sns-all-events,Enabled=true,MatchingEventTypes=send,reject,bounce,complaint,delivery,open,click,SNSDestination={TopicARN=$TOPIC_ARN}" \
  --region "$REGION" 2>&1 || echo "(may already exist)"

echo "Done"
