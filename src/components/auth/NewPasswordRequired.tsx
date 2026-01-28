import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Lock, CheckCircle, AlertCircle } from "lucide-react";
import evoLogo from "@/assets/logo.png";

interface NewPasswordRequiredProps {
  email: string;
  session: string;
  onPasswordSet: (session: string, newPassword: string) => Promise<boolean>;
  onBackToLogin: () => void;
  isLoading: boolean;
  error?: string;
}

export default function NewPasswordRequired({ 
  email, 
  session, 
  onPasswordSet, 
  onBackToLogin, 
  isLoading, 
  error 
}: NewPasswordRequiredProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState("");

  const isValidPassword = (password: string) => {
    const minLength = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    
    return minLength && hasUpper && hasLower && hasNumber && hasSpecial;
  };

  const getPasswordRequirements = (password: string) => {
    return [
      { text: "Pelo menos 8 caracteres", met: password.length >= 8 },
      { text: "Uma letra maiúscula", met: /[A-Z]/.test(password) },
      { text: "Uma letra minúscula", met: /[a-z]/.test(password) },
      { text: "Um número", met: /\d/.test(password) },
      { text: "Um caractere especial", met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) }
    ];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");

    if (!newPassword || !isValidPassword(newPassword)) {
      setLocalError("A senha não atende aos requisitos de segurança");
      return;
    }

    if (newPassword !== confirmPassword) {
      setLocalError("As senhas não coincidem");
      return;
    }

    const success = await onPasswordSet(session, newPassword);
    if (!success) {
      // Error will be handled by parent component
    }
  };

  const passwordRequirements = getPasswordRequirements(newPassword);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
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

        {/* New Password Card */}
        <Card className="shadow-2xl border-0 bg-white/95 backdrop-blur-sm">
          <CardHeader className="space-y-1 pb-4">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              <CardTitle className="text-2xl font-semibold text-gray-800">Nova Senha Obrigatória</CardTitle>
            </div>
            <CardDescription className="text-gray-500">
              É necessário definir uma nova senha para continuar
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-5">
            <Alert className="border-blue-500/50 bg-blue-500/10">
              <CheckCircle className="h-4 w-4 text-blue-500" />
              <AlertDescription className="text-blue-700">
                <strong>Usuário:</strong> {email}
                <br />
                Por motivos de segurança, você deve definir uma nova senha.
              </AlertDescription>
            </Alert>

            {(error || localError) && (
              <Alert className="border-red-500/50 bg-red-500/10">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <AlertDescription className="text-red-500">
                  {error || localError}
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-gray-700 font-medium">Nova Senha</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="h-11 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 transition-all duration-200"
                />
                
                {newPassword && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-gray-600 font-medium">Requisitos da senha:</p>
                    {passwordRequirements.map((req, index) => (
                      <div key={index} className="flex items-center gap-2 text-xs">
                        <div className={`w-2 h-2 rounded-full ${req.met ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <span className={req.met ? 'text-green-600' : 'text-gray-500'}>{req.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-gray-700 font-medium">Confirmar Nova Senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="h-11 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 transition-all duration-200"
                />
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-red-500">As senhas não coincidem</p>
                )}
              </div>

              <Button 
                type="submit" 
                className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300 transform hover:scale-[1.02]" 
                disabled={isLoading || !isValidPassword(newPassword) || newPassword !== confirmPassword}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Definindo senha...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Definir Nova Senha
                  </span>
                )}
              </Button>
            </form>

            <div className="flex items-center justify-center pt-2">
              <Button 
                variant="ghost" 
                onClick={onBackToLogin}
                disabled={isLoading}
                className="text-gray-600 hover:text-gray-800 flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar ao Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}