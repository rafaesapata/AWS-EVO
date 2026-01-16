import { Link } from "react-router-dom";
import { Home, Search, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import evoLogo from "@/assets/evo-logo.png";

const NotFound = () => {
  return (
    <div className="min-h-screen animated-gradient flex items-center justify-center p-4">
      <Card className="max-w-lg w-full animate-scale-in">
        <CardContent className="p-8 text-center">
          <div className="mb-6">
            <img src={evoLogo} alt="EVO Cloud Intelligence" className="h-20 mx-auto mb-4" />
          </div>
          
          <div className="mb-6">
            <AlertTriangle className="h-16 w-16 text-primary mx-auto mb-4 animate-pulse" />
            <h1 className="text-6xl font-semibold text-primary mb-2">404</h1>
            <h2 className="text-2xl font-semibold mb-2">Página Não Encontrada</h2>
            <p className="text-muted-foreground">
              A página que você está procurando não existe ou foi movida.
            </p>
          </div>

          <div className="space-y-3">
            <Button asChild className="w-full">
              <Link to="/app">
                <Home className="mr-2 h-4 w-4" />
                Voltar ao Dashboard
              </Link>
            </Button>
            
            <Button asChild variant="outline" className="w-full">
              <Link to="/auth">
                <Search className="mr-2 h-4 w-4" />
                Ir para Login
              </Link>
            </Button>
          </div>

          <div className="mt-6 text-sm text-muted-foreground">
            <p>Se você acredita que isso é um erro, entre em contato com o suporte.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default NotFound;
