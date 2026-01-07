#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TempMigrationStack } from './temp-migration-stack';

const app = new cdk.App();

new TempMigrationStack(app, 'EvoUdsTempMigrationStack', {
  env: {
    account: '971354623291',
    region: 'us-east-1',
  },
});