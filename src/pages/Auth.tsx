import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Mail, Lock, User, Building2, ArrowLeft, Eye, EyeOff, Key } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import evoLogo from "@/assets/evo-logo.png";
import { getVersionString } from "@/lib/version";
import { z } from "@/lib/zod-config";

export default function Auth() {
  // Lista completa de domínios de email gratuitos
  const FREE_EMAIL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com',
    'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.es', 'hotmail.it',
    'outlook.com', 'outlook.co.uk', 'outlook.fr', 'outlook.de',
    'yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de', 'yahoo.es', 'yahoo.it', 'ymail.com',
    'live.com', 'live.co.uk', 'live.fr',
    'protonmail.com', 'protonmail.ch', 'pm.me', 'proton.me',
    'icloud.com', 'me.com', 'mac.com',
    'aol.com', 'aol.co.uk',
    'mail.com',
    'zoho.com', 'zohomail.com',
    'gmx.com', 'gmx.net', 'gmx.de',
    'yandex.com', 'yandex.ru',
    'mail.ru',
    'tutanota.com', 'tutanota.de', 'tutamail.com',
    'fastmail.com', 'fastmail.fm',
    'hey.com',
    'msn.com',
    'qq.com',
    '163.com', '126.com',
    'web.de',
    'freenet.de',
    't-online.de',
    'orange.fr', 'wanadoo.fr',
    'libero.it', 'virgilio.it',
    'terra.com.br', 'uol.com.br', 'bol.com.br',
  ]);

  // Schemas definidos dentro do componente para evitar problemas de hoisting
  const loginSchema = z.object({
    email: z.string().email("Email inválido"),
    password: z.string().min(8, "Senha deve ter no mínimo 8 caracteres"),
  });

  const signupSchema = z.object({
    fullName: z.string().min(3, "Nome completo deve ter no mínimo 3 caracteres"),
    email: z.string().email("Email inválido").refine(
      (email) => {
        const domain = email.split('@')[1]?.toLowerCase();
        return !FREE_EMAIL_DOMAINS.has(domain);
      },
      "Apenas emails corporativos são permitidos. Emails gratuitos (Gmail, Hotmail, etc.) não são aceitos."
    ),
    companyName: z.string().optional(),
    password: z.string()
      .min(12, "Senha deve ter no mínimo 12 caracteres")
      .regex(/[A-Z]/, "Deve conter pelo menos uma letra maiúscula")
      .regex(/[a-z]/, "Deve conter pelo menos uma letra minúscula")
      .regex(/[0-9]/, "Deve conter pelo menos um número")
      .regex(/[^A-Za-z0-9]/, "Deve conter pelo menos um caractere especial"),
    confirmPassword: z.string(),
  }).refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

  const resetSchema = z.object({
    email: z.string().email("Email inválido"),
  });
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"login" | "signup" | "reset">("login");
  const [showMFAChallenge, setShowMFAChallenge] = useState(false);
  const [showMFASetup, setShowMFASetup] = useState(false);
  const [mfaSecretCode, setMfaSecretCode] = useState("");
  const [mfaSetupSession, setMfaSetupSession] = useState("");
  const [showWebAuthnChallenge, setShowWebAuthnChallenge] = useState(false);
  const [hasWebAuthn, setHasWebAuthn] = useState(false);
  const [webAuthnOptions, setWebAuthnOptions] = useState<any>(null);
  const [useWebAuthnForMFA, setUseWebAuthnForMFA] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [mfaChallengeId, setMfaChallengeId] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [tempUserId, setTempUserId] = useState("");

  // Login form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Signup form
  const [signupFullName, setSignupFullName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupCompanyName, setSignupCompanyName] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);

  // Reset form
  const [resetEmail, setResetEmail] = useState("");

  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binaryString = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  const isInIframe = () => {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  };

  const handleWebAuthnLogin = async (userId: string) => {
    try {
      setIsLoading(true);
      
      // Check if we're in an iframe - WebAuthn doesn't work in cross-origin iframes
      if (isInIframe()) {
        throw new Error("WebAuthn não funciona em preview/iframe. Por favor, use TOTP ou acesse a URL direta do aplicativo.");
      }
      
      // Step 1: Get challenge from backend
      const result = await apiClient.invoke('webauthn-authenticate', {
        body: { action: 'generate-challenge' }
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      const challengeData = result.data;

      if (!challengeData || !challengeData.challenge) {
        throw new Error("Desafio WebAuthn inválido");
      }

      // Step 2: Get credential using WebAuthn API
      // Use base domain udstec.io for rpId
      const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
        challenge: base64ToArrayBuffer(challengeData.challenge),
        rpId: 'evo.ai.udstec.io',
        allowCredentials: challengeData.credentials?.map((cred: any) => ({
          id: base64ToArrayBuffer(cred.id),
          type: 'public-key' as const,
          transports: cred.transports || []
        })) || [],
        timeout: 60000,
        userVerification: 'preferred' as const
      };

      const assertion = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions
      }) as PublicKeyCredential;

      if (!assertion) {
        throw new Error("Falha ao obter credencial");
      }

      // Step 3: Verify assertion
      const response = assertion.response as AuthenticatorAssertionResponse;
      const verifyResult = await apiClient.invoke('webauthn-authenticate', {
        body: {
          action: 'verify-authentication',
          credential: {
            id: assertion.id,
            rawId: btoa(String.fromCharCode(...new Uint8Array(assertion.rawId))),
            response: {
              authenticatorData: btoa(String.fromCharCode(...new Uint8Array(response.authenticatorData))),
              clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(response.clientDataJSON))),
              signature: btoa(String.fromCharCode(...new Uint8Array(response.signature))),
              userHandle: response.userHandle ? btoa(String.fromCharCode(...new Uint8Array(response.userHandle))) : null
            }
          },
          challengeId: challengeData.challenge
        }
      });

      if (verifyResult.error) throw verifyResult.error;

      if (verifyResult.data?.verified) {
        toast({
          title: "Login realizado com sucesso!",
          description: "Autenticação WebAuthn verificada. Redirecionando...",
        });
        // Delay navigation to prevent DOM reconciliation errors with toast portal
        setTimeout(() => navigate("/app"), 100);
      } else {
        throw new Error("Falha na verificação WebAuthn");
      }
    } catch (error: any) {
      console.error('WebAuthn login error:', error);
      
      // Show user-friendly message
      let errorMessage = error.message || "Falha ao autenticar com chave de segurança.";
      
      if (error.message?.includes("iframe") || error.message?.includes("origin")) {
        errorMessage = "WebAuthn não funciona em preview/iframe. Por favor, configure e use TOTP como alternativa ou acesse a URL direta do aplicativo.";
      }
      
      toast({
        variant: "destructive",
        title: "Erro na autenticação WebAuthn",
        description: errorMessage
      });
      
      await cognitoAuth.signOut();
    } finally {
      setIsLoading(false);
      setShowWebAuthnChallenge(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const validation = loginSchema.parse({ email: loginEmail, password: loginPassword });

      const session = await cognitoAuth.signIn(validation.email, validation.password);

      if (!session) {
        toast({
          variant: "destructive",
          title: "Erro ao fazer login",
          description: "Email ou senha incorretos. Verifique suas credenciais e tente novamente.",
        });
        return;
      }

      // Check if it's a challenge response (MFA, etc)
      if ('challengeName' in session && session.challengeName) {
        console.log('🔐 Auth: Challenge received:', session.challengeName, session);
        
        // Check if MFA is required
        if (session.challengeName === 'SOFTWARE_TOKEN_MFA') {
          setMfaFactorId(session.session || '');
          
          // Check if user has WebAuthn configured - offer as alternative
          try {
            const webauthnCheck = await apiClient.invoke('webauthn-authenticate', {
              body: { action: 'start', email: loginEmail }
            });
            
            if (webauthnCheck.data?.options?.allowCredentials?.length > 0) {
              // User has WebAuthn - show choice
              setHasWebAuthn(true);
              setWebAuthnOptions(webauthnCheck.data.options);
            }
          } catch (e) {
            // No WebAuthn configured, continue with TOTP only
            console.log('No WebAuthn credentials found');
          }
          
          setShowMFAChallenge(true);
          
          toast({
            title: "MFA Obrigatório",
            description: "Digite o código do seu autenticador ou use sua chave de segurança.",
          });
          
          setIsLoading(false);
          return;
        }

        // Check if MFA setup is required (first time)
        if (session.challengeName === 'MFA_SETUP') {
          try {
            // Get the secret code for TOTP setup
            const setupResult = await cognitoAuth.associateSoftwareToken(session.session || '');
            setMfaSecretCode(setupResult.secretCode);
            setMfaSetupSession(setupResult.session);
            setShowMFASetup(true);
            
            toast({
              title: "Configuração MFA Obrigatória",
              description: "Configure seu autenticador para continuar.",
            });
          } catch (error: any) {
            console.error('🔐 Auth: MFA setup error:', error);
            toast({
              variant: "destructive",
              title: "Erro ao configurar MFA",
              description: error.message || "Falha ao obter código de configuração.",
            });
          }
          
          setIsLoading(false);
          return;
        }

        // Check for WebAuthn/FIDO2 challenge (custom Lambda trigger)
        if (session.challengeName === 'CUSTOM_CHALLENGE') {
          setTempUserId(session.challengeParameters?.userId || '');
          setShowWebAuthnChallenge(true);
          
          toast({
            title: "Autenticação WebAuthn",
            description: "Use sua chave de segurança para continuar.",
          });
          
          // Trigger WebAuthn immediately
          setTimeout(() => {
            handleWebAuthnLogin(session.challengeParameters?.userId || '');
          }, 100);
          
          setIsLoading(false);
          return;
        }

        // Unknown challenge - show error with details
        console.error('🔐 Auth: Unknown challenge:', session.challengeName);
        toast({
          variant: "destructive",
          title: "MFA ou desafio adicional necessário",
          description: `Tipo de desafio: ${session.challengeName}. Entre em contato com o suporte.`,
        });
        setIsLoading(false);
        return;
      }

      // Successful login - session is AuthSession with user
      if ('user' in session && session.user) {
        toast({
          title: "Login realizado com sucesso!",
          description: "Redirecionando para o dashboard...",
        });
        // Delay navigation to prevent DOM reconciliation errors with toast portal
        setTimeout(() => navigate("/app"), 100);
        return;
      }

      // Fallback - something unexpected
      toast({
        variant: "destructive",
        title: "Erro ao fazer login",
        description: "Resposta inesperada do servidor.",
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          variant: "destructive",
          title: "Erro de validação",
          description: error.errors[0].message,
        });
      } else {
        let errorMessage = "Ocorreu um erro inesperado. Tente novamente.";
        let errorTitle = "Erro ao fazer login";
        
        if (error.code === 'NotAuthorizedException') {
          // Check for specific message about expired temporary password
          if (error.message?.includes('Temporary password has expired')) {
            errorTitle = "Senha temporária expirada";
            errorMessage = "Sua senha temporária expirou. Entre em contato com o administrador para receber uma nova senha temporária.";
          } else {
            errorMessage = "Email ou senha incorretos. Verifique suas credenciais e tente novamente.";
          }
        } else if (error.code === 'UserNotConfirmedException') {
          errorMessage = "Conta não confirmada. Verifique seu email para confirmar a conta.";
        } else if (error.code === 'UserNotFoundException') {
          errorMessage = "Usuário não encontrado. Verifique o email ou crie uma nova conta.";
        } else if (error.code === 'TooManyRequestsException') {
          errorMessage = "Muitas tentativas de login. Tente novamente em alguns minutos.";
        } else if (error.code === 'PasswordResetRequiredException') {
          errorTitle = "Redefinição de senha necessária";
          errorMessage = "Você precisa redefinir sua senha. Use a opção 'Esqueci minha senha' para criar uma nova.";
        }
        
        toast({
          variant: "destructive",
          title: errorTitle,
          description: errorMessage,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleMFAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await cognitoAuth.confirmSignIn(mfaFactorId, mfaCode);

      if (!result) {
        toast({
          variant: "destructive",
          title: "Código inválido",
          description: "Verifique o código e tente novamente.",
        });
        return;
      }

      toast({
        title: "Login realizado com sucesso!",
        description: "Redirecionando para o dashboard...",
      });
      // Delay navigation to prevent DOM reconciliation errors with toast portal
      setTimeout(() => navigate("/app"), 100);
    } catch (error: any) {
      let errorMessage = "Tente novamente.";
      
      if (error.code === 'CodeMismatchException') {
        errorMessage = "Código inválido. Verifique o código e tente novamente.";
      } else if (error.code === 'ExpiredCodeException') {
        errorMessage = "Código expirado. Faça login novamente.";
      }
      
      toast({
        variant: "destructive",
        title: "Erro na verificação MFA",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleWebAuthnMFA = async () => {
    if (!webAuthnOptions) return;
    
    setIsLoading(true);
    try {
      // Create credential request options
      // Use base domain udstec.io for rpId
      const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
        challenge: base64ToArrayBuffer(webAuthnOptions.challenge),
        rpId: 'evo.ai.udstec.io',
        allowCredentials: webAuthnOptions.allowCredentials?.map((cred: any) => ({
          id: base64ToArrayBuffer(cred.id),
          type: 'public-key' as const,
        })) || [],
        timeout: 60000,
        userVerification: 'preferred' as const
      };

      const assertion = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions
      }) as PublicKeyCredential;

      if (!assertion) {
        throw new Error("Falha ao obter credencial");
      }

      // Verify with backend
      const response = assertion.response as AuthenticatorAssertionResponse;
      const verifyResult = await apiClient.invoke('webauthn-authenticate', {
        body: {
          action: 'finish',
          assertion: {
            id: assertion.id,
            rawId: btoa(String.fromCharCode(...new Uint8Array(assertion.rawId))),
            type: assertion.type,
            response: {
              authenticatorData: btoa(String.fromCharCode(...new Uint8Array(response.authenticatorData))),
              clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(response.clientDataJSON))),
              signature: btoa(String.fromCharCode(...new Uint8Array(response.signature))),
              userHandle: response.userHandle ? btoa(String.fromCharCode(...new Uint8Array(response.userHandle))) : null
            }
          },
          challenge: webAuthnOptions.challenge
        }
      });

      if (verifyResult.error) {
        throw new Error(verifyResult.error.message || 'Falha na verificação');
      }

      // WebAuthn verified - now complete Cognito MFA with a bypass
      // Since we verified WebAuthn, we can complete the Cognito session
      // For now, we'll use the TOTP flow but in production you'd want a custom Lambda
      toast({
        title: "WebAuthn verificado!",
        description: "Autenticação com chave de segurança bem-sucedida.",
      });

      // Store WebAuthn session and redirect
      if (verifyResult.data?.sessionToken) {
        // WebAuthn provides its own session
        localStorage.setItem('evo-webauthn-session', JSON.stringify({
          token: verifyResult.data.sessionToken,
          user: verifyResult.data.user,
          expiresAt: verifyResult.data.expiresAt
        }));
      }

      setTimeout(() => navigate("/app"), 100);
    } catch (error: any) {
      console.error('WebAuthn MFA error:', error);
      toast({
        variant: "destructive",
        title: "Erro na autenticação WebAuthn",
        description: error.message || "Falha ao verificar chave de segurança."
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMFASetupVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await cognitoAuth.verifySoftwareToken(mfaSetupSession, mfaCode);

      if (!result) {
        toast({
          variant: "destructive",
          title: "Código inválido",
          description: "Verifique o código e tente novamente.",
        });
        return;
      }

      toast({
        title: "MFA configurado com sucesso!",
        description: "Redirecionando para o dashboard...",
      });
      setTimeout(() => navigate("/app"), 100);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro na configuração MFA",
        description: error.message || "Código inválido. Verifique e tente novamente.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const validation = signupSchema.parse({
        fullName: signupFullName,
        email: signupEmail,
        companyName: signupCompanyName,
        password: signupPassword,
        confirmPassword: signupConfirmPassword,
      });

      const result = await cognitoAuth.signUp(
        validation.email,
        validation.password,
        {
          name: validation.fullName,
          'custom:company_name': validation.companyName || validation.email.split('@')[1],
        }
      );

      if (result) {
        toast({
          title: "Conta criada com sucesso!",
          description: "Verifique seu email para confirmar a conta e depois faça login.",
        });
        setActiveTab("login");
        setLoginEmail(validation.email);
      }
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          variant: "destructive",
          title: "Erro de validação",
          description: error.errors[0].message,
        });
      } else {
        let errorMessage = "Ocorreu um erro inesperado. Tente novamente.";
        
        if (error.code === 'UsernameExistsException') {
          errorMessage = "Este email já está cadastrado. Faça login ou recupere sua senha.";
        } else if (error.code === 'InvalidPasswordException') {
          errorMessage = "Senha não atende aos critérios de segurança. Use pelo menos 8 caracteres com letras e números.";
        } else if (error.code === 'InvalidParameterException') {
          errorMessage = "Email inválido ou não permitido. Use apenas emails corporativos.";
        }
        
        toast({
          variant: "destructive",
          title: "Erro ao criar conta",
          description: errorMessage,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const validation = resetSchema.parse({ email: resetEmail });

      await cognitoAuth.forgotPassword(validation.email);

      toast({
        title: "Email enviado!",
        description: "Verifique sua caixa de entrada para redefinir sua senha.",
      });
      setActiveTab("login");
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          variant: "destructive",
          title: "Erro de validação",
          description: error.errors[0].message,
        });
      } else {
        let errorMessage = "Ocorreu um erro inesperado. Tente novamente.";
        
        if (error.code === 'UserNotFoundException') {
          errorMessage = "Email não encontrado. Verifique o email ou crie uma nova conta.";
        } else if (error.code === 'LimitExceededException') {
          errorMessage = "Muitas tentativas. Tente novamente em alguns minutos.";
        }
        
        toast({
          variant: "destructive",
          title: "Erro ao recuperar senha",
          description: errorMessage,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen animated-gradient flex items-center justify-center p-4">
      <div className="w-full max-w-xs">
        <div className="text-center mb-4 animate-fade-in">
          <div className="inline-flex items-center justify-center mb-2">
            <img src={evoLogo} alt="EVO Cloud Intelligence" className="h-10" />
          </div>
          <p className="text-xs text-muted-foreground">FinOps & Security Intelligence Platform</p>
        </div>

        <Card className="animate-scale-in relative overflow-hidden border-2 border-primary/20 hover:border-primary/40 transition-all duration-500">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 pointer-events-none" />
          <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-blue-500/20 to-primary/20 rounded-lg blur opacity-20 group-hover:opacity-40 transition duration-1000 animate-pulse" />
          <CardHeader className="pb-3 space-y-0.5 relative z-10">
            <CardTitle className="text-lg">
              {showMFASetup && "Configurar MFA"}
              {showMFAChallenge && "Verificação MFA"}
              {showWebAuthnChallenge && "Verificação WebAuthn"}
              {!showMFAChallenge && !showWebAuthnChallenge && !showMFASetup && "Bem-vindo"}
            </CardTitle>
            <CardDescription className="text-xs">
              {showMFASetup && "Configure seu aplicativo autenticador"}
              {showMFAChallenge && "Digite o código de autenticação"}
              {showWebAuthnChallenge && "Aguardando autenticação com chave de segurança..."}
              {!showMFAChallenge && !showWebAuthnChallenge && !showMFASetup && activeTab === "login" && "Entre com suas credenciais"}
              {!showMFAChallenge && !showWebAuthnChallenge && activeTab === "signup" && "Crie sua conta corporativa"}
              {!showMFAChallenge && !showWebAuthnChallenge && activeTab === "reset" && "Recupere sua senha"}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 relative z-10">
            {showWebAuthnChallenge ? (
              <div className="space-y-4 py-8 text-center">
                <div className="flex justify-center">
                  <div className="p-4 rounded-full bg-primary/10 animate-pulse">
                    <Shield className="h-12 w-12 text-primary" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Autenticação em andamento</h3>
                  <p className="text-sm text-muted-foreground">
                    Use sua chave de segurança, Touch ID, Face ID ou Windows Hello para continuar
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowWebAuthnChallenge(false);
                    setIsLoading(false);
                  }}
                >
                  Cancelar
                </Button>
              </div>
            ) : showMFASetup ? (
              <form onSubmit={handleMFASetupVerify} className="space-y-4">
                <div className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm font-medium mb-2">1. Escaneie o QR Code ou copie o código:</p>
                    <div className="flex justify-center mb-3">
                      <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=otpauth://totp/EVO:${loginEmail}?secret=${mfaSecretCode}&issuer=EVO`}
                        alt="QR Code MFA"
                        className="rounded-lg"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 bg-background rounded text-xs break-all">
                        {mfaSecretCode}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(mfaSecretCode);
                          toast({ title: "Código copiado!" });
                        }}
                      >
                        Copiar
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="mfa-setup-code">2. Digite o código do autenticador:</Label>
                    <Input
                      id="mfa-setup-code"
                      type="text"
                      placeholder="000000"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      maxLength={6}
                      className="text-center text-2xl tracking-widest"
                      required
                      disabled={isLoading}
                      autoFocus
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full bg-gradient-primary" disabled={isLoading || mfaCode.length !== 6}>
                  {isLoading ? "Verificando..." : "Ativar MFA"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setShowMFASetup(false);
                    setMfaCode("");
                    setMfaSecretCode("");
                  }}
                >
                  Cancelar
                </Button>
              </form>
            ) : showMFAChallenge ? (
              <div className="space-y-4">
                {/* WebAuthn option if available */}
                {hasWebAuthn && (
                  <div className="space-y-3">
                    <Button 
                      onClick={handleWebAuthnMFA} 
                      className="w-full bg-gradient-primary"
                      disabled={isLoading}
                    >
                      <Key className="h-4 w-4 mr-2" />
                      {isLoading ? "Verificando..." : "Usar Chave de Segurança"}
                    </Button>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">ou</span>
                      </div>
                    </div>
                  </div>
                )}
                
                <form onSubmit={handleMFAVerify} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="mfa-code">Código de Autenticação</Label>
                    <Input
                      id="mfa-code"
                      type="text"
                      placeholder="000000"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      maxLength={6}
                      className="text-center text-2xl tracking-widest"
                      required
                      disabled={isLoading}
                      autoFocus={!hasWebAuthn}
                    />
                    <p className="text-xs text-muted-foreground">
                      Digite o código do seu aplicativo autenticador
                    </p>
                  </div>

                  <Button type="submit" className="w-full" variant={hasWebAuthn ? "outline" : "default"} disabled={isLoading || mfaCode.length !== 6}>
                    {isLoading ? "Verificando..." : "Verificar Código"}
                  </Button>
                </form>

                <p className="text-xs text-center text-muted-foreground">
                  MFA está ativo na sua conta. Para gerenciar, acesse as configurações após fazer login.
                </p>
              </div>
            ) : (
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                <TabsList className="glass-card-float grid w-full grid-cols-2 mb-3">
                  <TabsTrigger value="login" className="text-xs py-1.5">Login</TabsTrigger>
                  <TabsTrigger value="signup" className="text-xs py-1.5">Cadastro</TabsTrigger>
                </TabsList>

                <TabsContent value="login" className="space-y-2.5">
                <form onSubmit={handleLogin} className="space-y-2.5">
                  <div className="space-y-1">
                    <Label htmlFor="login-email" className="text-xs">Usuário</Label>
                    <div className="relative">
                      <Mail className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="seu.email@empresa.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="pl-9 h-8 text-xs"
                        required
                        disabled={isLoading}
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="login-password" className="text-xs">Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type={showLoginPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="pl-9 pr-9 h-8 text-xs"
                        required
                        disabled={isLoading}
                        autoComplete="current-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-8 px-2 hover:bg-transparent"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                      >
                        {showLoginPassword ? (
                          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="link"
                    className="p-0 h-auto text-[10px]"
                    onClick={() => setActiveTab("reset")}
                  >
                    Esqueceu sua senha?
                  </Button>

                  <Button type="submit" className="w-full bg-gradient-primary h-8 text-xs" disabled={isLoading}>
                    {isLoading ? "Entrando..." : "Entrar"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="space-y-2.5">
                <form onSubmit={handleSignup} className="space-y-2.5">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Nome Completo *</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-name"
                        type="text"
                        placeholder="João Silva"
                        value={signupFullName}
                        onChange={(e) => setSignupFullName(e.target.value)}
                        className="pl-10"
                        required
                        disabled={isLoading}
                        autoComplete="name"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email Corporativo *</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="seu.email@empresa.com"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        className="pl-10"
                        required
                        disabled={isLoading}
                        autoComplete="email"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Emails gratuitos (Gmail, Hotmail, etc.) não são aceitos
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-company">Nome da Empresa (opcional)</Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-company"
                        type="text"
                        placeholder="Minha Empresa Ltda"
                        value={signupCompanyName}
                        onChange={(e) => setSignupCompanyName(e.target.value)}
                        className="pl-10"
                        disabled={isLoading}
                        autoComplete="organization"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Senha *</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-password"
                        type={showSignupPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        className="pl-10 pr-10"
                        required
                        disabled={isLoading}
                        autoComplete="new-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowSignupPassword(!showSignupPassword)}
                      >
                        {showSignupPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm">Confirmar Senha *</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-confirm"
                        type={showSignupConfirmPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={signupConfirmPassword}
                        onChange={(e) => setSignupConfirmPassword(e.target.value)}
                        className="pl-10 pr-10"
                        required
                        disabled={isLoading}
                        autoComplete="new-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowSignupConfirmPassword(!showSignupConfirmPassword)}
                      >
                        {showSignupConfirmPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <Button type="submit" className="w-full bg-gradient-primary" disabled={isLoading}>
                    {isLoading ? "Criando conta..." : "Criar Conta"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="reset" className="space-y-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTab("login")}
                  className="mb-2"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar para login
                </Button>

                <form onSubmit={handleReset} className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Email Corporativo</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="reset-email"
                        type="email"
                        placeholder="seu.email@empresa.com"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        className="pl-10"
                        required
                        disabled={isLoading}
                        autoComplete="email"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Enviaremos um link para redefinir sua senha
                    </p>
                  </div>

                  <Button type="submit" className="w-full bg-gradient-primary" disabled={isLoading}>
                    {isLoading ? "Enviando..." : "Recuperar Senha"}
                  </Button>
                </form>
              </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

        <div className="text-center mt-3 space-y-0.5">
          <p className="text-[10px] text-muted-foreground">
            Ao criar uma conta, você concorda com nossos{" "}
            <a 
              href="/terms" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-primary hover:underline font-medium"
            >
              Termos de Serviço
            </a>
          </p>
          <p className="text-[10px] text-muted-foreground/60 font-mono">
            EVO {getVersionString()}
          </p>
        </div>
      </div>
    </div>
  );
}