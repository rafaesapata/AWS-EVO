# MFA Enrollment - QR Code Fix - COMPLETO ✅

## Problema
O diálogo de configuração TOTP aparecia com o secret mas o QR Code não era exibido (botão "QR Code" vazio).

## Causa Raiz
O backend estava retornando uma string `otpauth://totp/...` mas o frontend esperava uma imagem (data URL) para exibir no elemento `<img>`.

## Solução

### 1. Instalação da Biblioteca QRCode
```bash
npm install qrcode @types/qrcode --save
```

### 2. Atualização do Frontend (`src/components/MFASettings.tsx`)

**Import da biblioteca:**
```typescript
import QRCode from "qrcode";
```

**Geração do QR Code no `enrollTOTP`:**
```typescript
const enrollTOTP = async () => {
  setLoading(true);
  try {
    const session = await cognitoAuth.getCurrentSession();
    if (!session) {
      throw new Error('No active session');
    }

    const result = await apiClient.invoke('mfa-enroll', {
      body: {
        factorType: 'totp',
        friendlyName: 'Autenticador TOTP',
        accessToken: session.accessToken
      }
    });

    if (result.error) {
      throw new Error(result.error.message || 'Failed to enroll TOTP');
    }

    const data = result.data;
    
    if (!data || !data.qrCode || !data.secret || !data.factorId) {
      throw new Error('Invalid response from server');
    }

    // Generate QR Code image from otpauth:// URL
    try {
      const qrCodeDataUrl = await QRCode.toDataURL(data.qrCode, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      setQrCode(qrCodeDataUrl);
    } catch (qrError) {
      console.error('QR Code generation error:', qrError);
      // If QR generation fails, still show the secret for manual entry
      setQrCode('');
    }

    setTotpSecret(data.secret);
    setFactorId(data.factorId);
    setShowTOTPDialog(true);
  } catch (error: any) {
    toast({
      variant: "destructive",
      title: "Erro ao configurar TOTP",
      description: error.message
    });
  } finally {
    setLoading(false);
  }
};
```

**Renderização melhorada do QR Code:**
```typescript
<div className="space-y-4">
  {qrCode ? (
    <div className="flex flex-col items-center gap-2">
      <img src={qrCode} alt="QR Code" className="border rounded-lg p-2" />
      <p className="text-xs text-muted-foreground text-center">
        Escaneie com Google Authenticator, Authy ou similar
      </p>
    </div>
  ) : (
    <Alert>
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        Use o código manual abaixo para configurar seu autenticador
      </AlertDescription>
    </Alert>
  )}

  <div className="space-y-2">
    <Label>Ou insira manualmente:</Label>
    <Input value={totpSecret} readOnly className="font-mono text-sm" />
  </div>
</div>
```

## Status do Deploy
✅ Biblioteca `qrcode` instalada
✅ Frontend atualizado com geração de QR Code
✅ Build compilado com sucesso
✅ Deploy para S3 concluído
✅ Invalidação do CloudFront em progresso

## Como Funciona

1. **Backend** retorna:
   - `secret`: String do secret TOTP (ex: "AMXHSTZPJINWRIXM6DSURYO...")
   - `qrCode`: String otpauth URL (ex: "otpauth://totp/EVO:user@example.com?secret=...")
   - `factorId`: UUID do fator MFA

2. **Frontend** processa:
   - Recebe a string `otpauth://`
   - Usa a biblioteca `qrcode` para converter em imagem (data URL base64)
   - Exibe a imagem no diálogo
   - Mantém o secret visível para entrada manual como fallback

3. **Usuário** pode:
   - Escanear o QR Code com app autenticador
   - OU copiar o secret manualmente
   - Inserir o código de 6 dígitos para verificar

## Teste
Após a invalidação do CloudFront (2-3 minutos):
1. Acesse Settings → Security → MFA
2. Clique em "Configurar Autenticador TOTP"
3. O QR Code deve aparecer visível e escaneável
4. O secret manual também está disponível
5. Escaneie com Google Authenticator, Authy, 1Password, etc.
6. Digite o código de 6 dígitos para verificar

## Benefícios da Solução
- ✅ QR Code gerado no cliente (sem processamento extra no backend)
- ✅ Fallback para entrada manual se QR falhar
- ✅ Compatível com todos os apps autenticadores padrão TOTP
- ✅ UX melhorada com instruções claras
- ✅ Biblioteca leve e bem mantida (qrcode.js)
