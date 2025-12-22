# API de Criação de Organização - Documentação de Integração

## Visão Geral

Esta API permite a criação automática de contas/organizações no sistema EVO quando uma licença é adquirida na plataforma de vendas.

## Endpoint

```
POST https://bsluqzxeexanydqvmbrh.supabase.co/functions/v1/create-organization-account
```

## Autenticação

Esta é uma API pública que não requer autenticação Bearer. Porém, recomendamos implementar validação de origem (IP whitelist) em produção.

## Headers Obrigatórios

```
Content-Type: application/json
```

## Corpo da Requisição

### Formato JSON

```json
{
  "customer_id": "f7c9c432-d2c9-41ad-be8f-38883c06cb48",
  "organization_name": "Nome da Empresa",
  "admin_email": "admin@empresa.com",
  "admin_name": "João Silva"
}
```

### Campos Obrigatórios

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `customer_id` | string (UUID) | ID único do cliente na plataforma de licenças |
| `organization_name` | string | Nome da organização/empresa |
| `admin_email` | string | Email do administrador (será usado para login) |
| `admin_name` | string | Nome completo do administrador |

## Resposta de Sucesso

### Status: 201 Created

```json
{
  "success": true,
  "organization_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "customer_id": "f7c9c432-d2c9-41ad-be8f-38883c06cb48",
  "admin_email": "admin@empresa.com",
  "temporary_password": "temp-uuid-password",
  "message": "Account created successfully. Admin should change password on first login."
}
```

### Campos da Resposta

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `success` | boolean | Indica se a operação foi bem-sucedida |
| `organization_id` | string (UUID) | ID da organização criada no sistema |
| `customer_id` | string (UUID) | ID do cliente (mesmo da requisição) |
| `admin_email` | string | Email do administrador criado |
| `temporary_password` | string | Senha temporária gerada (deve ser enviada ao usuário) |
| `message` | string | Mensagem informativa |

⚠️ **IMPORTANTE**: A senha temporária deve ser enviada ao usuário final de forma segura. O usuário será forçado a alterar a senha no primeiro login.

## Respostas de Erro

### 400 Bad Request - Campos Faltando

```json
{
  "error": "Missing required fields"
}
```

### 409 Conflict - Organização Já Existe

```json
{
  "error": "Organization already exists for this customer_id",
  "organization_id": "existing-org-uuid"
}
```

### 500 Internal Server Error

```json
{
  "error": "Failed to create organization",
  "details": "Detailed error message"
}
```

ou

```json
{
  "error": "Failed to create admin user",
  "details": "Detailed error message"
}
```

## Exemplos de Integração

### cURL

```bash
curl -X POST https://bsluqzxeexanydqvmbrh.supabase.co/functions/v1/create-organization-account \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "f7c9c432-d2c9-41ad-be8f-38883c06cb48",
    "organization_name": "Acme Corporation",
    "admin_email": "admin@acme.com",
    "admin_name": "John Doe"
  }'
```

### JavaScript/Node.js

```javascript
const createOrganization = async (licenseData) => {
  const response = await fetch(
    'https://bsluqzxeexanydqvmbrh.supabase.co/functions/v1/create-organization-account',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customer_id: licenseData.customerId,
        organization_name: licenseData.companyName,
        admin_email: licenseData.email,
        admin_name: licenseData.contactName,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  const result = await response.json();
  
  // Enviar email com credenciais para o cliente
  await sendCredentialsEmail(
    result.admin_email,
    result.temporary_password
  );

  return result;
};
```

### Python

```python
import requests
import json

def create_organization(customer_id, org_name, admin_email, admin_name):
    url = "https://bsluqzxeexanydqvmbrh.supabase.co/functions/v1/create-organization-account"
    
    payload = {
        "customer_id": customer_id,
        "organization_name": org_name,
        "admin_email": admin_email,
        "admin_name": admin_name
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    response = requests.post(url, json=payload, headers=headers)
    
    if response.status_code == 201:
        result = response.json()
        # Enviar credenciais ao cliente
        send_credentials_email(result['admin_email'], result['temporary_password'])
        return result
    else:
        error = response.json()
        raise Exception(f"Error creating organization: {error.get('error')}")
```

### PHP

```php
<?php
function createOrganization($customerId, $orgName, $adminEmail, $adminName) {
    $url = 'https://bsluqzxeexanydqvmbrh.supabase.co/functions/v1/create-organization-account';
    
    $data = [
        'customer_id' => $customerId,
        'organization_name' => $orgName,
        'admin_email' => $adminEmail,
        'admin_name' => $adminName
    ];
    
    $options = [
        'http' => [
            'header'  => "Content-Type: application/json\r\n",
            'method'  => 'POST',
            'content' => json_encode($data)
        ]
    ];
    
    $context  = stream_context_create($options);
    $result = file_get_contents($url, false, $context);
    
    if ($result === FALSE) {
        throw new Exception('Error creating organization');
    }
    
    $response = json_decode($result, true);
    
    // Enviar email com credenciais
    sendCredentialsEmail($response['admin_email'], $response['temporary_password']);
    
    return $response;
}
?>
```

## Fluxo Recomendado de Integração

1. **Quando uma licença é vendida na sua plataforma:**
   - Capture os dados do cliente (email, nome, empresa)
   - Gere ou use o `customer_id` existente

2. **Chame a API de criação:**
   - Envie os dados para criar a organização
   - Capture a resposta com as credenciais

3. **Notifique o cliente:**
   - Envie um email com as credenciais temporárias
   - Inclua link para login: `https://[seu-dominio]/auth`
   - Informe que a senha deve ser alterada no primeiro acesso

4. **Tratamento de erros:**
   - Se retornar 409 (já existe), informe ao cliente que a conta já foi criada
   - Em caso de outros erros, tente novamente ou notifique suporte

## Notas de Segurança

1. **Validação de dados**: Valide o formato do email antes de enviar
2. **Customer ID único**: Use UUIDs válidos e únicos por cliente
3. **Tratamento de senha**: 
   - A senha temporária deve ser enviada por canal seguro
   - Não armazene a senha temporária após enviar ao cliente
4. **Idempotência**: A API verifica se a organização já existe para o `customer_id`
5. **Rate limiting**: Implemente controle de taxa na sua aplicação

## Testando a Integração

### Ambiente de Teste

Para testar a integração, você pode usar customer_ids de teste:

```json
{
  "customer_id": "00000000-0000-0000-0000-000000000001",
  "organization_name": "Test Organization",
  "admin_email": "test@example.com",
  "admin_name": "Test User"
}
```

### Checklist de Teste

- [ ] Criação bem-sucedida de organização
- [ ] Tratamento de organização duplicada (409)
- [ ] Validação de campos obrigatórios (400)
- [ ] Email com credenciais enviado ao cliente
- [ ] Login funcional com credenciais geradas
- [ ] Troca de senha obrigatória no primeiro acesso

## Suporte Técnico

Em caso de dúvidas ou problemas na integração:

- **Email**: suporte@seu-dominio.com
- **Documentação adicional**: https://docs.seu-dominio.com
- **Status da API**: https://status.seu-dominio.com

## Changelog

### v1.0.0 (2024-11-25)
- Release inicial da API
- Criação automática de organizações
- Geração de credenciais temporárias
- Validação de duplicatas por customer_id
