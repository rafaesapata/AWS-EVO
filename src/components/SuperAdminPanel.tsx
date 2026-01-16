import { useState, useEffect } from "react";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useToast } from "@/hooks/use-toast";
import { UserCog } from "lucide-react";
import { Badge } from "./ui/badge";

export default function SuperAdminPanel() {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [promotingUser, setPromotingUser] = useState(false);
  const [userEmailToPromote, setUserEmailToPromote] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    checkSuperAdminStatus();
  }, []);

  const checkSuperAdminStatus = async () => {
    try {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) return;

      // Get user roles via AWS API
      const roles = await apiClient.get('/user/roles');
      const rolesList = roles?.map((r: any) => r.role) || [];
      
      setIsSuperAdmin(rolesList.includes('super_admin'));
      setIsOrgAdmin(rolesList.includes('org_admin'));
    } catch (error) {
      console.error('Error checking admin status:', error);
      setIsSuperAdmin(false);
      setIsOrgAdmin(false);
    }
  };

  const handlePromoteToSuperAdmin = async () => {
    setPromotingUser(true);

    try {
      // Validate email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(userEmailToPromote)) {
        throw new Error('Email inválido');
      }

      // Call AWS API to set super admin
      await apiClient.post('/admin/promote-super-admin', {
        email: userEmailToPromote
      });

      toast({
        title: "Super Admin criado",
        description: `${userEmailToPromote} agora é super admin`,
      });

      setUserEmailToPromote('');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao promover usuário",
        description: error.message,
      });
    } finally {
      setPromotingUser(false);
    }
  };

  if (!isSuperAdmin && !isOrgAdmin) {
    return null;
  }

  return (
    <>
      <Card className="hover:bg-gray-50 border-primary/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-primary" />
              <CardTitle>{isSuperAdmin ? 'Super Admin Panel' : 'Gerenciamento de Usuários'}</CardTitle>
            </div>
            {isSuperAdmin && (
              <Badge variant="outline" className="bg-gradient-primary text-white">
                Super Admin
              </Badge>
            )}
          </div>
          <CardDescription>
            {isSuperAdmin ? 'Promova usuários a Super Admin' : 'Gerencie usuários da sua organização'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Promote to Super Admin Section - Super Admin Only */}
          {isSuperAdmin && (
            <div className="space-y-4">
            <h3 className="text-sm font-semibold">Promover a Super Admin</h3>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="promote-email">Email do Usuário</Label>
                <Input
                  id="promote-email"
                  type="email"
                  placeholder="usuario@empresa.com"
                  value={userEmailToPromote}
                  onChange={(e) => setUserEmailToPromote(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  O usuário deve já existir no sistema
                </p>
              </div>
              <Button
                onClick={handlePromoteToSuperAdmin}
                disabled={promotingUser || !userEmailToPromote}
                className="w-full"
                variant="outline"
              >
                {promotingUser ? "Promovendo..." : "Promover a Super Admin"}
              </Button>
            </div>
          </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}