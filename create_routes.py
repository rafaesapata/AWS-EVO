#!/usr/bin/env python3
import boto3
import time

# Configuração
API_ID = "w5gyvgfskh"
AUTHORIZER_ID = "shn0ze"
REGION = "us-east-1"
ACCOUNT_ID = "523115032346"

# Cliente AWS
session = boto3.Session(profile_name='EVO_PRODUCTION', region_name=REGION)
apigw = session.client('apigatewayv2')
lambda_client = session.client('lambda')

# Mapeamento de Lambdas para rotas (principais)
ROUTES = {
    # Auth (sem autenticação)
    'evo-uds-v3-production-register': ('/api/auth/register', False),
    'evo-uds-v3-production-refresh-token': ('/api/auth/refresh', False),
    'evo-uds-v3-production-forgot-password': ('/api/auth/forgot-password', False),
    'evo-uds-v3-production-reset-password': ('/api/auth/reset-password', False),
    'evo-uds-v3-production-mfa-verify-login': ('/api/auth/mfa/verify', False),
    
    # Auth (com autenticação)
    'evo-uds-v3-production-logout': ('/api/auth/logout', True),
    'evo-uds-v3-production-change-password': ('/api/auth/change-password', True),
    'evo-uds-v3-production-mfa-enroll': ('/api/auth/mfa/enroll', True),
    'evo-uds-v3-production-mfa-check': ('/api/auth/mfa/check', True),
    'evo-uds-v3-production-mfa-list-factors': ('/api/auth/mfa/factors', True),
    
    # AWS Credentials
    'evo-uds-v3-production-save-aws-credentials': ('/api/aws/credentials', True),
    'evo-uds-v3-production-list-aws-credentials': ('/api/aws/credentials/list', True),
    'evo-uds-v3-production-validate-aws-credentials': ('/api/aws/credentials/validate', True),
    'evo-uds-v3-production-delete-aws-credentials': ('/api/aws/credentials/delete', True),
    
    # Azure Credentials
    'evo-uds-v3-production-save-azure-credentials': ('/api/azure/credentials', True),
    'evo-uds-v3-production-list-azure-credentials': ('/api/azure/credentials/list', True),
    'evo-uds-v3-production-validate-azure-credentials': ('/api/azure/credentials/validate', True),
    
    # Security
    'evo-uds-v3-production-security-scan': ('/api/security/scan', True),
    'evo-uds-v3-production-list-security-scans': ('/api/security/scans', True),
    'evo-uds-v3-production-compliance-scan': ('/api/security/compliance', True),
    
    # Costs
    'evo-uds-v3-production-fetch-daily-costs': ('/api/costs/daily', True),
    'evo-uds-v3-production-cost-optimization': ('/api/costs/optimization', True),
    
    # Dashboard
    'evo-uds-v3-production-dashboard-metrics': ('/api/dashboard/metrics', True),
    'evo-uds-v3-production-executive-dashboard': ('/api/dashboard/executive', True),
    
    # Organizations
    'evo-uds-v3-production-list-organizations': ('/api/organizations', True),
    
    # Users
    'evo-uds-v3-production-list-users': ('/api/users', True),
    
    # Licenses
    'evo-uds-v3-production-validate-license': ('/api/licenses/validate', True),
}

def create_route(lambda_name, path, needs_auth):
    try:
        print(f"Criando: {path} -> {lambda_name}")
        
        # Criar integração
        integration = apigw.create_integration(
            ApiId=API_ID,
            IntegrationType='AWS_PROXY',
            IntegrationUri=f'arn:aws:lambda:{REGION}:{ACCOUNT_ID}:function:{lambda_name}',
            PayloadFormatVersion='2.0'
        )
        integration_id = integration['IntegrationId']
        
        # Criar rota
        route_params = {
            'ApiId': API_ID,
            'RouteKey': f'POST {path}',
            'Target': f'integrations/{integration_id}'
        }
        
        if needs_auth:
            route_params['AuthorizationType'] = 'JWT'
            route_params['AuthorizerId'] = AUTHORIZER_ID
        
        route = apigw.create_route(**route_params)
        
        # Adicionar permissão Lambda
        try:
            lambda_client.add_permission(
                FunctionName=lambda_name,
                StatementId=f'apigw-{int(time.time())}',
                Action='lambda:InvokeFunction',
                Principal='apigateway.amazonaws.com',
                SourceArn=f'arn:aws:execute-api:{REGION}:{ACCOUNT_ID}:{API_ID}/*/*'
            )
        except:
            pass
        
        print(f"  ✓ Criada: {route['RouteId']}")
        return True
        
    except Exception as e:
        print(f"  ✗ Erro: {str(e)}")
        return False

# Criar rotas
print(f"Criando {len(ROUTES)} rotas principais...\n")

success = 0
failed = 0

for lambda_name, (path, needs_auth) in ROUTES.items():
    if create_route(lambda_name, path, needs_auth):
        success += 1
    else:
        failed += 1
    time.sleep(0.5)

print(f"\n✓ Concluído: {success} rotas criadas, {failed} falharam")
