import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAuthSafe } from "@/hooks/useAuthSafe";
import { apiClient } from "@/integrations/aws/api-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, Key, AlertCircle } from "lucide-react";
import evoLogo from "@/assets/logo.png";
import ForgotPassword from "@/components/auth/ForgotPassword";
import NewPasswordRequired from "@/components/auth/NewPasswordRequired";
import MFAVerify from "@/components/auth/MFAVerify";

export default function AuthSimple() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mounted, setMounted] = useState(false);
  const [showWebAuthn, setShowWebAuthn] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showNewPasswordRequired, setShowNewPasswordRequired] = useState(false);
  const [showMFAVerify, setShowMFAVerify] = useState(false);
  const [newPasswordSession, setNewPasswordSession] = useState("");
  const [webAuthnLoading, setWebAuthnLoading] = useState(false);
  const [webAuthnError, setWebAuthnError] = useState("");
  const [mfaFactors, setMfaFactors] = useState<any[]>([]);
  const [mfaError, setMfaError] = useState("");
  const { user, isLoading, error, challengeSession, challengeName, signIn, signOut, confirmNewPassword, clearError } = useAuthSafe();

  // Animation on mount
  useEffect(() => {
    setMounted(true);
    
    // Check if WebAuthn is required from previous login attempt
    const webauthnRequired = sessionStorage.getItem('webauthn-required');
    const webauthnEmail = sessionStorage.getItem('webauthn-email');
    
    if (webauthnRequired === 'true' && webauthnEmail) {
      console.log('🔐 WebAuthn required from sessionStorage, showing WebAuthn screen');
      setEmail(webauthnEmail);
      setShowWebAuthn(true);
      // Clear the flag
      sessionStorage.removeItem('webauthn-required');
    }
  }, []);

  // Check if user is already logged in (but not if we're showing WebAuthn or MFA screen)
  useEffect(() => {
    if (user && !showWebAuthn && !showMFAVerify) {
      navigate("/app");
    }
  }, [user, navigate, showWebAuthn, showMFAVerify]);

  // Watch for NEW_PASSWORD_REQUIRED challenge
  useEffect(() => {
    if (challengeName === 'NEW_PASSWORD_REQUIRED' && challengeSession) {
      console.log('🔐 NEW_PASSWORD_REQUIRED challenge detected, showing new password screen');
      setNewPasswordSession(challengeSession);
      setShowNewPasswordRequired(true);
    }
  }, [challengeName, challengeSession]);

  // Clear any WebAuthn cache on component mount
  useEffect(() => {
    // Clear sessionStorage items related to WebAuthn
    sessionStorage.removeItem('webauthn-required');
    sessionStorage.removeItem('webauthn-email');
    sessionStorage.removeItem('webauthn-challenge');
    sessionStorage.removeItem('webauthn-options');
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setWebAuthnError("");
    setMfaError("");
    
    console.log('🔐 [AUTH] Starting login process for:', email);
    
    // Try normal login first
    const success = await signIn(email, password);
    
    console.log('🔐 [AUTH] Cognito login result:', success);
    
    if (success) {
      // After successful Cognito login, check for local MFA settings
      try {
        console.log('🔐 Checking for local MFA settings after login...');
        const mfaResult = await apiClient.invoke('mfa-check', {
          body: {}
        });

        console.log('🔐 MFA check result:', mfaResult);

        // TEMPORARILY DISABLED - allow user to enter and delete old credentials
        console.log('🔐 MFA/WebAuthn check temporarily disabled');
        
      } catch (error) {
        console.warn('🔐 MFA/WebAuthn check failed, continuing with normal login:', error);
        // Continue with normal login if checks fail
      }
      
      console.log("✅ Login successful - redirecting to app");
      navigate("/app");
    }
  };

  const handleWebAuthnLogin = async () => {
    setWebAuthnLoading(true);
    setWebAuthnError("");
    
    try {
      // Step 1: Start WebAuthn authentication
      const startResult = await apiClient.invoke('webauthn-authenticate', {
        body: { action: 'start', email }
      });

      if (startResult.error) {
        throw new Error(startResult.error.message || 'Failed to start WebAuthn');
      }

      const options = startResult.data.options;
      
      // Step 2: Get credential from user's device
      const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
        challenge: Uint8Array.from(options.challenge, c => c.charCodeAt(0)),
        allowCredentials: options.allowCredentials?.map((cred: any) => ({
          id: Uint8Array.from(cred.id, c => c.charCodeAt(0)),
          type: cred.type as PublicKeyCredentialType,
        })) || [],
        timeout: options.timeout || 60000,
        userVerification: options.userVerification || 'preferred',
        rpId: 'evo.ai.udstec.io'
      };

      const credential = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions
      }) as PublicKeyCredential;

      if (!credential) {
        throw new Error("Autenticação WebAuthn cancelada");
      }

      // Step 3: Verify credential with backend
      const response = credential.response as AuthenticatorAssertionResponse;
      
      const finishResult = await apiClient.invoke('webauthn-authenticate', {
        body: {
          action: 'finish',
          challenge: options.challenge,
          assertion: {
            id: credential.id,
            rawId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
            type: credential.type,
            response: {
              clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(response.clientDataJSON))),
              authenticatorData: btoa(String.fromCharCode(...new Uint8Array(response.authenticatorData))),
              signature: btoa(String.fromCharCode(...new Uint8Array(response.signature))),
              userHandle: response.userHandle ? btoa(String.fromCharCode(...new Uint8Array(response.userHandle))) : undefined
            }
          }
        }
      });

      if (finishResult.error) {
        throw new Error(finishResult.error.message || 'WebAuthn verification failed');
      }

      // Success! Store session and redirect
      const sessionData = finishResult.data;
      localStorage.setItem('evo-auth', JSON.stringify({
        user: sessionData.user,
        accessToken: sessionData.sessionToken,
        idToken: sessionData.sessionToken,
        refreshToken: sessionData.sessionToken
      }));

      navigate("/app");
    } catch (error: any) {
      console.error('WebAuthn error:', error);
      let errorMessage = 'Falha na autenticação WebAuthn';
      
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Autenticação cancelada ou negada pelo usuário';
      } else if (error.name === 'InvalidStateError') {
        errorMessage = 'Chave de segurança já está registrada ou em uso';
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'WebAuthn não é suportado neste navegador';
      } else if (error.name === 'SecurityError') {
        errorMessage = 'Erro de segurança - verifique se está usando HTTPS';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setWebAuthnError(errorMessage);
    } finally {
      setWebAuthnLoading(false);
    }
  };

  const handleMFAVerify = async (factorId: string, code: string): Promise<boolean> => {
    try {
      console.log('🔐 Verifying MFA code...', { factorId });
      
      const result = await apiClient.invoke('mfa-verify-login', {
        body: { factorId, code }
      });

      if (result.data?.verified) {
        console.log('🔐 MFA verification successful');
        return true;
      } else {
        console.log('🔐 MFA verification failed:', result.error);
        setMfaError(result.error?.message || 'Invalid MFA code');
        return false;
      }
    } catch (error) {
      console.error('🔐 MFA verification error:', error);
      setMfaError('Error verifying MFA code');
      return false;
    }
  };

  const handleMFAVerified = () => {
    console.log('🔐 MFA verified successfully - redirecting to app');
    navigate("/app");
  };

  const handleNewPasswordSet = async (session: string, newPassword: string): Promise<boolean> => {
    const success = await confirmNewPassword(session, newPassword);
    if (success) {
      console.log("✅ New password set successfully - redirecting to app");
      navigate("/app");
    }
    return success;
  };

  const handleBackToLogin = () => {
    setShowWebAuthn(false);
    setShowForgotPassword(false);
    setShowNewPasswordRequired(false);
    setShowMFAVerify(false);
    setWebAuthnError("");
    setMfaError("");
    setNewPasswordSession("");
    setMfaFactors([]);
    setEmail("");
    setPassword("");
    sessionStorage.removeItem('webauthn-required');
    sessionStorage.removeItem('webauthn-email');
  };

  // Se está mostrando a tela de recuperação de senha
  if (showForgotPassword) {
    return <ForgotPassword onBackToLogin={handleBackToLogin} />;
  }

  // Se está mostrando a tela de nova senha obrigatória
  if (showNewPasswordRequired) {
    return (
      <NewPasswordRequired
        email={email}
        session={challengeSession || newPasswordSession}
        onPasswordSet={handleNewPasswordSet}
        onBackToLogin={handleBackToLogin}
        isLoading={isLoading}
        error={error}
      />
    );
  }

  // Se está mostrando a tela de verificação MFA
  if (showMFAVerify) {
    return (
      <MFAVerify
        email={email}
        mfaFactors={mfaFactors}
        onMFAVerified={handleMFAVerified}
        onBackToLogin={handleBackToLogin}
        onVerifyMFA={handleMFAVerify}
        isLoading={isLoading}
        error={mfaError}
      />
    );
  }

  if (showWebAuthn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
        </div>

        <div className="w-full max-w-md relative z-10">
          {/* Logo Section */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center mb-4 transform hover:scale-105 transition-transform duration-300">
              <img 
                src={evoLogo} 
                alt="EVO Cloud Intelligence" 
                className="h-28 drop-shadow-2xl"
              />
            </div>
            <p className="text-blue-200/80 text-sm font-medium tracking-wide">
              FinOps & Security Intelligence Platform
            </p>
          </div>

          {/* WebAuthn Card */}
          <Card className="shadow-2xl border-0 bg-white/95 backdrop-blur-sm">
            <CardHeader className="space-y-1 pb-4">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <CardTitle className="text-2xl font-semibold text-gray-800">Autenticação Segura</CardTitle>
              </div>
              <CardDescription className="text-gray-500">
                Use sua chave de segurança para continuar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Alert className="border-blue-500/50 bg-blue-500/10">
                <Key className="h-4 w-4 text-blue-500" />
                <AlertDescription className="text-blue-500">
                  <strong>Autenticação obrigatória:</strong> Você possui uma chave de segurança WebAuthn registrada. Por motivos de segurança, é obrigatório usá-la para fazer login.
                </AlertDescription>
              </Alert>

              {webAuthnError && (
                <Alert className="border-red-500/50 bg-red-500/10">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <AlertDescription className="text-red-500">
                    {webAuthnError}
                  </AlertDescription>
                </Alert>
              )}

              <div className="text-center space-y-4">
                <p className="text-sm text-muted-foreground">
                  Usuário: <strong>{email}</strong>
                </p>
                
                <Button 
                  onClick={handleWebAuthnLogin}
                  disabled={webAuthnLoading}
                  className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300 transform hover:scale-[1.02]"
                >
                  {webAuthnLoading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Aguardando dispositivo...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Key className="h-4 w-4" />
                      Usar Chave de Segurança
                    </span>
                  )}
                </Button>

                <Button 
                  variant="outline" 
                  onClick={handleBackToLogin}
                  disabled={webAuthnLoading}
                  className="w-full"
                >
                  Voltar e Trocar Usuário
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className={`w-full max-w-md relative z-10 transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        {/* Logo Section */}
        <div className={`text-center mb-8 transition-all duration-700 delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          <div className="inline-flex items-center justify-center mb-4 transform hover:scale-105 transition-transform duration-300">
            <img 
              src={evoLogo} 
              alt="EVO Cloud Intelligence" 
              className="h-28 drop-shadow-2xl"
            />
          </div>
          <p className="text-blue-200/80 text-sm font-medium tracking-wide">
            FinOps & Security Intelligence Platform
          </p>
        </div>

        {/* Login Card */}
        <Card className={`shadow-2xl border-0 bg-white/95 backdrop-blur-sm transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl font-semibold text-gray-800">Bem-vindo</CardTitle>
            <CardDescription className="text-gray-500">
              Entre com suas credenciais para continuar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-5">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-700 font-medium">Usuário</Label>
                <Input
                  id="email"
                  type="text"
                  placeholder="seu.email@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  className="h-11 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 transition-all duration-200"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-700 font-medium">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="h-11 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 transition-all duration-200"
                />
              </div>

              <Button 
                type="submit" 
                className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300 transform hover:scale-[1.02]" 
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Entrando...
                  </span>
                ) : "Entrar"}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  disabled={isLoading}
                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline transition-colors duration-200 disabled:opacity-50"
                >
                  Esqueci minha senha
                </button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className={`text-center mt-6 transition-all duration-700 delay-300 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <p className="text-sm text-blue-200/60">
            v2.5.3
          </p>
        </div>
      </div>
    </div>
  );
}