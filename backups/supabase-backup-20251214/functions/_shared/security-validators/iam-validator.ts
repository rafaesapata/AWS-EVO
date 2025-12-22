// IAM Security Validator - Advanced IAM Analysis
import { signAWSGetRequest } from '../aws-credentials-helper.ts';

export interface IAMFinding {
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  analysis: string;
  resource_id: string;
  resource_arn?: string;
  scan_type: string;
  service: string;
  evidence: any;
}

interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region?: string;
}

// Check for IAM policies with dangerous wildcards
export async function analyzeIAMPolicies(credentials: AWSCredentials): Promise<IAMFinding[]> {
  const findings: IAMFinding[] = [];
  
  try {
    // List all managed policies
    const policies = await listPolicies(credentials);
    
    for (const policy of policies) {
      if (!policy.Arn || policy.Arn.startsWith('arn:aws:iam::aws:')) continue; // Skip AWS managed
      
      const policyVersion = await getPolicyVersion(credentials, policy.Arn, policy.DefaultVersionId);
      if (!policyVersion?.Document) continue;
      
      const document = typeof policyVersion.Document === 'string' 
        ? JSON.parse(decodeURIComponent(policyVersion.Document))
        : policyVersion.Document;
      
      const statements = Array.isArray(document.Statement) ? document.Statement : [document.Statement];
      
      for (const statement of statements) {
        if (statement.Effect !== 'Allow') continue;
        
        const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
        const resources = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource];
        
        // Check for * in actions
        const hasWildcardAction = actions.some((a: string) => a === '*' || a.endsWith(':*'));
        const hasWildcardResource = resources.some((r: string) => r === '*');
        
        if (hasWildcardAction && hasWildcardResource) {
          findings.push({
            severity: 'critical',
            title: `Política IAM com Permissões Administrativas (*)`,
            description: `Política ${policy.PolicyName} concede acesso irrestrito`,
            analysis: `RISCO CRÍTICO: A política ${policy.PolicyName} contém Action: "*" com Resource: "*", concedendo permissões administrativas completas. Isso viola o princípio do mínimo privilégio e permite qualquer operação em qualquer recurso. Mitigação: (1) Identificar ações específicas necessárias, (2) Restringir recursos específicos, (3) Usar conditions quando possível, (4) Implementar separação de funções (SoD).`,
            resource_id: policy.PolicyName,
            resource_arn: policy.Arn,
            scan_type: 'iam_admin_policy',
            service: 'IAM',
            evidence: { 
              policyArn: policy.Arn,
              actions: actions,
              resources: resources,
              dangerousStatements: [statement]
            }
          });
        } else if (hasWildcardAction) {
          findings.push({
            severity: 'high',
            title: `Política IAM com Actions Wildcard`,
            description: `Política ${policy.PolicyName} usa "*" em actions`,
            analysis: `RISCO ALTO: A política ${policy.PolicyName} usa wildcard em actions (${actions.filter((a: string) => a.includes('*')).join(', ')}). Isso permite todas as operações do serviço especificado. Mitigação: Especificar apenas ações necessárias.`,
            resource_id: policy.PolicyName,
            resource_arn: policy.Arn,
            scan_type: 'iam_wildcard_action',
            service: 'IAM',
            evidence: { policyArn: policy.Arn, wildcardActions: actions.filter((a: string) => a.includes('*')) }
          });
        }
        
        // Check for dangerous actions
        const dangerousActions = [
          'iam:*', 'iam:CreateUser', 'iam:CreateAccessKey', 'iam:AttachUserPolicy',
          'iam:AttachRolePolicy', 'iam:PutUserPolicy', 'iam:PutRolePolicy',
          'sts:AssumeRole', 'organizations:*', 'ec2:*', 's3:*', 'rds:*',
          'lambda:*', 'kms:*', 'secretsmanager:*'
        ];
        
        const foundDangerous = actions.filter((a: string) => 
          dangerousActions.some(d => a === d || (d.endsWith('*') && a.startsWith(d.slice(0, -1))))
        );
        
        if (foundDangerous.length > 0 && !hasWildcardAction) {
          findings.push({
            severity: 'high',
            title: `Política IAM com Ações Privilegiadas`,
            description: `Política ${policy.PolicyName} contém ações sensíveis`,
            analysis: `RISCO ALTO: A política ${policy.PolicyName} contém ações privilegiadas: ${foundDangerous.join(', ')}. Essas ações podem ser usadas para escalação de privilégios. Mitigação: Revisar necessidade real e aplicar conditions (MFA, IP, etc.).`,
            resource_id: policy.PolicyName,
            resource_arn: policy.Arn,
            scan_type: 'iam_privileged_actions',
            service: 'IAM',
            evidence: { policyArn: policy.Arn, privilegedActions: foundDangerous }
          });
        }
      }
    }
  } catch (error) {
    console.error('Error analyzing IAM policies:', error);
  }
  
  return findings;
}

