import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
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

// Types for MFA check response
interface MFACheckResponse {
  requiresMFA: boolean;
  hasMFA: boolean;
  hasWebAuthn: boolean;
  mfaFactors: Array<{
    id: string;
    type: string;
    name: string;
    status: string;
    verifiedAt?: string;
  }>;
  webauthnCredentials: Array<{
    id: string;
    name: string;
    createdAt: string;
  }>;
}

// Types for WebAuthn
interface WebAuthnStartResponse {
  options: {
    challenge: string;
    allowCredentials?: Array<{
      id: string;
      type: string;
    }>;
    timeout?: number;
    userVerification?: string;
  };
}

interface WebAuthnFinishResponse {
  user: any;
  sessionToken: string;
}

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
      setEmail(webauthnEmail);
      setShowWebAuthn(true);
      // Clear the flag
      sessionStorage.removeItem('webauthn-required');
    }
  }, []);

  // Check if user is already logged in (but not if we're showing WebAuthn or MFA screen)
  // Also check if we're in the middle of MFA check (mfaPending)
  const [mfaPending, setMfaPending] = useState(false);
  
  useEffect(() => {
    if (user && !showWebAuthn && !showMFAVerify && !mfaPending) {
      navigate("/app");
    }
  }, [user, navigate, showWebAuthn, showMFAVerify, mfaPending]);

  // Watch for NEW_PASSWORD_REQUIRED challenge
  useEffect(() => {
    if (challengeName === 'NEW_PASSWORD_REQUIRED' && challengeSession) {
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
    setMfaPending(true); // Prevent auto-redirect while checking MFA
    
    // Try normal login first
    const loginSuccess = await signIn(email, password);
    
    if (loginSuccess) {
      // After successful Cognito login, check for MFA settings
      try {
        const mfaCheckResult = await apiClient.invoke<MFACheckResponse>('mfa-check', {
          body: {}
        });
        
        const mfaData = mfaCheckResult.data;
        
        // Check if user has MFA enabled and needs to verify
        if (mfaData?.requiresMFA) {
          // Check for WebAuthn first (higher priority)
          if (mfaData.hasWebAuthn && mfaData.webauthnCredentials?.length > 0) {
            // Store email for WebAuthn flow
            sessionStorage.setItem('webauthn-email', email);
            setShowWebAuthn(true);
            setMfaPending(false);
            return; // Don't navigate, show WebAuthn screen
          }
          
          // Check for TOTP MFA
          if (mfaData.hasMFA && mfaData.mfaFactors?.length > 0) {
            // Set MFA factors and show MFA verification screen
            setMfaFactors(mfaData.mfaFactors);
            setShowMFAVerify(true);
            setMfaPending(false);
            return; // Don't navigate, show MFA screen
          }
        }
      } catch (error) {
        // If MFA check fails, log but continue with normal login
        // This ensures users can still login if MFA service has issues
        console.warn('MFA check failed, continuing with normal login:', error);
      }
      
      // No MFA required or MFA check failed - proceed to app
      setMfaPending(false);
      navigate("/app");
    } else {
      setMfaPending(false);
    }
  };

  const handleWebAuthnLogin = async () => {
    setWebAuthnLoading(true);
    setWebAuthnError("");
    
    try {
      // Step 1: Start WebAuthn authentication
      const startResult = await apiClient.invoke<WebAuthnStartResponse>('webauthn-authenticate', {
        body: { action: 'start', email }
      });

      if (startResult.error) {
        throw new Error(startResult.error.message || 'Failed to start WebAuthn');
      }

      const options = startResult.data?.options;
      if (!options) {
        throw new Error('Invalid WebAuthn response');
      }
      
      // Step 2: Get credential from user's device
      const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
        challenge: Uint8Array.from(options.challenge, (c: string) => c.charCodeAt(0)),
        allowCredentials: options.allowCredentials?.map((cred) => ({
          id: Uint8Array.from(cred.id, (c: string) => c.charCodeAt(0)),
          type: cred.type as PublicKeyCredentialType,
        })) || [],
        timeout: options.timeout || 60000,
        userVerification: (options.userVerification as UserVerificationRequirement) || 'preferred',
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
      
      const finishResult = await apiClient.invoke<WebAuthnFinishResponse>('webauthn-authenticate', {
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
      if (sessionData) {
        localStorage.setItem('evo-auth', JSON.stringify({
          user: sessionData.user,
          accessToken: sessionData.sessionToken,
          idToken: sessionData.sessionToken,
          refreshToken: sessionData.sessionToken
        }));
      }

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
      const result = await apiClient.invoke<{ verified: boolean }>('mfa-verify-login', {
        body: { factorId, code }
      });

      if (result.data?.verified) {
        return true;
      } else {
        setMfaError(result.error?.message || 'Invalid MFA code');
        return false;
      }
    } catch (error) {
      setMfaError('Error verifying MFA code');
      return false;
    }
  };

  const handleMFAVerified = () => {
    navigate("/app");
  };

  const handleNewPasswordSet = async (session: string, newPassword: string): Promise<boolean> => {
    const success = await confirmNewPassword(session, newPassword);
    if (success) {
      navigate("/app");
    }
    return success;
  };

  const handleBackToLogin = () => {
    setShowWebAuthn(false);
    setShowForgotPassword(false);
    setShowNewPasswordRequired(false);
    setShowMFAVerify(false);
    setMfaPending(false);
    setWebAuthnError("");
    setMfaError("");
    setNewPasswordSession("");
    setMfaFactors([]);
    setEmail("");
    setPassword("");
    sessionStorage.removeItem('webauthn-required');
    sessionStorage.removeItem('webauthn-email');
    // Sign out to clear any partial session
    signOut();
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
        session={challengeSession ?? newPasswordSession ?? ''}
        onPasswordSet={handleNewPasswordSet}
        onBackToLogin={handleBackToLogin}
        isLoading={isLoading}
        error={error ?? undefined}
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
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
            <p className="text-purple-200/80 text-sm font-medium tracking-wide">
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
              <Alert className="border-purple-500/50 bg-purple-500/10">
                <Key className="h-4 w-4 text-purple-500" />
                <AlertDescription className="text-purple-500">
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
                  className="w-full h-11 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-medium shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all duration-300 transform hover:scale-[1.02]"
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
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
                className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none" 
                disabled={isLoading || mfaPending}
              >
                {isLoading || mfaPending ? (
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

              {/* Registration Link */}
              <div className="text-center pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  Não tem uma conta?{' '}
                  <Link 
                    to="/register" 
                    className="text-blue-600 hover:text-blue-800 hover:underline font-medium transition-colors duration-200"
                  >
                    Criar conta trial
                  </Link>
                </p>
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