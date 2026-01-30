import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Key, Users, User, Mail, Calendar, RefreshCw, Trash2 } from "lucide-react";
import type { Organization, SeatAssignment, LicensesResponse } from "../types";
import { useOrganizationLicenses, useSeatAssignments, useSyncLicense, useReleaseSeat } from "../hooks/useOrganizations";
import { ReleaseSeatDialog } from "./ReleaseSeatDialog";

interface ViewLicensesDialogProps {
  organization: Organization | null;
  onClose: () => void;
}

export function ViewLicensesDialog({ organization, onClose }: ViewLicensesDialogProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'licenses' | 'seats'>('licenses');
  const [releasingSeat, setReleasingSeat] = useState<SeatAssignment | null>(null);
  const { data: licensesData, isLoading: isLoadingLicenses } = useOrganizationLicenses(organization?.id);
  const { data: seatAssignments, isLoading: isLoadingSeatAssignments, refetch: refetchSeatAssignments } = useSeatAssignments(organization?.id, activeTab === 'seats');
  const syncLicenseMutation = useSyncLicense(organization?.id);
  const releaseSeatMutation = useReleaseSeat(organization?.id, () => setReleasingSeat(null));

  const handleClose = () => { setActiveTab('licenses'); onClose(); };
  const handleReleaseSeat = () => {
    if (releasingSeat && organization) {
      releaseSeatMutation.mutate({ organizationId: organization.id, seatAssignmentId: releasingSeat.id });
    }
  };

  return (
    <>
      <Dialog open={!!organization} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              {t('organizations.licensesOf', 'Licenças de')} {organization?.name}
            </DialogTitle>
            <DialogDescription>{t('organizations.licensesDescription', 'Licenças e configurações de licenciamento desta organização')}</DialogDescription>
          </DialogHeader>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'licenses' | 'seats')} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="glass mb-4">
              <TabsTrigger value="licenses">{t('organizations.tabLicenses', 'Licenças')}</TabsTrigger>
              <TabsTrigger value="seats">{t('organizations.tabSeatAssignments', 'Atribuições de Assento')}</TabsTrigger>
            </TabsList>
            <TabsContent value="licenses" className="flex-1 overflow-auto">
              <LicensesTab licensesData={licensesData} isLoading={isLoadingLicenses} />
            </TabsContent>
            <TabsContent value="seats" className="flex-1 overflow-auto">
              <SeatsTab seatAssignments={seatAssignments} isLoading={isLoadingSeatAssignments} onRefresh={refetchSeatAssignments} onReleaseSeat={setReleasingSeat} />
            </TabsContent>
          </Tabs>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => organization && syncLicenseMutation.mutate(organization.id)} disabled={syncLicenseMutation.isPending || isLoadingLicenses} className="glass hover-glow">
              {syncLicenseMutation.isPending ? (<><RefreshCw className="h-4 w-4 mr-2 animate-spin" />{t('organizations.syncingLicense', 'Sincronizando...')}</>) : (<><RefreshCw className="h-4 w-4 mr-2" />{t('organizations.syncLicense', 'Sincronizar Licença')}</>)}
            </Button>
            <Button variant="outline" onClick={handleClose}>{t('common.close', 'Fechar')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ReleaseSeatDialog seat={releasingSeat} onClose={() => setReleasingSeat(null)} onConfirm={handleReleaseSeat} isPending={releaseSeatMutation.isPending} />
    </>
  );
}

