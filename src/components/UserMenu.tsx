import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Separator } from "./ui/separator";
import { LogOut, User, Settings, Mail, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import UserSettings from "./UserSettings";
import ChangePasswordSection from "./ChangePasswordSection";
import VersionInfo from "./VersionInfo";

interface Profile {
  full_name: string;
  email: string;
  avatar_url?: string;
}

function ProfileInfoCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="glass rounded-xl p-4 border border-primary/10">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 bg-[#003C7D]/10 rounded-lg">
          <Icon className="h-3.5 w-3.5 text-[#003C7D]" />
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-sm font-medium text-foreground truncate">{value}</p>
    </div>
  );
}

export default function UserMenu() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) return;

      // Use Cognito user data directly - profile data is in the token
      setProfile({
        full_name: user.name || user.attributes?.name || 'User',
        email: user.email,
        avatar_url: undefined
      });
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await cognitoAuth.signOut();
      
      toast({
        title: t('userMenu.logoutSuccess'),
        description: t('userMenu.goodbye'),
      });

      navigate('/auth');
    } catch (error) {
      toast({
        variant: "destructive",
        title: t('userMenu.logoutError'),
        description: error instanceof Error ? error.message : 'Logout failed',
      });
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  if (!profile) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-gradient-primary text-white">
              {getInitials(profile.full_name)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{profile.full_name}</p>
            <p className="text-xs text-muted-foreground">{profile.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setShowProfile(true)}>
          <User className="mr-2 h-4 w-4" />
          {t('userMenu.myProfile')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setShowSettings(true)}>
          <Settings className="mr-2 h-4 w-4" />
          {t('userMenu.settings')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          {t('userMenu.logout')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5">
          <VersionInfo />
        </div>
      </DropdownMenuContent>

      {/* Profile Dialog */}
      <Dialog open={showProfile} onOpenChange={setShowProfile}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto p-0 gap-0 glass border-primary/20">
          {/* Hero Header */}
          <div className="relative overflow-hidden rounded-t-lg">
            <div className="absolute inset-0 bg-gradient-to-br from-[#003C7D] via-[#0055A4] to-[#008CFF]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15)_0%,_transparent_60%)]" />
            <div className="relative px-6 pt-8 pb-6 flex items-center gap-5">
              <Avatar className="h-16 w-16 ring-2 ring-white/30 shadow-lg">
                <AvatarFallback className="bg-white/20 text-white text-xl font-light backdrop-blur-sm">
                  {getInitials(profile.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-light text-white truncate">{profile.full_name}</h2>
                <div className="flex items-center gap-1.5 mt-1">
                  <Mail className="h-3 w-3 text-white/70" />
                  <span className="text-sm text-white/80">{profile.email}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Info Cards */}
            <div className="grid grid-cols-2 gap-4">
              <ProfileInfoCard icon={User} label={t('userMenu.fullName')} value={profile.full_name} />
              <ProfileInfoCard icon={Mail} label={t('userMenu.email')} value={profile.email} />
            </div>

            <Separator className="bg-border/50" />

            {/* Security Section Header */}
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-[#003C7D]/10 rounded-xl">
                <Shield className="h-4 w-4 text-[#003C7D]" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground">{t('userMenu.securitySection', 'Segurança')}</h3>
                <p className="text-xs text-muted-foreground">{t('userMenu.securityDesc', 'Gerencie sua senha de acesso')}</p>
              </div>
            </div>

            <ChangePasswordSection />
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('userMenu.settings')}</DialogTitle>
          </DialogHeader>
          <UserSettings />
        </DialogContent>
      </Dialog>
    </DropdownMenu>
  );
}
