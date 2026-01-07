/**
 * Security Explanations and Remediation Library
 * Provides detailed explanations and remediation suggestions for CloudTrail security events
 */

export interface SecurityExplanation {
  explanation: string;
  remediation: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
}

// Detailed explanations for each event type
const EVENT_EXPLANATIONS: Record<string, SecurityExplanation> = {
  // === IAM - Critical Events ===
  'CreateUser': {
    explanation: 'Um novo usuário IAM foi criado. Usuários IAM têm acesso permanente à conta AWS e podem representar um vetor de ataque se não forem gerenciados adequadamente.',
    remediation: 'Verifique se a criação foi autorizada. Aplique o princípio do menor privilégio, configure MFA obrigatório e defina uma política de rotação de credenciais.',
    severity: 'high',
    category: 'IAM'
  },
  'DeleteUser': {
    explanation: 'Um usuário IAM foi excluído. Isso pode indicar limpeza legítima ou tentativa de cobrir rastros após comprometimento.',
    remediation: 'Confirme se a exclusão foi autorizada. Verifique se há atividades suspeitas anteriores deste usuário e revise os logs de acesso.',
    severity: 'high',
    category: 'IAM'
  },
  'CreateAccessKey': {
    explanation: 'Uma nova chave de acesso foi criada. Chaves de acesso permitem acesso programático à AWS e são alvos frequentes de vazamento.',
    remediation: 'Limite o número de chaves por usuário (máximo 2). Implemente rotação automática a cada 90 dias e monitore uso anômalo.',
    severity: 'high',
    category: 'IAM'
  },
  'DeleteAccessKey': {
    explanation: 'Uma chave de acesso foi excluída. Pode ser rotação legítima ou tentativa de remover evidências.',
    remediation: 'Verifique se faz parte de um processo de rotação planejado. Confirme que não há chaves comprometidas sendo removidas.',
    severity: 'medium',
    category: 'IAM'
  },
  'CreateLoginProfile': {
    explanation: 'Um perfil de login do console foi criado para um usuário IAM, permitindo acesso ao Console AWS.',
    remediation: 'Verifique se o acesso ao console é necessário. Configure MFA obrigatório e política de senha forte.',
    severity: 'high',
    category: 'IAM'
  },
  'UpdateLoginProfile': {
    explanation: 'A senha de um usuário IAM foi alterada. Pode indicar reset legítimo ou comprometimento de conta.',
    remediation: 'Confirme se a alteração foi solicitada pelo usuário. Verifique se há sinais de comprometimento e force MFA.',
    severity: 'high',
    category: 'IAM'
  },
  'AttachUserPolicy': {
    explanation: 'Uma política foi anexada diretamente a um usuário. Isso pode expandir privilégios de forma não controlada.',
    remediation: 'Prefira usar grupos para gerenciar permissões. Revise a política anexada e aplique o princípio do menor privilégio.',
    severity: 'high',
    category: 'IAM'
  },
  'AttachRolePolicy': {
    explanation: 'Uma política foi anexada a uma role IAM. Roles são usadas por serviços e podem ter amplo impacto.',
    remediation: 'Revise a política anexada. Verifique quais entidades podem assumir esta role e limite o escopo.',
    severity: 'high',
    category: 'IAM'
  },
  'PutUserPolicy': {
    explanation: 'Uma política inline foi criada/atualizada em um usuário. Políticas inline são mais difíceis de auditar.',
    remediation: 'Migre para políticas gerenciadas quando possível. Revise o conteúdo da política e documente a necessidade.',
    severity: 'high',
    category: 'IAM'
  },
  'PutRolePolicy': {
    explanation: 'Uma política inline foi criada/atualizada em uma role. Pode expandir privilégios de serviços.',
    remediation: 'Audite a política criada. Verifique se não há permissões excessivas como "*" em recursos ou ações.',
    severity: 'high',
    category: 'IAM'
  },
  'CreateRole': {
    explanation: 'Uma nova role IAM foi criada. Roles podem ser assumidas por serviços ou usuários para obter privilégios.',
    remediation: 'Revise a trust policy da role. Limite quem pode assumir a role e aplique condições de segurança.',
    severity: 'high',
    category: 'IAM'
  },
  'UpdateAssumeRolePolicy': {
    explanation: 'A política de confiança de uma role foi alterada. Isso define quem pode assumir a role.',
    remediation: 'Verifique se a alteração não permite acesso de entidades não autorizadas. Revise condições e principals.',
    severity: 'high',
    category: 'IAM'
  },
  'DeactivateMFADevice': {
    explanation: 'MFA foi desativado para um usuário. Isso reduz significativamente a segurança da conta.',
    remediation: 'URGENTE: Reative MFA imediatamente. Investigue o motivo da desativação e verifique se a conta foi comprometida.',
    severity: 'critical',
    category: 'IAM'
  },
  'DeleteVirtualMFADevice': {
    explanation: 'Um dispositivo MFA virtual foi excluído. A conta fica vulnerável sem segundo fator.',
    remediation: 'Configure um novo dispositivo MFA imediatamente. Revise atividades recentes do usuário.',
    severity: 'critical',
    category: 'IAM'
  },
  'UpdateAccountPasswordPolicy': {
    explanation: 'A política de senha da conta foi alterada. Pode enfraquecer requisitos de segurança.',
    remediation: 'Verifique se os requisitos mínimos são mantidos: 14+ caracteres, complexidade, rotação a cada 90 dias.',
    severity: 'high',
    category: 'IAM'
  },
  'DeleteAccountPasswordPolicy': {
    explanation: 'A política de senha da conta foi removida. Usuários podem criar senhas fracas.',
    remediation: 'URGENTE: Recrie a política de senha com requisitos fortes imediatamente.',
    severity: 'critical',
    category: 'IAM'
  },

  // === S3 - Storage Security ===
  'PutBucketPolicy': {
    explanation: 'A política de um bucket S3 foi alterada. Pode expor dados publicamente ou a terceiros.',
    remediation: 'Revise a política para garantir que não há "Principal": "*" sem condições. Use AWS Access Analyzer.',
    severity: 'high',
    category: 'S3'
  },
  'DeleteBucketPolicy': {
    explanation: 'A política de um bucket foi removida. O bucket volta às permissões padrão.',
    remediation: 'Verifique se a remoção foi intencional. Confirme que o bucket não precisa de política específica.',
    severity: 'medium',
    category: 'S3'
  },
  'PutBucketAcl': {
    explanation: 'A ACL de um bucket foi modificada. ACLs podem conceder acesso público ou a outras contas.',
    remediation: 'Desabilite ACLs e use apenas políticas de bucket. Verifique se não há acesso público.',
    severity: 'high',
    category: 'S3'
  },
  'PutBucketPublicAccessBlock': {
    explanation: 'As configurações de bloqueio de acesso público foram alteradas.',
    remediation: 'Mantenha todas as 4 opções de bloqueio ativadas, a menos que haja necessidade documentada.',
    severity: 'high',
    category: 'S3'
  },
  'DeleteBucketPublicAccessBlock': {
    explanation: 'O bloqueio de acesso público foi removido. O bucket pode ser exposto publicamente.',
    remediation: 'URGENTE: Reative o bloqueio de acesso público imediatamente. Verifique se dados foram expostos.',
    severity: 'critical',
    category: 'S3'
  },
  'PutBucketEncryption': {
    explanation: 'A configuração de criptografia do bucket foi alterada.',
    remediation: 'Verifique se a criptografia está usando SSE-KMS com chave gerenciada pelo cliente para dados sensíveis.',
    severity: 'medium',
    category: 'S3'
  },
  'DeleteBucketEncryption': {
    explanation: 'A criptografia padrão do bucket foi removida. Novos objetos podem não ser criptografados.',
    remediation: 'URGENTE: Reative a criptografia padrão. Verifique objetos existentes não criptografados.',
    severity: 'critical',
    category: 'S3'
  },
  'DeleteBucket': {
    explanation: 'Um bucket S3 foi excluído. Dados podem ter sido perdidos permanentemente.',
    remediation: 'Verifique se havia backup dos dados. Confirme se a exclusão foi autorizada e documentada.',
    severity: 'high',
    category: 'S3'
  },

  // === EC2 - Network Security ===
  'AuthorizeSecurityGroupIngress': {
    explanation: 'Uma regra de entrada foi adicionada a um Security Group. Pode expor serviços à internet.',
    remediation: 'Verifique se a regra não permite 0.0.0.0/0. Limite portas e IPs de origem ao mínimo necessário.',
    severity: 'high',
    category: 'EC2'
  },
  'AuthorizeSecurityGroupEgress': {
    explanation: 'Uma regra de saída foi adicionada a um Security Group.',
    remediation: 'Limite tráfego de saída apenas ao necessário. Evite regras permissivas para toda internet.',
    severity: 'medium',
    category: 'EC2'
  },
  'CreateSecurityGroup': {
    explanation: 'Um novo Security Group foi criado. Pode ser usado para configurar acesso de rede.',
    remediation: 'Documente o propósito do SG. Aplique regras restritivas desde o início.',
    severity: 'medium',
    category: 'EC2'
  },
  'DeleteSecurityGroup': {
    explanation: 'Um Security Group foi excluído. Recursos associados podem perder proteção.',
    remediation: 'Verifique se não há recursos órfãos. Confirme que a exclusão foi planejada.',
    severity: 'medium',
    category: 'EC2'
  },
  'RunInstances': {
    explanation: 'Novas instâncias EC2 foram lançadas. Pode indicar uso legítimo ou mineração de cripto.',
    remediation: 'Verifique o tipo de instância e região. Confirme se está dentro do orçamento e uso esperado.',
    severity: 'medium',
    category: 'EC2'
  },
  'TerminateInstances': {
    explanation: 'Instâncias EC2 foram terminadas. Dados em volumes efêmeros são perdidos.',
    remediation: 'Confirme se havia backup. Verifique se a terminação foi autorizada.',
    severity: 'medium',
    category: 'EC2'
  },

  // === KMS - Encryption ===
  'DisableKey': {
    explanation: 'Uma chave KMS foi desabilitada. Dados criptografados com ela ficam inacessíveis.',
    remediation: 'Verifique se há dados dependentes desta chave. Documente o motivo da desabilitação.',
    severity: 'high',
    category: 'KMS'
  },
  'ScheduleKeyDeletion': {
    explanation: 'Uma chave KMS foi agendada para exclusão. Após o período, dados serão irrecuperáveis.',
    remediation: 'URGENTE: Cancele se não for intencional. Verifique todos os recursos que usam esta chave.',
    severity: 'critical',
    category: 'KMS'
  },
  'PutKeyPolicy': {
    explanation: 'A política de uma chave KMS foi alterada. Pode conceder acesso a entidades não autorizadas.',
    remediation: 'Revise a política. Garanta que apenas principals autorizados têm acesso.',
    severity: 'high',
    category: 'KMS'
  },

  // === CloudTrail - Audit ===
  'StopLogging': {
    explanation: 'O logging do CloudTrail foi parado. Atividades não serão mais registradas.',
    remediation: 'CRÍTICO: Reative imediatamente. Isso pode indicar tentativa de ocultar atividades maliciosas.',
    severity: 'critical',
    category: 'CloudTrail'
  },
  'DeleteTrail': {
    explanation: 'Uma trilha do CloudTrail foi excluída. Logs históricos podem ser perdidos.',
    remediation: 'CRÍTICO: Recrie a trilha. Verifique se logs foram exportados antes da exclusão.',
    severity: 'critical',
    category: 'CloudTrail'
  },
  'UpdateTrail': {
    explanation: 'Configurações de uma trilha CloudTrail foram alteradas.',
    remediation: 'Verifique se logging multi-região e validação de integridade estão ativos.',
    severity: 'high',
    category: 'CloudTrail'
  },

  // === Config - Compliance ===
  'StopConfigurationRecorder': {
    explanation: 'O AWS Config parou de gravar. Mudanças de configuração não serão rastreadas.',
    remediation: 'Reative o Config Recorder. Isso é essencial para compliance e auditoria.',
    severity: 'critical',
    category: 'Config'
  },
  'DeleteConfigurationRecorder': {
    explanation: 'O gravador do AWS Config foi excluído. Compliance tracking está desabilitado.',
    remediation: 'URGENTE: Recrie o Configuration Recorder para manter visibilidade de mudanças.',
    severity: 'critical',
    category: 'Config'
  },

  // === GuardDuty - Threat Detection ===
  'DeleteDetector': {
    explanation: 'O detector do GuardDuty foi excluído. Detecção de ameaças está desabilitada.',
    remediation: 'CRÍTICO: Reative o GuardDuty imediatamente. Investigue o motivo da desativação.',
    severity: 'critical',
    category: 'GuardDuty'
  },

  // === Console Access ===
  'ConsoleLogin': {
    explanation: 'Login no Console AWS detectado. Verifique se é de localização e horário esperados.',
    remediation: 'Monitore logins de IPs desconhecidos. Implemente MFA e alertas de login.',
    severity: 'medium',
    category: 'Console'
  },

  // === Lambda ===
  'AddPermission': {
    explanation: 'Permissão adicionada a uma função Lambda. Pode permitir invocação por terceiros.',
    remediation: 'Revise quem pode invocar a função. Evite permissões públicas.',
    severity: 'high',
    category: 'Lambda'
  },
  'UpdateFunctionConfiguration': {
    explanation: 'Configuração de Lambda alterada. Pode incluir variáveis de ambiente com segredos.',
    remediation: 'Verifique se não há credenciais em variáveis de ambiente. Use Secrets Manager.',
    severity: 'medium',
    category: 'Lambda'
  },

  // === RDS ===
  'ModifyDBInstance': {
    explanation: 'Configuração de instância RDS alterada. Pode afetar segurança ou disponibilidade.',
    remediation: 'Verifique se criptografia e backups automáticos estão mantidos.',
    severity: 'medium',
    category: 'RDS'
  },
  'DeleteDBInstance': {
    explanation: 'Uma instância RDS foi excluída. Dados podem ser perdidos se não houver snapshot.',
    remediation: 'Confirme que há snapshot final. Verifique se a exclusão foi autorizada.',
    severity: 'high',
    category: 'RDS'
  },

  // === Secrets Manager ===
  'DeleteSecret': {
    explanation: 'Um segredo foi excluído do Secrets Manager. Aplicações podem perder acesso.',
    remediation: 'Verifique se há aplicações dependentes. Confirme que a exclusão foi planejada.',
    severity: 'high',
    category: 'Secrets'
  },
  'PutSecretValue': {
    explanation: 'Valor de um segredo foi atualizado. Pode ser rotação legítima ou comprometimento.',
    remediation: 'Confirme se faz parte de rotação automática. Verifique quem fez a alteração.',
    severity: 'medium',
    category: 'Secrets'
  },

  // === AssumeRole ===
  'AssumeRole': {
    explanation: 'Uma role foi assumida. Isso concede credenciais temporárias com os privilégios da role.',
    remediation: 'Monitore padrões de AssumeRole. Verifique se a entidade que assumiu é autorizada.',
    severity: 'medium',
    category: 'STS'
  },
  'GetSessionToken': {
    explanation: 'Credenciais temporárias foram obtidas. Pode indicar uso de MFA ou acesso programático.',
    remediation: 'Verifique se o padrão de uso é normal. Monitore duração das sessões.',
    severity: 'low',
    category: 'STS'
  },

  // === VPC ===
  'CreateVpc': {
    explanation: 'Uma nova VPC foi criada. Pode ser para isolamento legítimo ou shadow IT.',
    remediation: 'Documente o propósito da VPC. Aplique flow logs e configurações de segurança.',
    severity: 'medium',
    category: 'VPC'
  },
  'CreateInternetGateway': {
    explanation: 'Um Internet Gateway foi criado. Permite acesso à internet de/para a VPC.',
    remediation: 'Verifique se o acesso à internet é necessário. Configure NACLs e Security Groups.',
    severity: 'medium',
    category: 'VPC'
  },

  // === CloudFormation ===
  'CreateStack': {
    explanation: 'Uma stack CloudFormation foi criada. Pode provisionar múltiplos recursos.',
    remediation: 'Revise o template antes da criação. Verifique se não há recursos não autorizados.',
    severity: 'medium',
    category: 'CloudFormation'
  },
  'DeleteStack': {
    explanation: 'Uma stack CloudFormation foi excluída. Todos os recursos da stack são removidos.',
    remediation: 'Confirme que a exclusão foi autorizada. Verifique se havia dados importantes.',
    severity: 'high',
    category: 'CloudFormation'
  },

  // === Organizations ===
  'LeaveOrganization': {
    explanation: 'Uma conta saiu da organização. Perde acesso a SCPs e recursos compartilhados.',
    remediation: 'CRÍTICO: Investigue imediatamente. Isso pode indicar comprometimento da conta.',
    severity: 'critical',
    category: 'Organizations'
  },
  'RemoveAccountFromOrganization': {
    explanation: 'Uma conta foi removida da organização. Governança centralizada é perdida.',
    remediation: 'Confirme se foi autorizado. Verifique se a conta precisa ser re-adicionada.',
    severity: 'critical',
    category: 'Organizations'
  },
};

