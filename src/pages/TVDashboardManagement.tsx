import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/integrations/aws/api-client";
import { useOrganization } from "@/hooks/useOrganization";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tv, Plus, Copy, Trash2, ExternalLink, Clock, Calendar, RefreshCw } from "lucide-react";
import { format } from "date-fns";

interface TVToken {
  id: string;
  token: string;
  is_active: boolean;
  expires_at: string;
  created_at: string;
}

export default function TVDashboardManagement() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: organizationId } = useOrganization();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [expirationDays, setExpirationDays] = useState("30");

  const { data: tokens, isLoading } = useQuery({
    queryKey: ['tv-tokens', organizationId],
    queryFn: async () => {
      const result = await apiClient.invoke('manage-tv-tokens', {
        body: { action: 'list' }
      }) as { data?: { tokens?: TVToken[] }; error?: unknown };
      if (result.error) {
        throw new Error('Failed to load tokens');
      }
      return result.data?.tokens || [];
    },
    enabled: !!organizationId
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; expirationDays: number }) => {
      const result = await apiClient.invoke('manage-tv-tokens', {
        body: { action: 'create', name: data.name, expirationDays: data.expirationDays }
      });
      const responseData = result.data as { success?: boolean; error?: string };
      if (result.error || !responseData?.success) {
        throw new Error(responseData?.error || 'Failed to create token');
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tv-tokens'] });
      setIsCreateOpen(false);
      setNewTokenName("");
      toast({ title: t('tvDashboard.tokenCreated'), description: t('tvDashboard.tokenCreatedDesc') });
    },
    onError: (err: Error) => {
      toast({ title: t('common.error'), description: err.message, variant: "destructive" });
    }
  });

  const toggleMutation = useMutation({
    mutationFn: async (data: { tokenId: string; isActive: boolean }) => {
      const result = await apiClient.invoke('manage-tv-tokens', {
        body: { action: 'toggle', tokenId: data.tokenId, isActive: data.isActive }
      });
      const responseData = result.data as { success?: boolean; error?: string };
      if (result.error || !responseData?.success) {
        throw new Error(responseData?.error || 'Failed to update token');
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tv-tokens'] });
      toast({ title: t('tvDashboard.tokenUpdated') });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (tokenId: string) => {
      const result = await apiClient.invoke('manage-tv-tokens', {
        body: { action: 'delete', tokenId }
      });
      const responseData = result.data as { success?: boolean; error?: string };
      if (result.error || !responseData?.success) {
        throw new Error(responseData?.error || 'Failed to delete token');
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tv-tokens'] });
      toast({ title: t('tvDashboard.tokenDeleted') });
    }
  });

  const copyToClipboard = (token: string) => {
    const url = `${window.location.origin}/tv/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: t('tvDashboard.linkCopied'), description: url });
  };

  const openInNewTab = (token: string) => {
    window.open(`/tv/${token}`, '_blank');
  };

  const handleCreate = () => {
    if (!newTokenName.trim()) {
      toast({ title: t('common.error'), description: t('tvDashboard.nameRequired'), variant: "destructive" });
      return;
    }
    createMutation.mutate({ name: newTokenName, expirationDays: parseInt(expirationDays) });
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  return (
    <Layout
      title={t('tvDashboard.management', 'TV Dashboard Management')}
      description={t('tvDashboard.managementDesc', 'Manage TV dashboard access tokens')}
      icon={<Tv className="h-4 w-4 text-white" />}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-end">
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="glass hover-glow"><Plus className="h-4 w-4 mr-2" />{t('tvDashboard.createToken')}</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('tvDashboard.createNewToken')}</DialogTitle>
              <DialogDescription>{t('tvDashboard.createTokenDesc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('tvDashboard.tokenName')}</Label>
                <Input id="name" placeholder={t('tvDashboard.tokenNamePlaceholder')} value={newTokenName} onChange={(e) => setNewTokenName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('tvDashboard.expiration')}</Label>
                <Select value={expirationDays} onValueChange={setExpirationDays}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 {t('common.days')}</SelectItem>
                    <SelectItem value="30">30 {t('common.days')}</SelectItem>
                    <SelectItem value="90">90 {t('common.days')}</SelectItem>
                    <SelectItem value="365">1 {t('common.year')}</SelectItem>
                    <SelectItem value="3650">10 {t('common.years')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>{t('common.cancel')}</Button>
              <Button className="glass hover-glow" onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                {t('common.create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="glass border-primary/20 animate-pulse">
              <CardHeader><div className="h-4 bg-muted rounded w-3/4" /></CardHeader>
              <CardContent><div className="h-20 bg-muted rounded" /></CardContent>
            </Card>
          ))}
        </div>
      ) : tokens?.length === 0 ? (
        <Card className="glass border-primary/20 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Tv className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('tvDashboard.noTokens')}</h3>
            <p className="text-muted-foreground text-center mb-4">{t('tvDashboard.noTokensDesc')}</p>
            <Button className="glass hover-glow" onClick={() => setIsCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />{t('tvDashboard.createFirstToken')}</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {tokens?.map((token: TVToken) => (
            <Card key={token.id} className={`glass border-primary/20 ${!token.is_active || isExpired(token.expires_at) ? "opacity-60" : ""}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base truncate">{token.token.substring(0, 8)}...</CardTitle>
                  <div className="flex items-center gap-2">
                    {isExpired(token.expires_at) ? (
                      <Badge variant="destructive">{t('tvDashboard.expired')}</Badge>
                    ) : token.is_active ? (
                      <Badge variant="default" className="bg-green-500">{t('tvDashboard.active')}</Badge>
                    ) : (
                      <Badge variant="secondary">{t('tvDashboard.inactive')}</Badge>
                    )}
                  </div>
                </div>
                <CardDescription className="flex items-center gap-1 text-xs">
                  <Calendar className="h-3 w-3" />
                  {t('tvDashboard.createdAt')}: {format(new Date(token.created_at), 'dd/MM/yyyy HH:mm')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className={isExpired(token.expires_at) ? "text-destructive" : ""}>
                    {t('tvDashboard.expiresAt')}: {format(new Date(token.expires_at), 'dd/MM/yyyy HH:mm')}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch checked={token.is_active} onCheckedChange={(checked) => toggleMutation.mutate({ tokenId: token.id, isActive: checked })} disabled={isExpired(token.expires_at)} />
                    <span className="text-sm">{token.is_active ? t('tvDashboard.enabled') : t('tvDashboard.disabled')}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 glass hover-glow" onClick={() => copyToClipboard(token.token)}>
                    <Copy className="h-4 w-4 mr-1" />{t('tvDashboard.copyLink')}
                  </Button>
                  <Button variant="outline" size="sm" className="glass hover-glow" onClick={() => openInNewTab(token.token)}>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" className="glass hover-glow text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(token.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>
    </Layout>
  );
}
