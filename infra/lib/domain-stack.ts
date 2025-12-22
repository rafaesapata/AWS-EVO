import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';

export interface DomainStackProps extends cdk.StackProps {
  distribution: cloudfront.Distribution;
  api: apigateway.RestApi;
  domainName: string;
  hostedZoneId: string;
  hostedZoneName: string;
}

export class DomainStack extends cdk.Stack {
  public readonly certificate: acm.Certificate;
  public readonly domainName: string;

  constructor(scope: Construct, id: string, props: DomainStackProps) {
    super(scope, id, props);

    this.domainName = props.domainName;

    // Import existing hosted zone
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.hostedZoneName,
    });

    // Create SSL certificate for the domain
    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: props.domainName,
      subjectAlternativeNames: [`*.${props.domainName}`],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // Create custom domain for API Gateway
    const apiDomainName = new apigateway.DomainName(this, 'ApiDomainName', {
      domainName: `api.${props.domainName}`,
      certificate: this.certificate,
      endpointType: apigateway.EndpointType.REGIONAL,
      securityPolicy: apigateway.SecurityPolicy.TLS_1_2,
    });

    // Map API to custom domain
    apiDomainName.addBasePathMapping(props.api, {
      basePath: '',
    });

    // Create A record for API subdomain
    new route53.ARecord(this, 'ApiAliasRecord', {
      zone: hostedZone,
      recordName: `api.${props.domainName}`,
      target: route53.RecordTarget.fromAlias(
        new targets.ApiGatewayDomain(apiDomainName)
      ),
    });

    // Create A record for main domain (CloudFront)
    new route53.ARecord(this, 'FrontendAliasRecord', {
      zone: hostedZone,
      recordName: props.domainName,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(props.distribution)
      ),
    });

    // Create CNAME record for www subdomain
    new route53.CnameRecord(this, 'WwwCnameRecord', {
      zone: hostedZone,
      recordName: `www.${props.domainName}`,
      domainName: props.distribution.distributionDomainName,
    });

    // Outputs
    new cdk.CfnOutput(this, 'DomainName', {
      value: props.domainName,
      description: 'Custom domain name',
    });

    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${props.domainName}`,
      description: 'Frontend URL with custom domain',
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: `https://api.${props.domainName}`,
      description: 'API URL with custom domain',
    });

    new cdk.CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      description: 'SSL Certificate ARN',
    });
  }
}