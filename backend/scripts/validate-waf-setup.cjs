#!/usr/bin/env node

/**
 * WAF Monitoring Complete Validation Script
 * 
 * Validates the entire WAF monitoring setup:
 * 1. Database configuration
 * 2. Customer AWS account (Log Groups, Subscription Filters)
 * 3. EVO CloudWatch Destinations
 * 4. Recent WAF events
 * 
 * Usage: node validate-waf-setup.cjs
 */

// Load environment variables
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { 
  CloudWatchLogsClient, 
  DescribeLogGroupsCommand,
  DescribeSubscriptionFiltersCommand,
  DescribeLogStreamsCommand
} = require('@aws-sdk/client-cloudwatch-logs');
const { 
  WAFV2Client,
  GetLoggingConfigurationCommand 
} = require('@aws-sdk/client-wafv2');
const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(message) {
  console.log('\n' + '='.repeat(80));
  log(message, 'bright');
  console.log('='.repeat(80) + '\n');
}

function section(message) {
  log(`\n${message}`, 'cyan');
  console.log('-'.repeat(80));
}

const prisma = new PrismaClient();

// Configuration
const ORG_ID = '0f1b33dc-cd5f-49e5-8579-fb4e7b1f5a42';
const EVO_ACCOUNT = '383234048592';
const EVO_REGION = 'us-east-1';

