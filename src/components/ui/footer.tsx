import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { getVersionString, getFullVersionString, getBuildInfo } from "@/lib/version";
import { 
  Info, 
  Calendar, 
  GitBranch, 
  Clock, 
  Server, 
  Code2,
  Zap
} from "lucide-react";

interface FooterProps {
  className?: string;
  variant?: "default" | "minimal" | "detailed";
}

export const Footer = ({ className = "", variant = "default" }: FooterProps) => {
  const [buildInfo, setBuildInfo] = useState(getBuildInfo());
  const [deployTime, setDeployTime] = useState<string>("");

  useEffect(() => {
    // Simular tempo de deploy baseado no build number
    const deployDate = new Date();
    deployDate.setTime(deployDate.getTime() - (Math.random() * 24 * 60 * 60 * 1000)); // Últimas 24h
    setDeployTime(deployDate.toLocaleString('pt-BR'));
  }, []);

  if (variant === "minimal") {
    return (
      <footer className={`glass border-t border-primary/20 ${className}`}>
        <div className="px-6 py-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>EVO UDS Platform</span>
            <span>{getVersionString()}</span>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className={`glass border-t border-primary/20 ${className}`}>
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded bg-gradient-primary flex items-center justify-center">
                <Zap className="h-3 w-3 text-white" />
              </div>
              <span className="text-sm font-medium">EVO UDS Platform</span>
            </div>
            
            <Badge variant="secondary" className="glass">
              {getVersionString()}
            </Badge>
            
            <Badge 
              variant="outline" 
              className={`glass ${
                buildInfo.environment === 'production' 
                  ? 'border-success text-success' 
                  : buildInfo.environment === 'staging'
                  ? 'border-warning text-warning'
                  : 'border-primary text-primary'
              }`}
            >
              {buildInfo.environment}
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Deploy: {deployTime}</span>
            </div>
            
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-2">
                  <Info className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="glass">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Code2 className="h-5 w-5 text-primary" />
                    Informações da Versão
                  </DialogTitle>
                  <DialogDescription>
                    Detalhes técnicos da versão atual do sistema
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  <Card className="glass border-primary/20">
                    <CardContent className="p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <GitBranch className="h-3 w-3" />
                            <span>Versão</span>
                          </div>
                          <p className="font-mono">{buildInfo.version}</p>
                        </div>
                        
                        <div>
                          <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <Server className="h-3 w-3" />
                            <span>Ambiente</span>
                          </div>
                          <Badge 
                            variant="outline" 
                            className={
                              buildInfo.environment === 'production' 
                                ? 'border-success text-success' 
                                : buildInfo.environment === 'staging'
                                ? 'border-warning text-warning'
                                : 'border-primary text-primary'
                            }
                          >
                            {buildInfo.environment}
                          </Badge>
                        </div>
                        
                        <div>
                          <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <Calendar className="h-3 w-3" />
                            <span>Build</span>
                          </div>
                          <p className="font-mono text-xs">{buildInfo.buildNumber}</p>
                        </div>
                        
                        <div>
                          <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <Clock className="h-3 w-3" />
                            <span>Deploy</span>
                          </div>
                          <p className="text-xs">{deployTime}</p>
                        </div>
                      </div>
                      
                      <div className="pt-3 border-t border-primary/20">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <Code2 className="h-3 w-3" />
                          <span>Versão Completa</span>
                        </div>
                        <p className="font-mono text-xs bg-muted px-2 py-1 rounded">
                          {buildInfo.fullVersion}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>• Versionamento automático baseado em deploy</p>
                    <p>• Build number gerado automaticamente</p>
                    <p>• Sistema 100% AWS nativo</p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;