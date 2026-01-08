import { useState, useEffect } from "react";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Shield, Smartphone, Key, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
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
        title: "Erro ao configurar TOTP",
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
        title: "TOTP ativado com sucesso!",
        description: "Seu autenticador foi configurado."
      });

      setShowTOTPDialog(false);
      setVerifyCode("");
      loadMFAFactors();
    } catch (error: any) {
      console.error('MFA Verify Error:', error);
      toast({
        variant: "destructive",
        title: "Código inválido",
        description: error?.message || "Verifique o código e tente novamente."
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
      
      // Use exact domain evo.ai.udstec.io for rpId (must match origin)
      const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
        challenge: Uint8Array.from(challengeStr, c => c.charCodeAt(0)),
        rp: {
          name: challengeData.rpName || 'EVO UDS Platform',
          id: 'evo.ai.udstec.io',
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
        title: "Chave de segurança registrada!",
        description: "Seu dispositivo foi configurado com sucesso."
      });

      await loadWebAuthnCredentials();
      await loadMFAFactors();
    } catch (error: any) {
      console.error('WebAuthn error:', error);
      toast({
        variant: "destructive",
        title: "Erro ao configurar WebAuthn",
        description: error.message || "Verifique se seu navegador suporta WebAuthn e se você tem um dispositivo compatível."
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
          title: "Chave removida",
          description: "A chave de segurança foi desativada."
        });

        await loadWebAuthnCredentials();
      } else {
        const result = await apiClient.invoke('mfa-unenroll', { body: { factorId } });
        
        if (result.error) {
          throw new Error(result.error.message || 'Failed to unenroll factor');
        }

        toast({
          title: "Fator removido",
          description: "O método de autenticação foi desativado."
        });

        await loadMFAFactors();
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao remover fator",
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
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle>Autenticação Multi-Fator (MFA)</CardTitle>
        </div>
        <CardDescription>
          Adicione uma camada extra de segurança à sua conta
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {hasMFA ? (
          <Alert className="border-green-500/50 bg-green-500/10">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-500">
              MFA está ativo na sua conta. {totalMethods} método(s) configurado(s).
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="border-yellow-500/50 bg-yellow-500/10">
            <AlertCircle className="h-4 w-4 text-yellow-500" />
            <AlertDescription className="text-yellow-500">
              MFA não está ativo. Recomendamos fortemente ativar para maior segurança.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              Autenticador TOTP
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              Use aplicativos como Google Authenticator, Authy ou Microsoft Authenticator
            </p>
            <Button onClick={enrollTOTP} disabled={loading} variant="outline">
              <Smartphone className="h-4 w-4 mr-2" />
              Configurar Autenticador TOTP
            </Button>
          </div>

          <div className="opacity-50">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Key className="h-4 w-4" />
              Chave de Segurança (WebAuthn)
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              Esta funcionalidade requer uma licença Enterprise
            </p>
            <Button disabled variant="outline" className="cursor-not-allowed">
              <Key className="h-4 w-4 mr-2" />
              Indisponível nesta licença
            </Button>
          </div>
        </div>

        {(factors.length > 0 || webauthnCredentials.length > 0) && (
          <div className="space-y-3">
            <h3 className="font-semibold">Métodos Ativos</h3>
            
            {/* TOTP Factors */}
            {factors.map((factor) => (
              <div key={factor.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{factor.friendly_name}</p>
                    <p className="text-xs text-muted-foreground">Autenticador TOTP</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={factor.status === 'verified' ? 'default' : 'secondary'}>
                    {factor.status === 'verified' ? 'Ativo' : 'Pendente'}
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

            {/* WebAuthn Credentials */}
            {webauthnCredentials.map((cred) => (
              <div key={cred.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{cred.friendly_name || 'Chave de Segurança'}</p>
                    <p className="text-xs text-muted-foreground">
                      WebAuthn • Último uso: {cred.last_used_at ? new Date(cred.last_used_at).toLocaleDateString('pt-BR') : 'Nunca'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="default">Ativo</Badge>
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
              <DialogTitle>Configurar Autenticador TOTP</DialogTitle>
              <DialogDescription>
                Escaneie o QR Code com seu aplicativo autenticador
              </DialogDescription>
            </DialogHeader>

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

              <div className="space-y-2">
                <Label htmlFor="verify-code">Código de Verificação</Label>
                <Input
                  id="verify-code"
                  placeholder="000000"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  maxLength={6}
                  className="text-center text-2xl tracking-widest"
                />
                <p className="text-xs text-muted-foreground">
                  Digite o código de 6 dígitos gerado pelo seu aplicativo
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowTOTPDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={verifyTOTP} disabled={loading || verifyCode.length !== 6}>
                {loading ? "Verificando..." : "Verificar e Ativar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