// Default explanation for unknown events
const DEFAULT_EXPLANATION: SecurityExplanation = {
  explanation: 'Este evento foi identificado como potencialmente relevante para segurança.',
  remediation: 'Revise o evento e verifique se a ação foi autorizada e está de acordo com as políticas de segurança.',
  severity: 'low',
  category: 'Other'
};

/**
 * Get security explanation for an event
 */
export function getSecurityExplanation(eventName: string): SecurityExplanation {
  return EVENT_EXPLANATIONS[eventName] || DEFAULT_EXPLANATION;
}

/**
 * Get explanation based on specific conditions
 */
export function getContextualExplanation(
  eventName: string,
  errorCode: string | null,
  userType: string,
  sourceIp: string | null
): { explanation: string; remediation: string } {
  const base = getSecurityExplanation(eventName);
  let explanation = base.explanation;
  let remediation = base.remediation;

  // Add context based on error
  if (errorCode === 'AccessDenied') {
    explanation += ' A tentativa foi NEGADA, indicando possível tentativa de acesso não autorizado.';
    remediation += ' Investigue se o usuário deveria ter essa permissão ou se é uma tentativa de ataque.';
  } else if (errorCode === 'UnauthorizedAccess') {
    explanation += ' Acesso não autorizado detectado.';
    remediation += ' Revise as permissões do usuário e verifique se há comprometimento.';
  }

  // Add context based on user type
  if (userType === 'Root') {
    explanation += ' ALERTA: Ação executada pelo usuário ROOT, que tem acesso irrestrito.';
    remediation += ' URGENTE: Evite usar root. Crie usuários IAM com permissões específicas.';
  }

  // Add context based on source IP
  if (sourceIp && !sourceIp.startsWith('10.') && !sourceIp.startsWith('172.') && !sourceIp.startsWith('192.168.')) {
    explanation += ` Origem: IP externo (${sourceIp}).`;
  }

  return { explanation, remediation };
}

/**
 * Get all event categories
 */
export function getEventCategories(): string[] {
  const categories = new Set<string>();
  Object.values(EVENT_EXPLANATIONS).forEach(exp => categories.add(exp.category));
  return Array.from(categories).sort();
}

/**
 * Get events by category
 */
export function getEventsByCategory(category: string): string[] {
  return Object.entries(EVENT_EXPLANATIONS)
    .filter(([_, exp]) => exp.category === category)
    .map(([eventName]) => eventName);
}