async function main() {
  header('🔍 WAF Monitoring Complete Validation');
  
  try {
    // Step 1: Check database configuration
    section('📊 Step 1: Database Configuration');
    
    const configs = await prisma.wafMonitoringConfig.findMany({
      where: { organizationId: ORG_ID },
      orderBy: { createdAt: 'desc' }
    });
    
    log(`Found ${configs.length} WAF configuration(s)`, configs.length > 0 ? 'green' : 'yellow');
    
    if (configs.length === 0) {
      log('❌ No WAF configurations found in database!', 'red');
      log('\nThis means the WAF monitoring was never set up.', 'yellow');
      log('Please use the EVO dashboard to configure WAF monitoring.', 'yellow');
      return;
    }
    
    configs.forEach((config, i) => {
      console.log(`\n  Config ${i + 1}:`);
      console.log(`    ID: ${config.id}`);
      console.log(`    WAF ACL: ${config.webAclName}`);
      console.log(`    ARN: ${config.webAclArn}`);
      log(`    Active: ${config.isActive ? '✅ YES' : '❌ NO'}`, config.isActive ? 'green' : 'red');
      console.log(`    Filter Mode: ${config.filterMode}`);
      console.log(`    AWS Account: ${config.awsAccountId}`);
      console.log(`    Region: ${config.region}`);
      console.log(`    Events Today: ${config.eventsToday || 0}`);
      console.log(`    Blocked Today: ${config.blockedToday || 0}`);
      console.log(`    Last Event: ${config.lastEventAt ? new Date(config.lastEventAt).toISOString() : 'Never'}`);
    });
    
    const activeConfig = configs.find(c => c.isActive);
    if (!activeConfig) {
      log('\n❌ No active WAF configuration found!', 'red');
      return;
    }
    
    log(`\n✅ Active configuration found: ${activeConfig.webAclName}`, 'green');
    
    // Step 2: Check WAF events in database
    section('📈 Step 2: WAF Events in Database');
    
    const eventCount = await prisma.wafEvent.count({
      where: { organizationId: ORG_ID }
    });
    
    log(`Total WAF events: ${eventCount}`, eventCount > 0 ? 'green' : 'yellow');
    
    if (eventCount > 0) {
      const recentEvents = await prisma.wafEvent.findMany({
        where: { organizationId: ORG_ID },
        orderBy: { timestamp: 'desc' },
        take: 5
      });
      
      console.log('\nMost recent events:');
      recentEvents.forEach((event, i) => {
        console.log(`  ${i + 1}. ${event.timestamp.toISOString()} - ${event.action} - ${event.sourceIp} - ${event.country || 'Unknown'}`);
      });
      
      log('\n✅ Events are being received and processed!', 'green');
    } else {
      log('\n⚠️  No events found - monitoring is configured but no logs received yet', 'yellow');
    }
    
    // Step 3: Check customer AWS account setup
    section('☁️  Step 3: Customer AWS Account Setup');
    
    log(`Customer Account: ${activeConfig.awsAccountId}`, 'cyan');
    log(`Region: ${activeConfig.region}`, 'cyan');
    log(`WAF ACL: ${activeConfig.webAclName}`, 'cyan');
    
    try {
      // Assume role in customer account
      log('\nAssuming role in customer account...', 'blue');
      const stsClient = new STSClient({ region: EVO_REGION });
      const assumeRoleCommand = new AssumeRoleCommand({
        RoleArn: `arn:aws:iam::${activeConfig.awsAccountId}:role/EVO-Platform-Role`,
        RoleSessionName: 'waf-diagnostic',
        DurationSeconds: 900
      });
      
      const assumeRoleResponse = await stsClient.send(assumeRoleCommand);
      log('✅ Successfully assumed role', 'green');
      
      const customerCredentials = {
        accessKeyId: assumeRoleResponse.Credentials.AccessKeyId,
        secretAccessKey: assumeRoleResponse.Credentials.SecretAccessKey,
        sessionToken: assumeRoleResponse.Credentials.SessionToken
      };
      
      // Check WAF logging configuration
      log('\nChecking WAF logging configuration...', 'blue');
      const wafClient = new WAFV2Client({
        region: activeConfig.region,
        credentials: customerCredentials
      });
      
      try {
        const loggingConfig = await wafClient.send(
          new GetLoggingConfigurationCommand({
            ResourceArn: activeConfig.webAclArn
          })
        );
        
        if (loggingConfig.LoggingConfiguration) {
          log('✅ WAF logging is ENABLED', 'green');
          const destinations = loggingConfig.LoggingConfiguration.LogDestinationConfigs || [];
          console.log(`   Destinations: ${destinations.length}`);
          destinations.forEach((dest, i) => {
            console.log(`     ${i + 1}. ${dest}`);
          });
        } else {
          log('❌ WAF logging is NOT configured', 'red');
        }
      } catch (error) {
        if (error.name === 'WAFNonexistentItemException') {
          log('❌ WAF logging is NOT enabled', 'red');
          log('\n⚠️  To enable WAF logging:', 'yellow');
          log('   1. Go to AWS WAF Console', 'yellow');
          log(`   2. Select Web ACL: ${activeConfig.webAclName}`, 'yellow');
          log('   3. Go to "Logging and metrics" tab', 'yellow');
          log('   4. Enable logging to CloudWatch Logs', 'yellow');
        } else {
          throw error;
        }
      }
      
      // Check CloudWatch Log Group
      log('\nChecking CloudWatch Log Group...', 'blue');
      const cwlClient = new CloudWatchLogsClient({
        region: activeConfig.region,
        credentials: customerCredentials
      });
      
      const wafId = activeConfig.webAclArn.split('/').pop();
      const logGroupName = `aws-waf-logs-${wafId}`;
      
      log(`Expected Log Group: ${logGroupName}`, 'cyan');
      
      const describeLogGroupsCommand = new DescribeLogGroupsCommand({
        logGroupNamePrefix: logGroupName
      });
      
      const logGroupsResponse = await cwlClient.send(describeLogGroupsCommand);
      
      if (!logGroupsResponse.logGroups || logGroupsResponse.logGroups.length === 0) {
        log('❌ Log Group NOT FOUND!', 'red');
        log('\n⚠️  WAF logging is not enabled or log group was not created.', 'yellow');
        return;
      }
      
      const logGroup = logGroupsResponse.logGroups[0];
      log(`✅ Log Group found: ${logGroup.logGroupName}`, 'green');
      console.log(`   Created: ${new Date(logGroup.creationTime).toISOString()}`);
      console.log(`   Stored Bytes: ${logGroup.storedBytes || 0}`);
      
      // Check for recent log streams
      log('\nChecking for recent log streams...', 'blue');
      try {
        const logStreamsResponse = await cwlClient.send(
          new DescribeLogStreamsCommand({
            logGroupName: logGroup.logGroupName,
            orderBy: 'LastEventTime',
            descending: true,
            limit: 5
          })
        );
        
        if (logStreamsResponse.logStreams && logStreamsResponse.logStreams.length > 0) {
          log(`✅ Found ${logStreamsResponse.logStreams.length} recent log stream(s)`, 'green');
          logStreamsResponse.logStreams.forEach((stream, i) => {
            const lastEvent = stream.lastEventTimestamp 
              ? new Date(stream.lastEventTimestamp).toISOString()
              : 'No events';
            console.log(`   ${i + 1}. ${stream.logStreamName}`);
            console.log(`      Last event: ${lastEvent}`);
          });
        } else {
          log('⚠️  No log streams found', 'yellow');
          log('   This means the WAF hasn\'t received any traffic yet.', 'yellow');
        }
      } catch (error) {
        log(`⚠️  Could not check log streams: ${error.message}`, 'yellow');
      }
      
      // Check subscription filters
      log('\nChecking subscription filters...', 'blue');
      const describeFiltersCommand = new DescribeSubscriptionFiltersCommand({
        logGroupName: logGroup.logGroupName
      });
      
      const filtersResponse = await cwlClient.send(describeFiltersCommand);
      
      if (!filtersResponse.subscriptionFilters || filtersResponse.subscriptionFilters.length === 0) {
        log('❌ No Subscription Filters found!', 'red');
        log('\n⚠️  The subscription filter was not created.', 'yellow');
        log('   This should have been done automatically by the waf-setup-monitoring Lambda.', 'yellow');
        log('   Check the Lambda logs for errors.', 'yellow');
        
        const evoDestinationArn = `arn:aws:logs:${activeConfig.region}:${EVO_ACCOUNT}:destination:evo-waf-logs-destination`;
        log('\nTo create manually:', 'yellow');
        log(`aws logs put-subscription-filter \\`, 'cyan');
        log(`  --log-group-name "${logGroupName}" \\`, 'cyan');
        log(`  --filter-name "evo-waf-monitoring" \\`, 'cyan');
        log(`  --filter-pattern "" \\`, 'cyan');
        log(`  --destination-arn "${evoDestinationArn}" \\`, 'cyan');
        log(`  --role-arn "arn:aws:iam::${activeConfig.awsAccountId}:role/EVOCloudWatchLogsRole" \\`, 'cyan');
        log(`  --region "${activeConfig.region}"`, 'cyan');
        
        return;
      }
      
      log(`✅ Found ${filtersResponse.subscriptionFilters.length} subscription filter(s)`, 'green');
      
      const evoDestinationArn = `arn:aws:logs:${activeConfig.region}:${EVO_ACCOUNT}:destination:evo-waf-logs-destination`;
      
      filtersResponse.subscriptionFilters.forEach((filter, i) => {
        console.log(`\n  Filter ${i + 1}:`);
        console.log(`    Name: ${filter.filterName}`);
        console.log(`    Destination: ${filter.destinationArn}`);
        console.log(`    Filter Pattern: ${filter.filterPattern || '(empty - all logs)'}`);
        console.log(`    Created: ${new Date(filter.creationTime).toISOString()}`);
        
        if (filter.destinationArn === evoDestinationArn) {
          log('    ✅ Correctly points to EVO destination', 'green');
        } else {
          log('    ⚠️  Does NOT point to EVO destination', 'yellow');
          log(`    Expected: ${evoDestinationArn}`, 'yellow');
        }
      });
      
    } catch (error) {
      if (error.name === 'AccessDenied' || error.message.includes('is not authorized')) {
        log(`\n❌ Cannot assume role in customer account: ${error.message}`, 'red');
        log('\n⚠️  This is expected if:', 'yellow');
        log('   - You are not running from EVO production environment', 'yellow');
        log('   - The EVO-Platform-Role does not exist in customer account', 'yellow');
        log('   - The role trust policy does not allow EVO account', 'yellow');
        log('\nCustomer needs to verify their setup manually.', 'yellow');
      } else {
        throw error;
      }
    }
    
    // Final Summary
    header('📋 Summary and Recommendations');
    
    if (eventCount === 0) {
      log('⚠️  Status: Monitoring configured but NO events received\n', 'yellow');
      log('Possible causes:', 'yellow');
      log('  1. WAF logging not enabled in customer account', 'yellow');
      log('  2. Subscription filter not created or misconfigured', 'yellow');
      log('  3. No traffic hitting the WAF yet', 'yellow');
      log('  4. WAF rules not blocking/counting any requests', 'yellow');
      log('\nNext steps:', 'cyan');
      log('  1. Verify WAF logging is enabled (see output above)', 'cyan');
      log('  2. Check subscription filter exists and points to EVO', 'cyan');
      log('  3. Generate test traffic to trigger WAF rules', 'cyan');
      log('  4. Wait 5-10 minutes and check EVO dashboard', 'cyan');
    } else {
      log('✅ Status: Monitoring is working correctly!', 'green');
      log(`   ${eventCount} events received and processed`, 'green');
      log('\nThe system is fully operational! 🎉', 'green');
    }
    
  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