// Analyze IAM Role Trust Policies
export async function analyzeRoleTrustPolicies(credentials: AWSCredentials): Promise<IAMFinding[]> {
  const findings: IAMFinding[] = [];
  
  try {
    const roles = await listRoles(credentials);
    
    for (const role of roles) {
      if (!role.AssumeRolePolicyDocument) continue;
      
      const trustPolicy = typeof role.AssumeRolePolicyDocument === 'string'
        ? JSON.parse(decodeURIComponent(role.AssumeRolePolicyDocument))
        : role.AssumeRolePolicyDocument;
      
      const statements = Array.isArray(trustPolicy.Statement) ? trustPolicy.Statement : [trustPolicy.Statement];
      
      for (const statement of statements) {
        if (statement.Effect !== 'Allow') continue;
        
        const principals = statement.Principal;
        
        // Check for overly permissive trust
        if (principals === '*' || principals?.AWS === '*') {
          findings.push({
            severity: 'critical',
            title: `Role com Trust Policy Aberta para Qualquer Conta`,
            description: `Role ${role.RoleName} pode ser assumida por qualquer entidade AWS`,
            analysis: `RISCO CRÍTICO: A role ${role.RoleName} tem trust policy permitindo Principal: "*", permitindo que QUALQUER conta AWS assuma esta role. Isso é extremamente perigoso e pode resultar em acesso não autorizado completo. Mitigação: (1) Especificar accounts/roles específicos, (2) Adicionar conditions (ExternalId, MFA), (3) Usar aws:PrincipalOrgID para limitar à sua organização.`,
            resource_id: role.RoleName,
            resource_arn: role.Arn,
            scan_type: 'iam_role_open_trust',
            service: 'IAM',
            evidence: { roleArn: role.Arn, trustPolicy: trustPolicy }
          });
        }
        
        // Check for trust to external accounts
        const awsPrincipals = Array.isArray(principals?.AWS) ? principals.AWS : (principals?.AWS ? [principals.AWS] : []);
        const externalAccounts = awsPrincipals.filter((p: string) => {
          if (p === '*') return true;
          const match = p.match(/arn:aws:iam::(\d+):/);
          return match && match[1] !== credentials.accessKeyId?.slice(0, 12); // Compare with account
        });
        
        if (externalAccounts.length > 0 && !statement.Condition?.StringEquals?.['sts:ExternalId']) {
          findings.push({
            severity: 'high',
            title: `Role Confia em Conta Externa sem ExternalId`,
            description: `Role ${role.RoleName} permite assume de conta externa sem proteção`,
            analysis: `RISCO ALTO: A role ${role.RoleName} confia em contas externas (${externalAccounts.join(', ')}) sem exigir ExternalId. Isso facilita ataques de "confused deputy". Mitigação: Adicionar Condition com sts:ExternalId único e secreto.`,
            resource_id: role.RoleName,
            resource_arn: role.Arn,
            scan_type: 'iam_role_no_external_id',
            service: 'IAM',
            evidence: { roleArn: role.Arn, externalAccounts, hasExternalId: false }
          });
        }
        
        // Check for federated identity without conditions
        if (principals?.Federated && !statement.Condition) {
          findings.push({
            severity: 'high',
            title: `Role Federada sem Conditions`,
            description: `Role ${role.RoleName} aceita federação sem restrições`,
            analysis: `RISCO ALTO: A role ${role.RoleName} aceita identidades federadas sem conditions. Qualquer usuário do IdP pode assumir esta role. Mitigação: Adicionar conditions para restringir claims específicos (grupos, atributos).`,
            resource_id: role.RoleName,
            resource_arn: role.Arn,
            scan_type: 'iam_role_federated_no_conditions',
            service: 'IAM',
            evidence: { roleArn: role.Arn, federatedPrincipal: principals.Federated }
          });
        }
      }
    }
  } catch (error) {
    console.error('Error analyzing role trust policies:', error);
  }
  
  return findings;
}

