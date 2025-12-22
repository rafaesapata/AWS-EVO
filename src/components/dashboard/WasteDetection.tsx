import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Database, HardDrive, Cloud, RefreshCw, Plus, Ticket, History, Clock, ArrowLeft } from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useToast } from "@/hooks/use-toast";
import { format, Locale } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";
import { InfoTooltip, tooltipContent } from "@/components/ui/info-tooltip";
import { PageHeader } from "@/components/ui/page-header";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { WasteDetectionHistory } from "./WasteDetectionHistory";
import { useOrganization } from "@/hooks/useOrganization";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { useTVDashboard } from "@/contexts/TVDashboardContext";
import { useTranslation } from "react-i18next";

const dateLocales: Record<string, Locale> = { pt: ptBR, en: enUS, es: es };

export default function WasteDetection() {
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const dateLocale = dateLocales[i18n.language] || enUS;
  const { isTVMode } = useTVDashboard();
  const [isScanning, setIsScanning] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'detection' | 'history'>('detection');
  const [viewingHistoricalScan, setViewingHistoricalScan] = useState<{
    scanId: string;
    scanData: any;
  } | null>(null);
  const itemsPerPage = 10;
  const { data: organizationId } = useOrganization();
  
  // Use global account context for multi-account isolation
  const { selectedAccountId } = useAwsAccount();
  
  const { data: wasteItems, isLoading, refetch } = useQuery<any[]>({
    queryKey: ['waste-detection', 'org', organizationId, 'account', selectedAccountId, viewingHistoricalScan?.scanId],
    // In TV mode, only require organizationId
    enabled: !!organizationId && (isTVMode || !!selectedAccountId),
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    queryFn: async () => {
      // If viewing historical scan, fetch waste items from that scan
      if (viewingHistoricalScan?.scanId) {
        // Get the scan timestamp
        const scanResponse = await apiClient.select('waste_detection_history', { 
          eq: { id: viewingHistoricalScan.scanId } 
        });
        const scanData = scanResponse.data?.[0];
        if (!scanData) return [];

        // Fetch waste items created during this scan - FILTERED BY SELECTED ACCOUNT
        const scanTime = new Date(scanData.scan_date);
        const startTime = new Date(scanTime.getTime() - 60000);
        const endTime = new Date(scanTime.getTime() + 60000);

        const wasteResponse = await apiClient.select('waste_detection', { 
          eq: { organization_id: organizationId, aws_account_id: selectedAccountId } 
        });
        if (wasteResponse.error) {
          throw wasteResponse.error;
        }
        
        return wasteResponse.data || [];
      }

      // Fetch active waste items - FILTERED BY SELECTED ACCOUNT
      const response = await apiClient.select('waste_detection', { 
        eq: { organization_id: organizationId, aws_account_id: selectedAccountId, status: 'active' } 
      });
      if (response.error) {
        throw response.error;
      }
      
      return response.data || [];
    },
  });

  const handleViewHistoricalScan = async (scanId: string) => {
    try {
      // Fetch scan data
      const response = await apiClient.select('waste_detection_history', { 
        eq: { id: scanId } 
      });
      const scanData = response.data?.[0];
      setViewingHistoricalScan({
        scanId,
        scanData
      });
      setActiveTab('detection');
    } catch (error) {
      toast({
        title: t('wasteDetection.historicalScanError'),
        description: t('wasteDetection.couldNotLoadScan'),
        variant: "destructive"
      });
    }
  };

  const handleBackToCurrentDetection = () => {
    setViewingHistoricalScan(null);
    refetch();
  };

  const getWasteIcon = (type: string) => {
    switch (type) {
      case 'unattached_volume': return HardDrive;
      case 'unused_volume': return HardDrive;
      case 'old_snapshot': return Database;
      case 'unattached_eip': return Cloud;
      case 'idle_resource': return Cloud;
      default: return Cloud;
    }
  };

  const totalWasteMonthly = wasteItems?.reduce((sum, item) => sum + item.monthly_waste_cost, 0) || 0;
  const totalWasteYearly = wasteItems?.reduce((sum, item) => sum + item.yearly_waste_cost, 0) || 0;

  // Pagination
  const totalPages = Math.ceil((wasteItems?.length || 0) / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedItems = wasteItems?.slice(startIndex, endIndex) || [];

  const scanForWaste = async () => {
    if (!selectedAccountId) {
      toast({
        title: t('wasteDetection.noAccount'),
        description: t('wasteDetection.selectAccount'),
        variant: "destructive",
      });
      return;
    }

    setIsScanning(true);
    try {
      toast({
        title: t('wasteDetection.startingScan'),
        description: t('wasteDetection.scanningResources'),
      });

      // Call waste detection edge function with account context
      const data = await apiClient.lambda('waste-detection', {
        body: { accountId: selectedAccountId }
      });

      

      // Invalidate and refetch both queries
      await queryClient.invalidateQueries({ queryKey: ['waste-detection'] });
      await queryClient.invalidateQueries({ queryKey: ['waste-detection-history'] });
      
      toast({
        title: t('wasteDetection.scanComplete'),
        description: t('wasteDetection.scanResults', { count: data.waste_count, amount: data.total_yearly_waste?.toFixed(2) }),
      });
    } catch (error: any) {
      toast({
        title: t('wasteDetection.scanError'),
        description: error.message || t('common.unknown'),
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const createTicket = async (wasteId: string, wasteItem: any) => {
    try {
      const user = await cognitoAuth.getCurrentUser();
      const { data: profile } = await apiClient.get('/profiles', { id: user?.id }).single();
      
      const ticketData = {
        organization_id: profile?.organization_id,
        title: `Desperdício detectado: ${wasteItem.resource_name || wasteItem.resource_id}`,
        description: wasteItem.recommendations || 'Recurso identificado como desperdício',
        priority: wasteItem.monthly_waste_cost > 100 ? 'high' : 'medium',
        ticket_type: 'cost_optimization',
        status: 'pending'
      };
      
      const ticketResponse = await apiClient.insert('tickets', ticketData);
      if (ticketResponse.error) throw ticketResponse.error;
      const ticket = ticketResponse.data;
      
      // Link ticket to waste detection
      const linkResponse = await apiClient.update('waste_detection', 
        { ticket_id: ticket.id }, 
        { id: wasteId }
      );
      // Silently handle link error - ticket was created successfully

      toast({
        title: t('wasteDetection.ticketCreated'),
        description: t('wasteDetection.ticketCreatedDesc', { id: ticket.id.substring(0, 8) }),
      });

      refetch();
    } catch (error: any) {
      toast({
        title: t('wasteDetection.ticketError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const createBulkTickets = async () => {
    if (selectedItems.size === 0) {
      toast({
        title: t('wasteDetection.noItemsSelected'),
        description: t('wasteDetection.selectAtLeastOne'),
        variant: "destructive",
      });
      return;
    }

    try {
      const selectedWaste = wasteItems?.filter(w => selectedItems.has(w.id)) || [];
      
      for (const waste of selectedWaste) {
        const hasTicket = (waste as any).ticket_id;
        if (!hasTicket) {
          await createTicket(waste.id, waste);
        }
      }

      toast({
        title: t('wasteDetection.ticketsCreated'),
        description: t('wasteDetection.ticketsCreatedDesc', { count: selectedItems.size }),
      });

      setSelectedItems(new Set());
    } catch (error: any) {
      toast({
        title: t('wasteDetection.ticketError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedItems);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedItems(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === wasteItems?.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(wasteItems?.map(w => w.id) || []));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center mb-4">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-48" />
        </div>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="border rounded-lg p-4">
                  <Skeleton className="h-20 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <PageHeader
        title={t('wasteDetection.title')}
        description={t('wasteDetection.description')}
        icon={Trash2}
      >
        <InfoTooltip title="Como funciona a detecção?">
          {tooltipContent.wasteDetection}
        </InfoTooltip>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'detection' | 'history')} className="w-full space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="detection">{t('wasteDetection.currentDetection')}</TabsTrigger>
          <TabsTrigger value="history">{t('wasteDetection.history')}</TabsTrigger>
        </TabsList>

        <TabsContent value="detection" className="space-y-6">
          {/* Historical Scan Badge */}
          {viewingHistoricalScan && (
            <div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-semibold text-primary">{t('wasteDetection.viewingHistoricalScan')}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(viewingHistoricalScan.scanData.scan_date), "PPPp", { locale: dateLocale })}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBackToCurrentDetection}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('wasteDetection.backToCurrent')}
              </Button>
            </div>
          )}

          <div className="flex justify-between items-center mb-4">
        <div className="flex gap-2">
          {selectedItems.size > 0 && (
            <Button onClick={createBulkTickets} size="sm" variant="secondary">
              <Plus className="h-4 w-4 mr-2" />
              {t('wasteDetection.createTickets', { count: selectedItems.size })}
            </Button>
          )}
        </div>
        {!viewingHistoricalScan && (
          <Button onClick={scanForWaste} disabled={isScanning} size="sm">
            {isScanning ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                {t('wasteDetection.runningScan')}
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                {t('wasteDetection.runScan')}
              </>
            )}
          </Button>
        )}
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('wasteDetection.wastedResources')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{wasteItems?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('wasteDetection.monthlyWaste')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">${totalWasteMonthly.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('wasteDetection.yearlyWaste')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">${totalWasteYearly.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('wasteDetection.autoRemediable')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">
              {wasteItems?.filter(w => w.auto_remediation_available).length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              {t('wasteDetection.idleOrphaned')}
            </CardTitle>
            {wasteItems && wasteItems.length > 0 && (
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedItems.size === wasteItems.length}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-sm text-muted-foreground">{t('wasteDetection.selectAll')}</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {paginatedItems.map((waste) => {
              const Icon = getWasteIcon(waste.waste_type);
              const hasTicket = waste.ticket_id;
              return (
                <div key={waste.id} className="border rounded-lg p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <Checkbox
                      checked={selectedItems.has(waste.id)}
                      onCheckedChange={() => toggleSelection(waste.id)}
                      className="mt-1"
                    />
                    <div className="flex items-start justify-between flex-1">
                      <div className="flex items-start gap-3">
                        <Icon className="h-5 w-5 text-primary mt-1" />
                        <div>
                          <div className="font-semibold">{waste.resource_name || 'N/A'}</div>
                          <div className="font-mono text-xs bg-muted px-2 py-1 rounded mt-1 inline-block">
                            {waste.resource_id}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {waste.resource_type} • {waste.region}
                          </div>
                          {hasTicket && (
                            <div className="flex items-center gap-2 mt-2">
                              <Ticket className="h-4 w-4 text-primary" />
                              <Badge variant="outline" className="text-xs">
                                {t('wasteDetection.ticketExists')}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                      <Badge variant="destructive">{waste.waste_type.replace('_', ' ')}</Badge>
                    </div>
                  </div>

                  <div className="bg-muted/50 rounded p-3 mb-3 ml-10">
                    <div className="text-sm mb-2">{waste.recommendations}</div>
                    {waste.utilization_metrics && (
                      <div className="text-xs text-muted-foreground">
                        Métricas: {JSON.stringify(waste.utilization_metrics)}
                      </div>
                    )}
                    {waste.confidence_score && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Confiança: {waste.confidence_score.toFixed(0)}%
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between ml-10">
                    <div className="flex gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground">Desperdício Mensal</div>
                        <div className="text-lg font-semibold text-destructive">${waste.monthly_waste_cost.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Desperdício Anual</div>
                        <div className="text-lg font-semibold text-destructive">${waste.yearly_waste_cost.toFixed(2)}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {waste.auto_remediation_available && (
                        <Button size="sm" variant="default">Auto-Remediar</Button>
                      )}
                      {!hasTicket && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => createTicket(waste.id, waste)}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Criar Ticket
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {!wasteItems?.length && (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum desperdício detectado! Sua infraestrutura está otimizada.
              </div>
            )}
          </div>

          {/* Pagination */}
          {wasteItems && wasteItems.length > itemsPerPage && (
            <div className="mt-6 flex justify-center border-t pt-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (currentPage > 1) setCurrentPage(currentPage - 1);
                      }}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                    if (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    ) {
                      return (
                        <PaginationItem key={page}>
                          <PaginationLink
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              setCurrentPage(page);
                            }}
                            isActive={currentPage === page}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    } else if (page === currentPage - 2 || page === currentPage + 2) {
                      return (
                        <PaginationItem key={page}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      );
                    }
                    return null;
                  })}

                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                      }}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="history">
          {organizationId && (
            <WasteDetectionHistory 
              organizationId={organizationId}
              onViewScan={handleViewHistoricalScan}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
