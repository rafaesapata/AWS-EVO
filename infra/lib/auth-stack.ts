import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

/**
 * AuthStack - Cognito User Pool com Atributos Customizados
 * 
 * IMPORTANTE: Atributos customizados do Cognito não podem ser criados
 * diretamente no UserPool via CloudFormation/CDK. É necessário usar
 * uma Custom Resource que chama AddCustomAttributes após a criação.
 */
export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const environment = this.node.tryGetContext('environment') || 'production';

    // =========================================================================
    // 1. Cognito User Pool (sem atributos customizados inicialmente)
    // =========================================================================
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `evo-uds-v3-${environment}-users`,
      
      // Self sign-up desabilitado - apenas admin cria usuários
      selfSignUpEnabled: false,
      
      // Usar email como username
      signInAliases: {
        email: true,
      },
      
      // Auto-verificar email
      autoVerify: {
        email: true,
      },
      
      // Atributos padrão
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        fullname: {
          required: false,
          mutable: true,
        },
      },
      
      // Password policy
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
        tempPasswordValidity: cdk.Duration.days(7),
      },
      
      // Account recovery
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      
      // Manter User Pool em caso de delete do stack
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // =========================================================================
    // 2. Custom Resource para adicionar atributos customizados
    // =========================================================================
    
    // Lambda que adiciona os atributos customizados
    const addCustomAttributesLambda = new lambda.Function(this, 'AddCustomAttributesLambda', {
      functionName: `evo-uds-${environment}-add-cognito-custom-attrs`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(60),
      code: lambda.Code.fromInline(`
const { CognitoIdentityProviderClient, AddCustomAttributesCommand } = require('@aws-sdk/client-cognito-identity-provider');

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  const userPoolId = event.ResourceProperties.UserPoolId;
  const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
  
  if (event.RequestType === 'Delete') {
    return { PhysicalResourceId: userPoolId };
  }
  
  try {
    const customAttributes = [
      { Name: 'organization_id', AttributeDataType: 'String', Mutable: true },
      { Name: 'organization_name', AttributeDataType: 'String', Mutable: true },
      { Name: 'roles', AttributeDataType: 'String', Mutable: true },
      { Name: 'tenant_id', AttributeDataType: 'String', Mutable: true }
    ];
    
    await client.send(new AddCustomAttributesCommand({
      UserPoolId: userPoolId,
      CustomAttributes: customAttributes
    }));
    
    console.log('Custom attributes added successfully');
    return { PhysicalResourceId: userPoolId, Data: { Message: 'Custom attributes added' } };
  } catch (error) {
    console.error('Error:', error);
    // Se os atributos já existem, considerar sucesso
    if (error.name === 'InvalidParameterException' && error.message.includes('already exists')) {
      return { PhysicalResourceId: userPoolId, Data: { Message: 'Attributes already exist' } };
    }
    throw error;
  }
};
      `),
    });

    // Permissões para a Lambda
    addCustomAttributesLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AddCustomAttributes', 'cognito-idp:DescribeUserPool'],
      resources: [this.userPool.userPoolArn],
    }));

    // Provider para Custom Resource
    const customAttributesProvider = new cr.Provider(this, 'CustomAttributesProvider', {
      onEventHandler: addCustomAttributesLambda,
    });

    // Custom Resource que adiciona os atributos
    const addCustomAttributes = new cdk.CustomResource(this, 'AddCustomAttributes', {
      serviceToken: customAttributesProvider.serviceToken,
      properties: {
        UserPoolId: this.userPool.userPoolId,
        // Adicionar timestamp para forçar update se necessário
        Timestamp: Date.now().toString(),
      },
    });

    // =========================================================================
    // 3. User Pool Client (criado APÓS os atributos customizados)
    // =========================================================================
    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `evo-uds-v3-${environment}-client`,
      generateSecret: false,
      
      // Auth flows
      authFlows: {
        userPassword: true,
        adminUserPassword: true,
        userSrp: true,
        custom: false,
      },
      
      // Atributos que o client pode ler/escrever
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          fullname: true,
        })
        .withCustomAttributes('organization_id', 'organization_name', 'roles', 'tenant_id'),
      
      writeAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          fullname: true,
        })
        .withCustomAttributes('organization_id', 'organization_name', 'roles', 'tenant_id'),
      
      // Identity providers
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ],
      
      // Token validity
      accessTokenValidity: cdk.Duration.minutes(60),
      idTokenValidity: cdk.Duration.minutes(60),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // Garantir que o client seja criado após os atributos customizados
    this.userPoolClient.node.addDependency(addCustomAttributes);

    // =========================================================================
    // 4. Outputs
    // =========================================================================
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `${this.stackName}-UserPoolId`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: `${this.stackName}-UserPoolClientId`,
    });

    new cdk.CfnOutput(this, 'UserPoolArn', {
      value: this.userPool.userPoolArn,
      description: 'Cognito User Pool ARN',
      exportName: `${this.stackName}-UserPoolArn`,
    });

    new cdk.CfnOutput(this, 'CustomAttributes', {
      value: 'organization_id, organization_name, roles, tenant_id',
      description: 'Custom attributes configured in User Pool',
    });
  }
}