// Analyze Access Key Usage
export async function analyzeAccessKeyUsage(credentials: AWSCredentials, users: any[]): Promise<IAMFinding[]> {
  const findings: IAMFinding[] = [];
  
  for (const user of users) {
    try {
      const accessKeys = await listAccessKeys(credentials, user.UserName);
      
      for (const key of accessKeys) {
        const lastUsed = await getAccessKeyLastUsed(credentials, key.AccessKeyId);
        const createDate = new Date(key.CreateDate);
        const daysOld = Math.floor((Date.now() - createDate.getTime()) / (1000 * 60 * 60 * 24));
        
        // Key never used
        if (!lastUsed?.LastUsedDate && daysOld > 30) {
          findings.push({
            severity: 'high',
            title: `Chave IAM Nunca Utilizada (${daysOld} dias)`,
            description: `Usuário ${user.UserName} possui chave criada há ${daysOld} dias sem uso`,
            analysis: `RISCO ALTO: A chave ${key.AccessKeyId} do usuário ${user.UserName} foi criada há ${daysOld} dias e nunca foi utilizada. Chaves não utilizadas são superfície de ataque desnecessária. Mitigação: (1) Deletar chave imediatamente, (2) Investigar motivo da criação, (3) Implementar política de lifecycle de chaves.`,
            resource_id: user.UserName,
            scan_type: 'iam_key_never_used',
            service: 'IAM',
            evidence: { keyId: key.AccessKeyId, ageInDays: daysOld, neverUsed: true }
          });
        }
        
        // Key not used recently (90+ days)
        if (lastUsed?.LastUsedDate) {
          const lastUsedDate = new Date(lastUsed.LastUsedDate);
          const daysSinceUse = Math.floor((Date.now() - lastUsedDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysSinceUse > 90) {
            findings.push({
              severity: 'medium',
              title: `Chave IAM Inativa há ${daysSinceUse} Dias`,
              description: `Usuário ${user.UserName} com chave sem uso recente`,
              analysis: `RISCO MÉDIO: A chave ${key.AccessKeyId} não é usada há ${daysSinceUse} dias. Chaves inativas devem ser desativadas ou rotacionadas. Mitigação: (1) Confirmar se ainda é necessária, (2) Desativar ou deletar se não for, (3) Rotacionar se ainda for usada.`,
              resource_id: user.UserName,
              scan_type: 'iam_key_inactive',
              service: 'IAM',
              evidence: { keyId: key.AccessKeyId, daysSinceUse, lastUsedDate: lastUsed.LastUsedDate }
            });
          }
        }
        
        // Multiple active keys
        const activeKeys = accessKeys.filter((k: any) => k.Status === 'Active');
        if (activeKeys.length > 1) {
          findings.push({
            severity: 'medium',
            title: `Usuário IAM com Múltiplas Chaves Ativas`,
            description: `Usuário ${user.UserName} possui ${activeKeys.length} chaves ativas`,
            analysis: `RISCO MÉDIO: O usuário ${user.UserName} possui ${activeKeys.length} chaves de acesso ativas simultaneamente. Isso dificulta auditoria e aumenta superfície de ataque. Mitigação: Manter apenas uma chave ativa por vez, rotacionar usando o padrão de duas chaves (criar nova, atualizar apps, deletar antiga).`,
            resource_id: user.UserName,
            scan_type: 'iam_multiple_keys',
            service: 'IAM',
            evidence: { activeKeyCount: activeKeys.length, keyIds: activeKeys.map((k: any) => k.AccessKeyId) }
          });
        }
      }
    } catch (error) {
      console.error(`Error analyzing access keys for ${user.UserName}:`, error);
    }
  }
  
  return findings;
}

// Analyze IAM Users without Groups (direct policies)
export async function analyzeUserPolicies(credentials: AWSCredentials, users: any[]): Promise<IAMFinding[]> {
  const findings: IAMFinding[] = [];
  
  for (const user of users) {
    try {
      // Check attached policies directly to user
      const attachedPolicies = await listAttachedUserPolicies(credentials, user.UserName);
      const inlinePolicies = await listUserInlinePolicies(credentials, user.UserName);
      const groups = await listGroupsForUser(credentials, user.UserName);
      
      if (groups.length === 0 && (attachedPolicies.length > 0 || inlinePolicies.length > 0)) {
        findings.push({
          severity: 'medium',
          title: `Usuário IAM com Policies Diretas (sem Grupos)`,
          description: `Usuário ${user.UserName} tem políticas anexadas diretamente`,
          analysis: `RISCO MÉDIO: O usuário ${user.UserName} possui ${attachedPolicies.length} políticas anexadas e ${inlinePolicies.length} políticas inline diretamente, sem usar grupos. Isso dificulta governança e auditoria. Mitigação: (1) Criar grupos por função/departamento, (2) Migrar políticas para grupos, (3) Adicionar usuário aos grupos apropriados.`,
          resource_id: user.UserName,
          scan_type: 'iam_user_direct_policies',
          service: 'IAM',
          evidence: { 
            attachedPolicies: attachedPolicies.length,
            inlinePolicies: inlinePolicies.length,
            groups: groups.length
          }
        });
      }
    } catch (error) {
      console.error(`Error analyzing user policies for ${user.UserName}:`, error);
    }
  }
  
  return findings;
}

// Helper functions for IAM API calls
async function listPolicies(credentials: AWSCredentials): Promise<any[]> {
  return await makeIAMRequest(credentials, 'ListPolicies', { Scope: 'Local' }) || [];
}

async function getPolicyVersion(credentials: AWSCredentials, policyArn: string, versionId: string): Promise<any> {
  const result = await makeIAMRequest(credentials, 'GetPolicyVersion', { 
    PolicyArn: policyArn, 
    VersionId: versionId 
  });
  return result?.PolicyVersion;
}

async function listRoles(credentials: AWSCredentials): Promise<any[]> {
  return await makeIAMRequest(credentials, 'ListRoles', {}) || [];
}

async function listAccessKeys(credentials: AWSCredentials, userName: string): Promise<any[]> {
  return await makeIAMRequest(credentials, 'ListAccessKeys', { UserName: userName }) || [];
}

async function getAccessKeyLastUsed(credentials: AWSCredentials, accessKeyId: string): Promise<any> {
  const result = await makeIAMRequest(credentials, 'GetAccessKeyLastUsed', { AccessKeyId: accessKeyId });
  return result?.AccessKeyLastUsed;
}

async function listAttachedUserPolicies(credentials: AWSCredentials, userName: string): Promise<any[]> {
  return await makeIAMRequest(credentials, 'ListAttachedUserPolicies', { UserName: userName }) || [];
}

async function listUserInlinePolicies(credentials: AWSCredentials, userName: string): Promise<any[]> {
  return await makeIAMRequest(credentials, 'ListUserPolicies', { UserName: userName }) || [];
}

async function listGroupsForUser(credentials: AWSCredentials, userName: string): Promise<any[]> {
  return await makeIAMRequest(credentials, 'ListGroupsForUser', { UserName: userName }) || [];
}

async function makeIAMRequest(credentials: AWSCredentials, action: string, params: Record<string, string>): Promise<any> {
  const endpoint = 'https://iam.amazonaws.com/';
  const host = 'iam.amazonaws.com';
  
  const queryParams = new URLSearchParams({
    Action: action,
    Version: '2010-05-08',
    ...params
  });

  try {
    const headers = await signAWSGetRequest(
      credentials,
      'iam',
      'us-east-1',
      host,
      '/',
      queryParams.toString()
    );

    const response = await fetch(`${endpoint}?${queryParams.toString()}`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      console.error(`IAM API Error (${action}):`, response.status);
      return null;
    }

    const text = await response.text();
    return parseIAMXMLResponse(text, action);
  } catch (error) {
    console.error(`Error in IAM request (${action}):`, error);
    return null;
  }
}

function parseIAMXMLResponse(xml: string, action: string): any {
  try {
    const items: any[] = [];
    
    // Different parsing based on action
    const itemPatterns: Record<string, RegExp> = {
      'ListPolicies': /<member>([\s\S]*?)<\/member>/g,
      'ListRoles': /<member>([\s\S]*?)<\/member>/g,
      'ListAccessKeys': /<member>([\s\S]*?)<\/member>/g,
      'ListAttachedUserPolicies': /<member>([\s\S]*?)<\/member>/g,
      'ListUserPolicies': /<member>([\s\S]*?)<\/member>/g,
      'ListGroupsForUser': /<member>([\s\S]*?)<\/member>/g,
    };
    
    const pattern = itemPatterns[action] || /<member>([\s\S]*?)<\/member>/g;
    const matches = xml.match(pattern);
    
    if (matches) {
      for (const match of matches) {
        const item: any = {};
        
        // Extract common fields
        const fields = [
          'PolicyName', 'Arn', 'PolicyId', 'DefaultVersionId', 'AttachmentCount',
          'RoleName', 'RoleId', 'AssumeRolePolicyDocument', 'CreateDate',
          'UserName', 'AccessKeyId', 'Status', 'GroupName'
        ];
        
        for (const field of fields) {
          const regex = new RegExp(`<${field}>([\\s\\S]*?)<\\/${field}>`);
          const result = match.match(regex);
          if (result) {
            item[field] = result[1];
          }
        }
        
        if (Object.keys(item).length > 0) {
          items.push(item);
        }
      }
    }
    
    // For single result actions
    if (action === 'GetPolicyVersion' || action === 'GetAccessKeyLastUsed') {
      const policyVersionMatch = xml.match(/<PolicyVersion>([\s\S]*?)<\/PolicyVersion>/);
      if (policyVersionMatch) {
        const documentMatch = policyVersionMatch[1].match(/<Document>([\s\S]*?)<\/Document>/);
        return { PolicyVersion: { Document: documentMatch?.[1] } };
      }
      
      const lastUsedMatch = xml.match(/<AccessKeyLastUsed>([\s\S]*?)<\/AccessKeyLastUsed>/);
      if (lastUsedMatch) {
        const dateMatch = lastUsedMatch[1].match(/<LastUsedDate>([\s\S]*?)<\/LastUsedDate>/);
        return { AccessKeyLastUsed: { LastUsedDate: dateMatch?.[1] } };
      }
    }
    
    return items;
  } catch (e) {
    console.error('XML parsing error:', e);
    return [];
  }
}
