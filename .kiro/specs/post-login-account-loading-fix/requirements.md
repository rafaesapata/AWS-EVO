# Documento de Requisitos

## Introdução

Correção de um bug intermitente onde, após o login, as contas cloud (AWS/Azure) não carregam e o usuário fica preso na página "conectar conta". Um refresh da página resolve o problema. A causa raiz é uma race condition entre o carregamento assíncrono do `organizationId` (via Cognito) e as queries de contas cloud que dependem desse ID.

## Glossário

- **Organization_ID**: Identificador UUID da organização do usuário, obtido dos atributos do Cognito
- **useOrganization**: Hook React que busca o Organization_ID de forma assíncrona via Cognito
- **CloudAccountContext**: Context React que gerencia o estado das contas cloud (AWS/Azure)
- **AwsAccountContext**: Context React legado que gerencia contas AWS especificamente
- **AwsAccountGuard**: Componente que verifica se o usuário possui contas cloud conectadas antes de permitir acesso ao sistema
- **React_Query**: Biblioteca TanStack Query usada para gerenciamento de estado assíncrono e cache
- **Account_Query**: Query do React_Query que busca as credenciais cloud do backend

## Requisitos

### Requisito 1: Reatividade da Account_Query ao Organization_ID

**User Story:** Como usuário, eu quero que minhas contas cloud carreguem automaticamente após o login, para que eu não precise dar refresh na página.

#### Critérios de Aceitação

1. QUANDO o Organization_ID transicionar de null para um valor válido, A Account_Query DEVERÁ ser disparada automaticamente para buscar as contas cloud
2. ENQUANTO o Organization_ID estiver null ou em carregamento, A Account_Query DEVERÁ permanecer desabilitada sem retornar array vazio como resultado final
3. QUANDO a Account_Query for disparada após o Organization_ID ficar disponível, O CloudAccountContext DEVERÁ atualizar o estado de contas com os dados retornados pelo backend
4. SE a Account_Query falhar após o Organization_ID ficar disponível, ENTÃO O CloudAccountContext DEVERÁ realizar retry automático com limite de 2 tentativas

### Requisito 2: Cascata de Estados de Loading

**User Story:** Como usuário, eu quero ver indicadores de carregamento precisos após o login, para que eu saiba que o sistema está processando e não travou.

#### Critérios de Aceitação

1. ENQUANTO o useOrganization estiver carregando, O CloudAccountContext DEVERÁ reportar isLoading como true
2. ENQUANTO o Organization_ID estiver disponível e a Account_Query estiver em execução, O CloudAccountContext DEVERÁ reportar isLoading como true
3. QUANDO tanto o useOrganization quanto a Account_Query tiverem completado, O CloudAccountContext DEVERÁ reportar isLoading como false
4. O CloudAccountContext DEVERÁ expor um estado que distinga entre "organização carregando", "contas carregando" e "carregamento completo"

### Requisito 3: Proteção contra Redirecionamento Prematuro no AwsAccountGuard

**User Story:** Como usuário, eu quero que o sistema aguarde o carregamento completo antes de decidir me redirecionar, para que eu não seja enviado incorretamente para a página de configuração de contas.

#### Critérios de Aceitação

1. ENQUANTO o Organization_ID estiver em carregamento, O AwsAccountGuard DEVERÁ exibir o indicador de loading e não redirecionar
2. ENQUANTO a Account_Query estiver em execução, O AwsAccountGuard DEVERÁ exibir o indicador de loading e não redirecionar
3. QUANDO o Organization_ID e a Account_Query tiverem completado com contas ativas encontradas, O AwsAccountGuard DEVERÁ renderizar os componentes filhos normalmente
4. QUANDO o Organization_ID e a Account_Query tiverem completado sem contas ativas, O AwsAccountGuard DEVERÁ redirecionar para /cloud-credentials
5. SE o carregamento do Organization_ID falhar, ENTÃO O AwsAccountGuard DEVERÁ delegar o tratamento ao fluxo de autenticação sem redirecionar para /cloud-credentials

### Requisito 4: Consistência entre AwsAccountContext e CloudAccountContext

**User Story:** Como desenvolvedor, eu quero que ambos os contexts de contas reajam de forma consistente ao Organization_ID, para evitar estados divergentes.

#### Critérios de Aceitação

1. QUANDO o Organization_ID ficar disponível, O AwsAccountContext DEVERÁ disparar sua query de contas de forma sincronizada com o CloudAccountContext
2. O AwsAccountContext DEVERÁ utilizar a mesma lógica de habilitação de query baseada no Organization_ID que o CloudAccountContext
3. QUANDO o Organization_ID transicionar de null para válido, Ambos os contexts DEVERÃO refletir o estado de loading corretamente até suas respectivas queries completarem

### Requisito 5: Fluxo Pós-Login Confiável

**User Story:** Como usuário, eu quero que o fluxo de login para o dashboard seja confiável e sem necessidade de refresh, independente da velocidade da rede.

#### Critérios de Aceitação

1. QUANDO o login for concluído com sucesso e o usuário navegar para /app, O sistema DEVERÁ garantir que o Organization_ID esteja disponível antes de avaliar o estado das contas cloud
2. QUANDO o login for concluído com sucesso, O React_Query DEVERÁ invalidar qualquer cache anterior de contas cloud para forçar uma busca fresca
3. SE a sessão Cognito já estiver estabelecida (refresh da página), ENTÃO O useOrganization DEVERÁ retornar o Organization_ID imediatamente do cache sem re-fetch desnecessário
