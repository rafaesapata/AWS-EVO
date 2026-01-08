#!/usr/bin/env node

/**
 * WAF Monitoring Diagnostic Script
 * 
 * Verifies the complete WAF monitoring setup:
 * 1. Database configuration
 * 2. Customer AWS account setup (Log Groups, Subscription Filters)
 * 3. EVO CloudWatch Destinations
 * 4. Recent WAF events
 */

const { PrismaClient } = require('@prisma/client');
const { 
  CloudWatchLogsClient, 
  DescribeLogGroupsCommand,
  DescribeSubscriptionFiltersCommand 
} = require('@aws-sdk/client-cloudwatch-logs');
const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');

const prisma = new PrismaClient();

// Organization to check
const ORG_ID = '0f1b33dc-cd5f-49e5-8579-fb4e7b1f5a42';

// EVO Account
const EVO_ACCOUNT = '383234048592';
const EVO_REGION = 'us-east-1';

async function main() {
  console.log('🔍 WAF Monitoring Diagnostic Tool\n');
  console.log('=' .repeat(80));
  
  // Step 1: Check database configuration
  console.log('\n📊 Step 1: Checking Database Configuration...\n');
  
  const configs = await prisma.wafMonitoringConfig.findMany({
    where: { organizationId: ORG_ID },
    orderBy: { createdAt: 'desc' }
  });
  
  console.log(`Found ${configs.length} WAF configuration(s):`);
  configs.forEach((config, i) => {
    console.log(`\n  Config ${i + 1}:`);
    console.log(`    ID: ${config.id}`);
    console.log(`    WAF ACL: ${config.webAclName}`);
    console.log(`    ARN: ${config.webAclArn}`);
    console.log(`    Active: ${config.isActive ? '✅' : '❌'}`);
    console.log(`    Filter Mode: ${config.filterMode}`);
    console.log(`    AWS Account: ${config.awsAccountId}`);
    console.log(`    Region: ${config.region}`);
    console.log(`    Events Today: ${config.eventsToday || 0}`);
    console.log(`    Blocked Today: ${config.blockedToday || 0}`);
    console.log(`    Last Event: ${config.lastEventAt || 'Never'}`);
  });
  
  if (configs.length === 0) {
    console.log('\n❌ No WAF configurations found in database!');
    return;
  }
  
  const activeConfig = configs.find(c => c.isActive);
  if (!activeConfig) {
    console.log('\n❌ No active WAF configuration found!');
    return;
  }
  
  // Step 2: Check WAF events in database
  console.log('\n\n📈 Step 2: Checking WAF Events in Database...\n');
  
  const eventCount = await prisma.wafEvent.count({
    where: { organizationId: ORG_ID }
  });
  
  console.log(`Total WAF events in database: ${eventCount}`);
  
  if (eventCount > 0) {
    const recentEvents = await prisma.wafEvent.findMany({
      where: { organizationId: ORG_ID },
      orderBy: { timestamp: 'desc' },
      take: 5
    });
    
    console.log('\nMost recent events:');
    recentEvents.forEach((event, i) => {
      console.log(`  ${i + 1}. ${event.timestamp.toISOString()} - ${event.action} - ${event.sourceIp}`);
    });
  } else {
    console.log('⚠️  No events found - monitoring is configured but no logs received yet');
  }
  
  // Step 3: Check customer AWS account setup
  console.log('\n\n☁️  Step 3: Checking Customer AWS Account Setup...\n');
  console.log(`Customer Account: ${activeConfig.awsAccountId}`);
  console.log(`Region: ${activeConfig.region}`);
  
  try {
    // Assume role in customer account
    const stsClient = new STSClient({ region: EVO_REGION });
    const assumeRoleCommand = new AssumeRoleCommand({
      RoleArn: `arn:aws:iam::${activeConfig.awsAccountId}:role/EVO-Platform-Role`,
      RoleSessionName: 'waf-diagnostic',
      DurationSeconds: 900
    });
    
    const assumeRoleResponse = await stsClient.send(assumeRoleCommand);
    
    // Create CloudWatch Logs client with assumed credentials
    const cwlClient = new CloudWatchLogsClient({
      region: activeConfig.region,
      credentials: {
        accessKeyId: assumeRoleResponse.Credentials.AccessKeyId,
        secretAccessKey: assumeRoleResponse.Credentials.SecretAccessKey,
        sessionToken: assumeRoleResponse.Credentials.SessionToken
      }
    });
    
    // Extract WAF ID from ARN
    const wafId = activeConfig.webAclArn.split('/').pop();
    const logGroupName = `aws-waf-logs-${wafId}`;
    
    console.log(`Expected Log Group: ${logGroupName}`);
    
    // Check if log group exists
    const describeLogGroupsCommand = new DescribeLogGroupsCommand({
      logGroupNamePrefix: logGroupName
    });
    
    const logGroupsResponse = await cwlClient.send(describeLogGroupsCommand);
    
    if (!logGroupsResponse.logGroups || logGroupsResponse.logGroups.length === 0) {
      console.log('❌ Log Group NOT FOUND!');
      console.log('\n⚠️  WAF logging is not enabled. To enable:');
      console.log(`   1. Go to AWS WAF console`);
      console.log(`   2. Select Web ACL: ${activeConfig.webAclName}`);
      console.log(`   3. Go to "Logging and metrics" tab`);
      console.log(`   4. Enable logging to CloudWatch Logs`);
      console.log(`   5. Use log group name: ${logGroupName}`);
      return;
    }
    
    const logGroup = logGroupsResponse.logGroups[0];
    console.log(`✅ Log Group found: ${logGroup.logGroupName}`);
    console.log(`   Created: ${new Date(logGroup.creationTime).toISOString()}`);
    console.log(`   Stored Bytes: ${logGroup.storedBytes || 0}`);
    
    // Check subscription filters
    const describeFiltersCommand = new DescribeSubscriptionFiltersCommand({
      logGroupName: logGroup.logGroupName
    });
    
    const filtersResponse = await cwlClient.send(describeFiltersCommand);
    
    if (!filtersResponse.subscriptionFilters || filtersResponse.subscriptionFilters.length === 0) {
      console.log('\n❌ No Subscription Filters found!');
      console.log('\n⚠️  The subscription filter was not created. This should have been done automatically.');
      console.log('   Please check the waf-setup-monitoring Lambda logs for errors.');
      return;
    }
    
    console.log(`\n✅ Found ${filtersResponse.subscriptionFilters.length} subscription filter(s):`);
    filtersResponse.subscriptionFilters.forEach((filter, i) => {
      console.log(`\n  Filter ${i + 1}:`);
      console.log(`    Name: ${filter.filterName}`);
      console.log(`    Destination: ${filter.destinationArn}`);
      console.log(`    Filter Pattern: ${filter.filterPattern || '(empty - all logs)'}`);
      console.log(`    Created: ${new Date(filter.creationTime).toISOString()}`);
    });
    
    // Verify destination points to EVO account
    const evoDestinationArn = `arn:aws:logs:${activeConfig.region}:${EVO_ACCOUNT}:destination:evo-waf-logs-destination`;
    const hasCorrectDestination = filtersResponse.subscriptionFilters.some(
      f => f.destinationArn === evoDestinationArn
    );
    
    if (hasCorrectDestination) {
      console.log('\n✅ Subscription filter correctly points to EVO destination');
    } else {
      console.log('\n⚠️  Subscription filter destination does not match expected EVO destination');
      console.log(`   Expected: ${evoDestinationArn}`);
    }
    
  } catch (error) {
    console.log(`\n❌ Error checking customer account: ${error.message}`);
    if (error.name === 'AccessDenied') {
      console.log('\n⚠️  Cannot assume role in customer account.');
      console.log('   This is expected if you are not running from EVO production environment.');
      console.log('   Customer needs to verify their setup manually.');
    }
  }
  
  // Step 4: Summary and recommendations
  console.log('\n\n' + '='.repeat(80));
  console.log('📋 Summary and Recommendations\n');
  
  if (eventCount === 0) {
    console.log('⚠️  Status: Monitoring configured but no events received\n');
    console.log('Possible causes:');
    console.log('  1. WAF logging not enabled in customer account');
    console.log('  2. Subscription filter not created or misconfigured');
    console.log('  3. No traffic hitting the WAF yet');
    console.log('  4. WAF rules not blocking/counting any requests');
    console.log('\nNext steps:');
    console.log('  1. Verify WAF logging is enabled in AWS console');
    console.log('  2. Check CloudWatch Logs for the WAF log group');
    console.log('  3. Verify subscription filter exists and points to EVO destination');
    console.log('  4. Generate test traffic to trigger WAF rules');
  } else {
    console.log('✅ Status: Monitoring is working correctly!');
    console.log(`   ${eventCount} events received and processed`);
  }
  
  console.log('\n' + '='.repeat(80));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
