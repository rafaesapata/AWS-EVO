import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Mail, Lock, User, Building2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import evoLogo from "@/assets/evo-logo.png";
import { getVersionString } from "@/lib/version";
import { z } from "@/lib/zod-config";

export default function Auth() {
  // Schemas definidos dentro do componente para evitar problemas de hoisting
  const loginSchema = z.object({
    email: z.string().email("Email inválido"),
    password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  });

  const signupSchema = z.object({
    fullName: z.string().min(3, "Nome completo deve ter no mínimo 3 caracteres"),
    email: z.string().email("Email inválido").refine(
      (email) => {
        const domain = email.split('@')[1]?.toLowerCase();
        const freeDomains = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'live.com'];
        return !freeDomains.includes(domain);
      },
      "Apenas emails corporativos são permitidos. Emails gratuitos (Gmail, Hotmail, etc.) não são aceitos."
    ),
    companyName: z.string().optional(),
    password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
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
  const [showWebAuthnChallenge, setShowWebAuthnChallenge] = useState(false);
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
      const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
        challenge: base64ToArrayBuffer(challengeData.challenge),
        rpId: window.location.hostname,
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
        // Check if MFA is required
        if (session.challengeName === 'SOFTWARE_TOKEN_MFA') {
          setMfaFactorId(session.session || '');
          setShowMFAChallenge(true);
          
          toast({
            title: "MFA Obrigatório",
            description: "Digite o código do seu autenticador para continuar.",
          });
          
          setIsLoading(false);
          return;
        }

        // Check for WebAuthn/FIDO2 challenge
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

        // Unknown challenge
        toast({
          variant: "destructive",
          title: "Desafio de autenticação",
          description: `Desafio não suportado: ${session.challengeName}`,
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
        
        if (error.code === 'NotAuthorizedException') {
          errorMessage = "Email ou senha incorretos. Verifique suas credenciais e tente novamente.";
        } else if (error.code === 'UserNotConfirmedException') {
          errorMessage = "Conta não confirmada. Verifique seu email para confirmar a conta.";
        } else if (error.code === 'UserNotFoundException') {
          errorMessage = "Usuário não encontrado. Verifique o email ou crie uma nova conta.";
        } else if (error.code === 'TooManyRequestsException') {
          errorMessage = "Muitas tentativas de login. Tente novamente em alguns minutos.";
        }
        
        toast({
          variant: "destructive",
          title: "Erro ao fazer login",
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
      <div className="w-full max-w-md">
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center mb-4">
            <img src={evoLogo} alt="EVO Cloud Intelligence" className="h-16" />
          </div>
          <p className="text-muted-foreground">FinOps & Security Intelligence Platform</p>
        </div>

        <Card className="glass shadow-elegant animate-scale-in">
          <CardHeader>
            <CardTitle className="text-2xl">
              {showMFAChallenge && "Verificação MFA"}
              {showWebAuthnChallenge && "Verificação WebAuthn"}
              {!showMFAChallenge && !showWebAuthnChallenge && "Bem-vindo"}
            </CardTitle>
            <CardDescription>
              {showMFAChallenge && "Digite o código de autenticação"}
              {showWebAuthnChallenge && "Aguardando autenticação com chave de segurança..."}
              {!showMFAChallenge && !showWebAuthnChallenge && activeTab === "login" && "Faça login para continuar"}
              {!showMFAChallenge && !showWebAuthnChallenge && activeTab === "signup" && "Crie sua conta corporativa"}
              {!showMFAChallenge && !showWebAuthnChallenge && activeTab === "reset" && "Recupere sua senha"}
            </CardDescription>
          </CardHeader>
          <CardContent>
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
            ) : showMFAChallenge ? (
              <form onSubmit={handleMFAVerify} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="mfa-code">Código de Autenticação</Label>
                  <Input
                    id="mfa-code"
                    type="text"
                    placeholder="000000"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    maxLength={6}
                    className="text-center text-2xl tracking-widest"
                    required
                    disabled={isLoading}
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    Digite o código do seu aplicativo autenticador
                  </p>
                </div>

                <Button type="submit" className="w-full bg-gradient-primary" disabled={isLoading || mfaCode.length !== 6}>
                  {isLoading ? "Verificando..." : "Verificar"}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  MFA está ativo na sua conta. Para desabilitar, acesse as configurações após fazer login.
                </p>
              </form>
            ) : (
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="login">Login</TabsTrigger>
                  <TabsTrigger value="signup">Cadastro</TabsTrigger>
                </TabsList>

                <TabsContent value="login" className="space-y-4">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email Corporativo</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="seu.email@empresa.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="pl-10"
                        required
                        disabled={isLoading}
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password">Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type={showLoginPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="pl-10 pr-10"
                        required
                        disabled={isLoading}
                        autoComplete="current-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                      >
                        {showLoginPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="link"
                    className="p-0 h-auto text-sm"
                    onClick={() => setActiveTab("reset")}
                  >
                    Esqueceu sua senha?
                  </Button>

                  <Button type="submit" className="w-full bg-gradient-primary" disabled={isLoading}>
                    {isLoading ? "Entrando..." : "Entrar"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="space-y-4">
                <form onSubmit={handleSignup} className="space-y-4">
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

              <TabsContent value="reset" className="space-y-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTab("login")}
                  className="mb-4"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar para login
                </Button>

                <form onSubmit={handleReset} className="space-y-4">
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

        <div className="text-center mt-6 space-y-2">
          <p className="text-sm text-muted-foreground">
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
          <p className="text-xs text-muted-foreground/60 font-mono">
            EVO UDS {getVersionString()}
          </p>
        </div>
      </div>
    </div>
  );
}