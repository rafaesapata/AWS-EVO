import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, AlertCircle, Smartphone } from "lucide-react";
import evoLogo from "@/assets/logo.png";

interface MFAVerifyProps {
  email: string;
  mfaFactors: Array<{
    id: string;
    type: string;
    name: string;
    status: string;
  }>;
  onMFAVerified: () => void;
  onBackToLogin: () => void;
  onVerifyMFA: (factorId: string, code: string) => Promise<boolean>;
  isLoading: boolean;
  error?: string;
}

export default function MFAVerify({
  email,
  mfaFactors,
  onMFAVerified,
  onBackToLogin,
  onVerifyMFA,
  isLoading,
  error
}: MFAVerifyProps) {
  const [code, setCode] = useState("");
  const [selectedFactor, setSelectedFactor] = useState(mfaFactors[0]?.id || "");
  const [verifying, setVerifying] = useState(false);
  const [localError, setLocalError] = useState("");

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedFactor || !code) {
      setLocalError("Por favor, selecione um método MFA e insira o código");
      return;
    }
    
    if (code.length !== 6) {
      setLocalError("O código deve ter 6 dígitos");
      return;
    }
    
    setVerifying(true);
    setLocalError("");
    
    try {
      const success = await onVerifyMFA(selectedFactor, code);
      if (success) {
        onMFAVerified();
      } else {
        setLocalError("Código inválido. Tente novamente.");
        setCode("");
      }
    } catch (error) {
      setLocalError("Erro ao verificar código MFA. Tente novamente.");
      setCode("");
    } finally {
      setVerifying(false);
    }
  };

  const selectedFactorData = mfaFactors.find(f => f.id === selectedFactor);

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

        {/* MFA Verification Card */}
        <Card className="shadow-2xl border-0 bg-white/95 backdrop-blur-sm">
          <CardHeader className="space-y-1 pb-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle className="text-2xl font-semibold text-gray-800">Verificação MFA</CardTitle>
            </div>
            <CardDescription className="text-gray-500">
              Insira o código do seu aplicativo autenticador
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Alert className="border-blue-500/50 bg-blue-500/10">
              <Smartphone className="h-4 w-4 text-blue-500" />
              <AlertDescription className="text-blue-500">
                <strong>MFA obrigatório:</strong> Você possui autenticação multi-fator habilitada. Por motivos de segurança, é obrigatório verificar sua identidade.
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

            <form onSubmit={handleVerify} className="space-y-5">
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Usuário: <strong>{email}</strong>
                </p>
                
                {mfaFactors.length > 1 && (
                  <div className="space-y-2">
                    <Label htmlFor="factor" className="text-gray-700 font-medium">Método MFA</Label>
                    <select
                      id="factor"
                      value={selectedFactor}
                      onChange={(e) => setSelectedFactor(e.target.value)}
                      disabled={isLoading || verifying}
                      className="w-full h-11 px-3 border border-gray-200 rounded-md focus:border-blue-500 focus:ring-blue-500/20 transition-all duration-200"
                    >
                      {mfaFactors.map((factor) => (
                        <option key={factor.id} value={factor.id}>
                          {factor.name} ({factor.type.toUpperCase()})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="code" className="text-gray-700 font-medium">
                  Código de 6 dígitos
                </Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setCode(value);
                    setLocalError("");
                  }}
                  required
                  disabled={isLoading || verifying}
                  className="h-11 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 transition-all duration-200 text-center text-lg font-mono tracking-widest"
                  maxLength={6}
                  autoComplete="one-time-code"
                />
                <p className="text-xs text-muted-foreground text-center">
                  Abra seu aplicativo autenticador ({selectedFactorData?.name || 'Authenticator'}) e insira o código de 6 dígitos
                </p>
              </div>

              <Button 
                type="submit" 
                className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300 transform hover:scale-[1.02]" 
                disabled={isLoading || verifying || code.length !== 6}
              >
                {verifying ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Verificando...
                  </span>
                ) : "Verificar Código"}
              </Button>

              <Button 
                type="button"
                variant="outline" 
                onClick={onBackToLogin}
                disabled={isLoading || verifying}
                className="w-full"
              >
                Voltar ao Login
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}