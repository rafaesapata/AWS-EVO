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
        eq: { user_id: user.username },
        order: { created_at: 'desc' }
      });
      const { data, error } = { data: result.data, error: result.error };

      
      setWebauthnCredentials(data || []);
    } catch (error: any) {
      console.error('Error loading WebAuthn credentials:', error);
    }
  };

  const loadMFAFactors = async () => {
    try {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) return;

      const result = await apiClient.invoke('mfa-list-factors', { body: {} });
      const { data, error } = { data: result.data, error: result.error };
      

      setFactors(data.all as MFAFactor[]);
    } catch (error: any) {
      console.error('Error loading MFA factors:', error);
    }
  };

  const enrollTOTP = async () => {
    setLoading(true);
    try {
      const result = await apiClient.invoke('mfa-enroll', {
        body: {
          factorType: 'totp',
          friendlyName: 'Autenticador TOTP'
        }
      });
      const { data, error } = { data: result.data, error: result.error };

      

      setQrCode(data.totp.qr_code);
      setTotpSecret(data.totp.secret);
      setFactorId(data.id);
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
      const result = await apiClient.invoke('mfa-challenge-verify', {
        body: {
          factorId: factorId,
          code: verifyCode
        }
      });
      const { data, error } = { data: result.data, error: result.error };

      

      toast({
        title: "TOTP ativado com sucesso!",
        description: "Seu autenticador foi configurado."
      });

      setShowTOTPDialog(false);
      setVerifyCode("");
      loadMFAFactors();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Código inválido",
        description: "Verifique o código e tente novamente."
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
      const { data: challengeData, error: challengeError } = { data: challengeResult.data, error: challengeResult.error };

      if (challengeError) throw challengeError;

      // Step 2: Create credential using WebAuthn API
      const challengeStr = String(challengeData.challenge);
      const userIdStr = String(challengeData.userId);
      
      const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
        challenge: Uint8Array.from(challengeStr, c => c.charCodeAt(0)),
        rp: {
          name: challengeData.rpName,
          id: window.location.hostname,
        },
        user: {
          id: Uint8Array.from(userIdStr, c => c.charCodeAt(0)),
          name: "user",
          displayName: "User"
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
          challengeId: challengeData.challenge
        }
      });
      const { error: verifyError } = { error: verifyResult.error };

      if (verifyError) throw new Error(verifyError);

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
        const result = await apiClient.delete('webauthn_credentials', {
          eq: { id: factorId, user_id: user.username }
        });
        const { error } = { error: result.error };

        

        toast({
          title: "Chave removida",
          description: "A chave de segurança foi desativada."
        });

        loadWebAuthnCredentials();
      } else {
        const result = await apiClient.invoke('mfa-unenroll', { body: { factorId } });
        const { error } = { error: result.error };
        

        toast({
          title: "Fator removido",
          description: "O método de autenticação foi desativado."
        });

        loadMFAFactors();
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
              Configurar Autenticador
            </Button>
          </div>

          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Key className="h-4 w-4" />
              Chave de Segurança (WebAuthn)
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              Use dispositivos físicos como Yubikey, Touch ID, Windows Hello ou Face ID
            </p>
            <Button onClick={enrollWebAuthn} disabled={loading} variant="outline">
              Registrar Chave de Segurança
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
              {qrCode && (
                <div className="flex justify-center">
                  <img src={qrCode} alt="QR Code" className="border rounded-lg p-2" />
                </div>
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
