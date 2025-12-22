import { useState } from "react";
import { X, ChevronRight, Sparkles, Zap, Shield, DollarSign, EyeOff, RefreshCw, FileCheck } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Progress } from "./ui/progress";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useToast } from "@/hooks/use-toast";

const ONBOARDING_STEPS = [
  {
    title: "Bem-vindo ao EVO! 🎉",
    description: "Plataforma completa de Cloud Governance, FinOps e Segurança AWS com IA. Vamos começar!",
    icon: Sparkles,
    gradient: "from-blue-500 to-cyan-500",
  },
  {
    title: "Atualização Global de Dados",
    description: "Execute scans completos de custos, segurança, compliance e performance com um clique. Acompanhe o progresso em tempo real!",
    icon: RefreshCw,
    gradient: "from-purple-500 to-pink-500",
  },
  {
    title: "Detecção de Ameaças & Anomalias",
    description: "ML detecta ameaças via GuardDuty, analisa comportamento IAM e identifica padrões anômalos de custo automaticamente.",
    icon: Shield,
    gradient: "from-orange-500 to-red-500",
  },
  {
    title: "FinOps Copilot AI",
    description: "IA generativa para otimizar custos, analisar savings plans, RIs e recomendar ações de economia com justificativas técnicas.",
    icon: Zap,
    gradient: "from-emerald-500 to-green-500",
  },
  {
    title: "Waste Detection ML",
    description: "Machine Learning identifica recursos subutilizados, rightsizing inteligente e oportunidades de economia baseado em uso real.",
    icon: DollarSign,
    gradient: "from-amber-500 to-yellow-500",
  },
  {
    title: "Compliance & Well-Architected",
    description: "Avalie conformidade com frameworks regulatórios e AWS Well-Architected Framework. Gere relatórios executivos automaticamente.",
    icon: FileCheck,
    gradient: "from-indigo-500 to-blue-500",
  },
];

interface OnboardingTourProps {
  onComplete: () => void;
}

export default function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const { toast } = useToast();

  if (!isVisible) return null;

  const currentStepData = ONBOARDING_STEPS[currentStep];
  const Icon = currentStepData.icon;
  const progress = ((currentStep + 1) / ONBOARDING_STEPS.length) * 100;

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = async () => {
    localStorage.setItem('hasSeenOnboarding', 'true');
    setIsVisible(false);
    onComplete();
  };

  const handleDontShowAgain = async () => {
    try {
      const user = await cognitoAuth.getCurrentUser();
      if (user) {
        const result = await apiClient.update('profiles', {
          show_onboarding: false
        }, { eq: { id: user.username } });

        if (result.error) throw new Error(result.error);

        toast({
          title: "Preferência salva",
          description: "O tour não será exibido novamente.",
        });
      }
      localStorage.setItem('hasSeenOnboarding', 'true');
      setIsVisible(false);
      onComplete();
    } catch (error) {
      console.error('Error saving preference:', error);
      toast({
        title: "Erro ao salvar preferência",
        description: "Tente novamente mais tarde.",
        variant: "destructive",
      });
    }
  };

  const handleComplete = () => {
    localStorage.setItem('hasSeenOnboarding', 'true');
    setIsVisible(false);
    onComplete();
    // Celebration effect
    const confetti = document.createElement('div');
    confetti.innerHTML = '🎉';
    confetti.style.cssText = 'position:fixed;top:50%;left:50%;font-size:100px;animation:ping-once 1s;pointer-events:none;z-index:9999';
    document.body.appendChild(confetti);
    setTimeout(() => confetti.remove(), 1000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-20 animate-fade-in overflow-y-auto">
      <Card className="max-w-2xl w-full shadow-glow-lg border-2 border-primary/20 animate-scale-in my-auto">
        <CardContent className="p-8">
          <div className="flex justify-between items-start mb-6">
            <div className={`p-3 rounded-2xl bg-gradient-to-br ${currentStepData.gradient} shadow-lg animate-bounce-subtle`}>
              <Icon className="h-8 w-8 text-white" />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSkip}
              className="hover:bg-destructive/10 transition-all hover:scale-110"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-cyan-500 bg-clip-text text-transparent animate-slide-up">
                {currentStepData.title}
              </h2>
              <p className="text-lg text-muted-foreground animate-fade-in">
                {currentStepData.description}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Passo {currentStep + 1} de {ONBOARDING_STEPS.length}</span>
                <span>{progress.toFixed(0)}%</span>
              </div>
              <Progress value={progress} className="h-2 transition-all duration-500" />
            </div>

            <div className="flex justify-between items-center pt-4 gap-2">
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={handleSkip}
                  className="hover:scale-105 transition-transform"
                >
                  Pular Tour
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleDontShowAgain}
                  className="hover:scale-105 transition-transform text-muted-foreground"
                >
                  <EyeOff className="mr-2 h-4 w-4" />
                  Não mostrar mais
                </Button>
              </div>
              <Button
                onClick={handleNext}
                className="bg-gradient-primary hover:shadow-glow transition-all hover:scale-105"
              >
                {currentStep === ONBOARDING_STEPS.length - 1 ? 'Começar!' : 'Próximo'}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex justify-center gap-2 mt-6">
            {ONBOARDING_STEPS.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentStep(index)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  index === currentStep
                    ? 'w-8 bg-primary shadow-glow'
                    : index < currentStep
                    ? 'w-2 bg-primary/50'
                    : 'w-2 bg-muted'
                }`}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