function LicensesTab({ licensesData, isLoading }: { licensesData: LicensesResponse | null | undefined; isLoading: boolean }) {
  const { t } = useTranslation();
  if (isLoading) return <div className="space-y-3 p-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  if (!licensesData) return <div className="text-center py-8"><Key className="h-12 w-12 mx-auto mb-3 text-muted-foreground" /><p className="text-muted-foreground">{t('organizations.noLicenses', 'Nenhuma licença encontrada')}</p></div>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg bg-muted/50"><p className="text-xs text-muted-foreground">{t('organizations.totalLicenses', 'Total')}</p><p className="text-xl font-semibold">{licensesData.summary.total_licenses}</p></div>
        <div className="p-3 rounded-lg bg-green-500/10"><p className="text-xs text-muted-foreground">{t('organizations.activeLicenses', 'Ativas')}</p><p className="text-xl font-semibold text-green-600">{licensesData.summary.active_licenses}</p></div>
        <div className="p-3 rounded-lg bg-blue-500/10"><p className="text-xs text-muted-foreground">{t('organizations.totalSeats', 'Seats')}</p><p className="text-xl font-semibold text-blue-600">{licensesData.summary.total_max_users}</p></div>
        <div className="p-3 rounded-lg bg-amber-500/10"><p className="text-xs text-muted-foreground">{t('organizations.usedSeats', 'Usados')}</p><p className="text-xl font-semibold text-amber-600">{licensesData.summary.total_used_seats}</p></div>
      </div>
      {licensesData.config && (
        <div className="p-3 rounded-lg border bg-muted/30">
          <p className="text-sm font-medium mb-2">{t('organizations.licenseConfig', 'Configuração')}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div><span className="text-muted-foreground">Customer ID:</span><span className="ml-2 font-mono text-xs">{licensesData.config.customer_id}</span></div>
            <div><span className="text-muted-foreground">Auto Sync:</span><Badge variant={licensesData.config.auto_sync ? 'default' : 'secondary'} className="ml-2">{licensesData.config.auto_sync ? 'Ativo' : 'Inativo'}</Badge></div>
          </div>
        </div>
      )}
      {licensesData.licenses.length > 0 ? (
        <Table>
          <TableHeader><TableRow><TableHead>{t('organizations.licenseKey', 'Chave')}</TableHead><TableHead>{t('organizations.licensePlan', 'Plano')}</TableHead><TableHead>{t('organizations.licenseSeats', 'Seats')}</TableHead><TableHead>{t('organizations.licenseStatus', 'Status')}</TableHead></TableRow></TableHeader>
          <TableBody>
            {licensesData.licenses.map((license) => (
              <TableRow key={license.id}>
                <TableCell className="font-mono text-xs">{license.license_key.substring(0, 20)}...</TableCell>
                <TableCell>{license.plan_type}</TableCell>
                <TableCell>{license.used_seats} / {license.max_users}</TableCell>
                <TableCell><div className="flex flex-wrap gap-1">{license.is_active ? <Badge className="bg-green-500">Ativa</Badge> : <Badge variant="secondary">Inativa</Badge>}{license.is_trial && <Badge variant="outline" className="text-amber-600 border-amber-600">Trial</Badge>}{license.is_expired && <Badge variant="destructive">Expirada</Badge>}</div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : <div className="text-center py-8"><Key className="h-12 w-12 mx-auto mb-3 text-muted-foreground" /><p className="text-muted-foreground">{t('organizations.noLicenses', 'Nenhuma licença encontrada')}</p></div>}
    </div>
  );
}

function SeatsTab({ seatAssignments, isLoading, onRefresh, onReleaseSeat }: { seatAssignments: { seat_assignments: SeatAssignment[]; total: number } | null | undefined; isLoading: boolean; onRefresh: () => void; onReleaseSeat: (seat: SeatAssignment) => void; }) {
  const { t } = useTranslation();
  if (isLoading) return <div className="space-y-3 p-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  if (!seatAssignments || seatAssignments.seat_assignments.length === 0) return <div className="text-center py-8"><Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground" /><p className="text-muted-foreground">{t('organizations.noSeatAssignments', 'Nenhuma atribuição encontrada')}</p></div>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Total: {seatAssignments.total}</p>
        <Button variant="outline" size="sm" onClick={onRefresh} className="glass hover-glow"><RefreshCw className="h-4 w-4 mr-2" />{t('common.refresh', 'Atualizar')}</Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>{t('organizations.userName', 'Usuário')}</TableHead><TableHead>{t('organizations.userEmail', 'Email')}</TableHead><TableHead>{t('organizations.userRole', 'Função')}</TableHead><TableHead>{t('organizations.licensePlan', 'Licença')}</TableHead><TableHead>{t('organizations.assignedAt', 'Atribuído em')}</TableHead><TableHead className="text-right">{t('common.actions', 'Ações')}</TableHead></TableRow></TableHeader>
        <TableBody>
          {seatAssignments.seat_assignments.map((seat) => (
            <TableRow key={seat.id}>
              <TableCell className="font-medium"><div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" />{seat.user_name || t('organizations.noName', 'Sem nome')}</div></TableCell>
              <TableCell><div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{seat.user_email || '-'}</div></TableCell>
              <TableCell><Badge variant={seat.user_role === 'org_admin' || seat.user_role === 'super_admin' ? 'default' : 'secondary'}>{seat.user_role === 'org_admin' ? 'Admin' : seat.user_role === 'super_admin' ? 'Super Admin' : 'Usuário'}</Badge></TableCell>
              <TableCell><span className="text-sm font-medium">{seat.license_plan}</span></TableCell>
              <TableCell><div className="flex items-center gap-2 text-sm text-muted-foreground"><Calendar className="h-4 w-4" />{new Date(seat.assigned_at).toLocaleDateString('pt-BR')}</div></TableCell>
              <TableCell className="text-right"><TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" onClick={() => onReleaseSeat(seat)} className="text-red-600 border-red-600 hover:bg-red-50 dark:hover:bg-red-950"><Trash2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>{t('organizations.releaseSeat', 'Liberar assento')}</p></TooltipContent></Tooltip></TooltipProvider></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
