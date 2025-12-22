import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

export interface MonitoringStackProps extends cdk.StackProps {
  api: apigateway.RestApi;
  database: rds.DatabaseInstance;
}

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    // SNS Topic for alerts
    const alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: 'EvoUdsAlerts',
      displayName: 'EVO UDS System Alerts',
    });

    // Email subscription (replace with actual email)
    alertTopic.addSubscription(
      new snsSubscriptions.EmailSubscription('admin@evo-uds.com')
    );

    // API Gateway Alarms
    const apiErrorAlarm = new cloudwatch.Alarm(this, 'ApiErrorAlarm', {
      alarmName: 'EVO-UDS-API-Errors',
      alarmDescription: 'API Gateway 4XX/5XX errors',
      metric: props.api.metricClientError().with({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    apiErrorAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(alertTopic)
    );

    const apiLatencyAlarm = new cloudwatch.Alarm(this, 'ApiLatencyAlarm', {
      alarmName: 'EVO-UDS-API-Latency',
      alarmDescription: 'API Gateway high latency',
      metric: props.api.metricLatency().with({
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5000, // 5 seconds
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    apiLatencyAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(alertTopic)
    );

    // Database Alarms
    const dbConnectionAlarm = new cloudwatch.Alarm(this, 'DatabaseConnectionAlarm', {
      alarmName: 'EVO-UDS-DB-Connections',
      alarmDescription: 'Database connection count high',
      metric: props.database.metricDatabaseConnections().with({
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80, // 80% of max connections
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    dbConnectionAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(alertTopic)
    );

    const dbCpuAlarm = new cloudwatch.Alarm(this, 'DatabaseCpuAlarm', {
      alarmName: 'EVO-UDS-DB-CPU',
      alarmDescription: 'Database CPU utilization high',
      metric: props.database.metricCPUUtilization().with({
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80, // 80% CPU
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    dbCpuAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(alertTopic)
    );

    // CloudWatch Dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'EvoUdsDashboard', {
      dashboardName: 'EVO-UDS-System-Dashboard',
    });

    // API Metrics Widget
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway Metrics',
        left: [
          props.api.metricCount(),
          props.api.metricLatency(),
        ],
        right: [
          props.api.metricClientError(),
          props.api.metricServerError(),
        ],
        width: 12,
        height: 6,
      })
    );

    // Database Metrics Widget
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Database Metrics',
        left: [
          props.database.metricCPUUtilization(),
          props.database.metricDatabaseConnections(),
        ],
        right: [
          props.database.metric('ReadLatency'),
          props.database.metric('WriteLatency'),
        ],
        width: 12,
        height: 6,
      })
    );

    // Outputs
    new cdk.CfnOutput(this, 'AlertTopicArn', {
      value: alertTopic.topicArn,
      description: 'SNS Alert Topic ARN',
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${cdk.Aws.REGION}.console.aws.amazon.com/cloudwatch/home?region=${cdk.Aws.REGION}#dashboards:name=${dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL',
    });
  }
}
