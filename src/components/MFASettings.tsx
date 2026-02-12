import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Smartphone, Key, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import QRCode from "qrcode";

interface MFAFactor {
  id: string;
  friendly_name: string;
  factor_type: 'totp' | 'webauthn';
  status: 'verified' | 'unverified';
  created_at: string;
}

export default function MFASettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [factors, setFactors] = useState<MFAFactor[]>([]);
  const [webauthnCredentials, setWebauthnCredentials] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showTOTPDialog, setShowTOTPDialog] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [factorId, setFactorId] = useState("");

  useEffect(() => {
    loadMFAFactors();
    loadWebAuthnCredentials();
  }, []);

  const loadWebAuthnCredentials = async () => {
    try {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) return;

      const result = await apiClient.select('webauthn_credentials', {
        select: '*',
        eq: { user_id: user.id },
        order: { created_at: 'desc' }
      });
      
      if (result.error) {
        console.warn('Error loading WebAuthn credentials:', result.error);
        setWebauthnCredentials([]);
        return;
      }
      
      setWebauthnCredentials(result.data || []);
    } catch (error: any) {
      console.error('Error loading WebAuthn credentials:', error);
      setWebauthnCredentials([]);
    }
  };

  const loadMFAFactors = async () => {
    try {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) return;

      const result = await apiClient.invoke('mfa-list-factors', { body: {} });
      
      if (result.error) {
        console.warn('Error loading MFA factors:', result.error);
        setFactors([]);
        return;
      }
      
      setFactors((result.data?.all as MFAFactor[]) || []);
    } catch (error: any) {
      console.error('Error loading MFA factors:', error);
      setFactors([]);
    }
  };

  const enrollTOTP = async () => {
    setLoading(true);
    try {
      // No longer need accessToken - secret is generated locally on backend
      const result = await apiClient.invoke('mfa-enroll', {
        body: {
          factorType: 'totp',
          friendlyName: 'Autenticador TOTP'
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
        title: t('mfa.enrollError', 'Erro ao configurar TOTP'),
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const verifyTOTP = async () => {
    setLoading(true);
    try {
      // No longer need accessToken - verification is done locally on backend
      const result = await apiClient.invoke('mfa-challenge-verify', {
        body: {
          factorId: factorId,
          code: verifyCode
        }
      });

      if (result.error) {
        throw new Error(result.error.message || 'Failed to verify code');
      }

      toast({
        title: t('mfa.totpActivated', 'TOTP ativado com sucesso!'),
        description: t('mfa.totpConfigured', 'Seu autenticador foi configurado.')
      });

      setShowTOTPDialog(false);
      setVerifyCode("");
      loadMFAFactors();
    } catch (error: any) {
      console.error('MFA Verify Error:', error);
      toast({
        variant: "destructive",
        title: t('mfa.invalidCode', 'Código inválido'),
        description: error?.message || t('mfa.verifyRetry', 'Verifique o código e tente novamente.')
      });
    } finally {
      setLoading(false);
    }
  };

  const enrollWebAuthn = async () => {
    setLoading(true);
    try {
      // Step 1: Get challenge from backend
      const challengeResult = await apiClient.invoke('webauthn-register', {
        body: { action: 'generate-challenge' }
      });

      if (challengeResult.error) {
        throw new Error(challengeResult.error.message || 'Failed to generate challenge');
      }

      const challengeData = challengeResult.data;

      // Step 2: Create credential using WebAuthn API
      const challengeStr = String(challengeData.challenge);
      const userIdStr = String(challengeData.userId);
      
      // Use exact domain evo.nuevacore.com for rpId (must match origin)
      const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
        challenge: Uint8Array.from(challengeStr, c => c.charCodeAt(0)),
        rp: {
          name: challengeData.rpName || 'EVO Platform',
          id: 'evo.nuevacore.com',
        },
        user: {
          id: Uint8Array.from(userIdStr, c => c.charCodeAt(0)),
          name: challengeData.userEmail || "user",
          displayName: challengeData.userDisplayName || "User"
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" as const }, // ES256
          { alg: -257, type: "public-key" as const } // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "cross-platform" as const,
          userVerification: "preferred" as const,
          requireResidentKey: false,
        },
        timeout: 60000,
        attestation: "none" as const
      };

      const credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions
      }) as PublicKeyCredential;

      if (!credential) {
        throw new Error("Falha ao criar credencial");
      }

      // Step 3: Send credential to backend for verification
      const verifyResult = await apiClient.invoke('webauthn-register', {
        body: {
          action: 'verify-registration',
          credential: {
            id: credential.id,
            publicKey: btoa(String.fromCharCode(...new Uint8Array((credential.response as any).attestationObject))),
            transports: (credential.response as any).getTransports?.() || [],
          },
          challengeId: challengeData.challenge,
          deviceName: 'Security Key'
        }
      });

      if (verifyResult.error) {
        throw new Error(verifyResult.error.message || 'Failed to verify registration');
      }

      toast({
        title: t('mfa.keyRegistered', 'Chave de segurança registrada!'),
        description: t('mfa.deviceConfigured', 'Seu dispositivo foi configurado com sucesso.')
      });

      await loadWebAuthnCredentials();
      await loadMFAFactors();
    } catch (error: any) {
      console.error('WebAuthn error:', error);
      toast({
        variant: "destructive",
        title: t('mfa.webauthnError', 'Erro ao configurar WebAuthn'),
        description: error.message || t('mfa.webauthnCheckBrowser', 'Verifique se seu navegador suporta WebAuthn.')
      });
    } finally {
      setLoading(false);
    }
  };

  const unenrollFactor = async (factorId: string, isWebAuthn = false) => {
    setLoading(true);
    try {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('User not authenticated');

      if (isWebAuthn) {
        // Use invoke to call a Lambda that handles the delete
        const result = await apiClient.invoke('delete-webauthn-credential', {
          body: { credentialId: factorId }
        });

        if (result.error) {
          throw new Error(result.error.message || 'Failed to delete credential');
        }

        toast({
          title: t('mfa.keyRemoved', 'Chave removida'),
          description: t('mfa.keyDeactivated', 'A chave de segurança foi desativada.')
        });

        await loadWebAuthnCredentials();
      } else {
        const result = await apiClient.invoke('mfa-unenroll', { body: { factorId } });
        
        if (result.error) {
          throw new Error(result.error.message || 'Failed to unenroll factor');
        }

        toast({
          title: t('mfa.factorRemoved', 'Fator removido'),
          description: t('mfa.factorDeactivated', 'O método de autenticação foi desativado.')
        });

        await loadMFAFactors();
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t('mfa.removeError', 'Erro ao remover fator'),
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const verifiedFactors = factors.filter(f => f.status === 'verified');
  const hasMFA = verifiedFactors.length > 0 || webauthnCredentials.length > 0;
  const totalMethods = verifiedFactors.length + webauthnCredentials.length;

  return (
    <div className="space-y-4">
      {hasMFA ? (
        <Alert className="border-green-500/50 bg-green-500/10">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <AlertDescription className="text-green-500">
            {t('mfa.mfaActive', 'MFA está ativo na sua conta.')} {totalMethods} {t('mfa.methodsConfigured', 'método(s) configurado(s).')}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-yellow-500/50 bg-yellow-500/10">
          <AlertCircle className="h-4 w-4 text-yellow-500" />
          <AlertDescription className="text-yellow-500">
            {t('mfa.mfaInactive', 'MFA não está ativo. Recomendamos fortemente ativar para maior segurança.')}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <div className="glass rounded-xl p-4 border border-primary/10">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-[#003C7D]/10 rounded-lg">
              <Smartphone className="h-3.5 w-3.5 text-[#003C7D]" />
            </div>
            <h3 className="text-sm font-medium">{t('mfa.totpTitle', 'Autenticador TOTP')}</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {t('mfa.totpDesc', 'Use aplicativos como Google Authenticator, Authy ou Microsoft Authenticator')}
          </p>
          <Button onClick={enrollTOTP} disabled={loading} variant="outline" className="glass border-primary/10">
            <Smartphone className="h-4 w-4 mr-2" />
            {t('mfa.configureTOTP', 'Configurar Autenticador TOTP')}
          </Button>
        </div>

        <div className="glass rounded-xl p-4 border border-primary/10 opacity-50">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-[#003C7D]/10 rounded-lg">
              <Key className="h-3.5 w-3.5 text-[#003C7D]" />
            </div>
            <h3 className="text-sm font-medium">{t('mfa.webauthnTitle', 'Chave de Segurança (WebAuthn)')}</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {t('mfa.webauthnEnterprise', 'Esta funcionalidade requer uma licença Enterprise')}
          </p>
          <Button disabled variant="outline" className="cursor-not-allowed glass border-primary/10">
            <Key className="h-4 w-4 mr-2" />
            {t('mfa.unavailable', 'Indisponível nesta licença')}
          </Button>
        </div>
      </div>

      {(factors.length > 0 || webauthnCredentials.length > 0) && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">{t('mfa.activeMethods', 'Métodos Ativos')}</h3>
          
          {factors.map((factor) => (
            <div key={factor.id} className="flex items-center justify-between p-3 glass rounded-xl border border-primary/10">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-[#003C7D]/10 rounded-lg">
                  <Smartphone className="h-3.5 w-3.5 text-[#003C7D]" />
                </div>
                <div>
                  <p className="text-sm font-medium">{factor.friendly_name}</p>
                  <p className="text-xs text-muted-foreground">{t('mfa.totpTitle', 'Autenticador TOTP')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={factor.status === 'verified' ? 'default' : 'secondary'}>
                  {factor.status === 'verified' ? t('mfa.active', 'Ativo') : t('mfa.pending', 'Pendente')}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => unenrollFactor(factor.id, false)}
                  disabled={loading}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}

          {webauthnCredentials.map((cred) => (
            <div key={cred.id} className="flex items-center justify-between p-3 glass rounded-xl border border-primary/10">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-[#003C7D]/10 rounded-lg">
                  <Key className="h-3.5 w-3.5 text-[#003C7D]" />
                </div>
                <div>
                  <p className="text-sm font-medium">{cred.friendly_name || 'Chave de Segurança'}</p>
                  <p className="text-xs text-muted-foreground">
                    WebAuthn • Último uso: {cred.last_used_at ? new Date(cred.last_used_at).toLocaleDateString('pt-BR') : 'Nunca'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default">{t('mfa.active', 'Ativo')}</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => unenrollFactor(cred.id, true)}
                  disabled={loading}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

        {/* TOTP Setup Dialog */}
        <Dialog open={showTOTPDialog} onOpenChange={setShowTOTPDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('mfa.setupTOTP', 'Configurar Autenticador TOTP')}</DialogTitle>
              <DialogDescription>
                {t('mfa.scanQRCode', 'Escaneie o QR Code com seu aplicativo autenticador')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {qrCode ? (
                <div className="flex flex-col items-center gap-2">
                  <img src={qrCode} alt="QR Code" className="border rounded-lg p-2" />
                  <p className="text-xs text-muted-foreground text-center">
                    {t('mfa.scanWithApp', 'Escaneie com Google Authenticator, Authy ou similar')}
                  </p>
                </div>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {t('mfa.useManualCode', 'Use o código manual abaixo para configurar seu autenticador')}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label>{t('mfa.manualEntry', 'Ou insira manualmente:')}</Label>
                <Input value={totpSecret} readOnly className="font-mono text-sm" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="verify-code">{t('mfa.verificationCode', 'Código de Verificação')}</Label>
                <Input
                  id="verify-code"
                  placeholder="000000"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  maxLength={6}
                  className="text-center text-2xl tracking-widest"
                />
                <p className="text-xs text-muted-foreground">
                  {t('mfa.enterCode', 'Digite o código de 6 dígitos gerado pelo seu aplicativo')}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowTOTPDialog(false)}>
                {t('common.cancel', 'Cancelar')}
              </Button>
              <Button onClick={verifyTOTP} disabled={loading || verifyCode.length !== 6}>
                {loading ? t('mfa.verifying', 'Verificando...') : t('mfa.verifyAndActivate', 'Verificar e Ativar')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
}
