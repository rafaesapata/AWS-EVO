import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Shield, AlertTriangle, CheckCircle2, XCircle, RefreshCw, Plus, Ticket } from "lucide-react";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useOrganizationId } from "@/hooks/useOrganizationId";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface WAFValidation {
  id: string;
  resource_id: string;
  resource_type: string;
  resource_name: string | null;
  is_public: boolean;
  has_waf: boolean;
  waf_name: string | null;
  security_groups: any;
  sg_properly_configured: boolean;
  sg_issues: any;
  risk_level: string;
  recommendations: string;
  created_at: string;
  ticket_id?: string;
  remediation_tickets?: {
    id: string;
    title: string;
    status: string;
  };
}

export default function WAFSecurityValidation() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const organizationId = useOrganizationId();
  const [validations, setValidations] = useState<WAFValidation[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedValidations, setSelectedValidations] = useState<string[]>([]);
  const [creatingTickets, setCreatingTickets] = useState(false);

  useEffect(() => {
    if (organizationId) {
      loadValidations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const loadValidations = async () => {
    if (!organizationId) return;
    
    setLoading(true);
    try {
      // AWS API call for WAF security validation
      const result = await apiClient.select('waf_security_validations', {
        eq: { organization_id: organizationId },
        order: { column: 'created_at', ascending: false }
      });

      if (result.error) throw result.error;
      setValidations(result.data || []);
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const runValidation = async () => {
    setScanning(true);
    try {
      // Get user's organization_id
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error("Usuário não autenticado");

      const profileResponse = await apiClient.get('/profiles', { id: user.user?.id }).single();
      const profile = profileResponse.data;
      if (!profile?.organization_id) throw new Error("Organization not found");

      // Get or create a scan
      const scanResponse = await apiClient.insert('security_scans', {
        organization_id: profile.organization_id,
        scan_type: 'waf_validation',
        status: 'running'
      });
      if (scanResponse.error) throw scanResponse.error;
      const scanData = scanResponse.data;

      // Call edge function to validate WAF and Security Groups
      const validationData = await apiClient.lambda('validate-waf-security', {
        body: { scanId: scanData.id }
      });

      if (validationData.error) throw validationData.error;
      const data = validationData;

      // Update scan status
      await apiClient.update('security_scans', { status: 'completed' }, { id: scanData.id });

      if (data.validations === 0) {
        toast({
          title: "Nenhum recurso encontrado",
          description: "A validação não encontrou recursos públicos. Execute o Global System Updater primeiro para sincronizar seus recursos AWS.",
          variant: "default"
        });
      } else {
        toast({
          title: t('common.success'),
          description: `Validation completed: ${data.validations} resources checked, ${data.critical} critical issues found`
        });
      }

      await loadValidations();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setScanning(false);
    }
  };

  const handleCreateTickets = async () => {
    if (selectedValidations.length === 0) {
      toast({
        title: "Nenhum item selecionado",
        description: "Selecione pelo menos um item para criar tickets",
        variant: "destructive"
      });
      return;
    }

    setCreatingTickets(true);
    try {
      const user = await cognitoAuth.getCurrentUser();
      const { data: profile } = await apiClient.get('/profiles', { id: user?.id }).single();
      
      const ticketsToCreate = validations
        .filter(v => selectedValidations.includes(v.id) && !v.ticket_id)
        .map(v => ({
          organization_id: profile?.organization_id,
          title: `WAF/SG Issue: ${v.resource_name || v.resource_id}`,
          description: `${v.resource_type} - Risk: ${v.risk_level}\n\nRecommendations:\n${v.recommendations}`,
          ticket_type: 'security',
          priority: v.risk_level === 'critical' ? 'critical' : v.risk_level === 'high' ? 'high' : 'medium',
          status: 'pending'
        }));

      const ticketResponse = await apiClient.insert('tickets', ticketsToCreate);
      if (ticketResponse.error) throw ticketResponse.error;
      const tickets = ticketResponse.data;

      // Update validations with ticket IDs
      for (let i = 0; i < tickets.length; i++) {
        const validation = validations.filter(v => selectedValidations.includes(v.id) && !v.ticket_id)[i];
        await apiClient.update('waf_security_validations', { ticket_id: tickets[i].id }, { id: validation.id });
      }

      toast({
        title: "Tickets criados",
        description: `${tickets.length} ticket(s) de remediação criados com sucesso`
      });

      setSelectedValidations([]);
      await loadValidations();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setCreatingTickets(false);
    }
  };

  const handleToggleValidation = (id: string) => {
    setSelectedValidations(prev => 
      prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
    );
  };

  const handleToggleAll = () => {
    const unticketedValidations = validations.filter(v => !v.ticket_id);
    if (selectedValidations.length === unticketedValidations.length) {
      setSelectedValidations([]);
    } else {
      setSelectedValidations(unticketedValidations.map(v => v.id));
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  const criticalCount = validations.filter(v => v.risk_level === 'critical').length;
  const highCount = validations.filter(v => v.risk_level === 'high').length;
  const protectedCount = validations.filter(v => v.has_waf && v.sg_properly_configured).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              WAF & Security Group Validation
            </CardTitle>
            <CardDescription>
              Ensures all public resources have WAF protection and properly configured Security Groups
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={handleCreateTickets} 
              disabled={creatingTickets || selectedValidations.length === 0}
              variant="outline"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Criar Ticket{selectedValidations.length > 0 && `s (${selectedValidations.length})`}
            </Button>
            <Button onClick={runValidation} disabled={scanning} size="sm">
              {scanning ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Shield className="h-4 w-4 mr-2" />
                  Validate
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground mb-1">Total Public</div>
                <div className="text-2xl font-bold">{validations.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground mb-1">Critical Issues</div>
                <div className="text-2xl font-bold text-red-600">{criticalCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground mb-1">High Risk</div>
                <div className="text-2xl font-bold text-orange-600">{highCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground mb-1">Protected</div>
                <div className="text-2xl font-bold text-green-600">{protectedCount}</div>
              </CardContent>
            </Card>
          </div>

          {/* Validations Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedValidations.length === validations.filter(v => !v.ticket_id).length && validations.filter(v => !v.ticket_id).length > 0}
                      onCheckedChange={handleToggleAll}
                    />
                  </TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Resource ID / ARN</TableHead>
                  <TableHead>WAF Status</TableHead>
                  <TableHead>Security Group</TableHead>
                  <TableHead>Risk Level</TableHead>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Recommendations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {validations.map((validation) => (
                  <TableRow key={validation.id}>
                    <TableCell>
                      {!validation.ticket_id && (
                        <Checkbox
                          checked={selectedValidations.includes(validation.id)}
                          onCheckedChange={() => handleToggleValidation(validation.id)}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{validation.resource_name || 'N/A'}</div>
                      <div className="text-xs text-muted-foreground">{validation.resource_type}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-xs max-w-[250px]">
                        <div className="truncate" title={validation.resource_id}>
                          {validation.resource_id}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {validation.has_waf ? (
                        <div className="flex items-center gap-2 text-green-600">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="text-sm">Protected</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-red-600">
                          <XCircle className="h-4 w-4" />
                          <span className="text-sm">No WAF</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {validation.sg_properly_configured ? (
                        <div className="flex items-center gap-2 text-green-600">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="text-sm">Configured</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-red-600">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="text-sm">Issues Found</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getRiskColor(validation.risk_level)}>
                        {validation.risk_level.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {validation.ticket_id && validation.remediation_tickets ? (
                        <div className="flex items-center gap-2">
                          <Ticket className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-sm font-medium">{validation.remediation_tickets.title}</div>
                            <Badge variant="outline" className="text-xs">
                              {validation.remediation_tickets.status}
                            </Badge>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sem ticket</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <div className="text-sm text-muted-foreground">
                        {validation.recommendations.split('\n').slice(0, 2).join('; ')}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {validations.length === 0 && !loading && (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No validations yet. Click "Validate" to check your public resources.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}