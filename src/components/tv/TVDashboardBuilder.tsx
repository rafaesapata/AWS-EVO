import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Tv, Plus, Trash2, Copy, ExternalLink, RefreshCw, Eye } from "lucide-react";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useOrganization } from "@/hooks/useOrganization";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

interface TVDashboard {
  id: string;
  name: string;
  description: string | null;
  layout: any[];
  refresh_interval: number;
  access_token: string;
  is_active: boolean;
  created_at: string;
  last_accessed_at: string | null;
}

const AVAILABLE_WIDGETS = [
  { id: 'executive', name: 'Executive Dashboard', icon: '📊' },
  { id: 'security-posture', name: 'Security Posture', icon: '🛡️' },
  { id: 'cost-optimization', name: 'Cost Optimization', icon: '💰' },
  { id: 'well-architected', name: 'Well-Architected Score', icon: '⭐' },
  { id: 'anomalies', name: 'Anomaly Detection', icon: '🔍' },
  { id: 'waste', name: 'Waste Detection', icon: '🗑️' },
  { id: 'predictive', name: 'Predictive Incidents', icon: '🔮' },
  { id: 'compliance', name: 'Compliance Status', icon: '✅' },
  { id: 'budget', name: 'Budget Forecasting', icon: '📈' },
  { id: 'multi-account', name: 'Multi-Account Comparison', icon: '🏢' },
];

export default function TVDashboardBuilder() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: organizationId } = useOrganization();
  const [dashboards, setDashboards] = useState<TVDashboard[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedWidgets, setSelectedWidgets] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    refreshInterval: 30
  });

  useEffect(() => {
    if (organizationId) {
      loadDashboards();
    }
  }, [organizationId]);

  const loadDashboards = async () => {
    if (!organizationId) return;
    
    setLoading(true);
    try {
      // Security: Only load dashboards from user's organization
      const result = await apiClient.select('tv_dashboards', {
        select: '*',
        eq: { organization_id: organizationId },
        order: { created_at: 'desc' }
      });

      if (result.error) throw new Error(result.error);
      setDashboards(result.data || []);
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

  const createDashboard = async () => {
    if (!formData.name || selectedWidgets.length === 0) {
      toast({
        title: t('common.error'),
        description: 'Name and at least one widget are required',
        variant: "destructive"
      });
      return;
    }

    if (!organizationId) {
      toast({
        title: t('common.error'),
        description: 'No organization found',
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');

      // Generate unique token
      const token = crypto.randomUUID();

      const result = await apiClient.insert('tv_dashboards', {
        user_id: user.username,
        organization_id: organizationId,
        name: formData.name,
        description: formData.description,
        layout: selectedWidgets.map(id => ({ widgetId: id })),
        refresh_interval: formData.refreshInterval,
        access_token: token
      });

      if (result.error) throw new Error(result.error);

      toast({
        title: t('common.success'),
        description: 'TV Dashboard created successfully'
      });

      setShowCreateDialog(false);
      setFormData({ name: '', description: '', refreshInterval: 30 });
      setSelectedWidgets([]);
      await loadDashboards();
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

  const copyUrl = (token: string) => {
    const url = `${window.location.origin}/tv/${token}`;
    navigator.clipboard.writeText(url);
    toast({
      title: t('common.success'),
      description: 'TV Dashboard URL copied to clipboard'
    });
  };

  const openInNewTab = (token: string) => {
    const url = `${window.location.origin}/tv/${token}`;
    window.open(url, '_blank');
  };

  const toggleDashboard = async (id: string, currentStatus: boolean) => {
    try {
      if (!organizationId) throw new Error('No organization');

      // Security: Only toggle if dashboard belongs to user's organization
      const result = await apiClient.update('tv_dashboards', 
        { is_active: !currentStatus },
        { eq: { id: id, organization_id: organizationId } }
      );

      if (result.error) throw new Error(result.error);

      toast({
        title: t('common.success'),
        description: `Dashboard ${!currentStatus ? 'activated' : 'deactivated'}`
      });

      await loadDashboards();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const deleteDashboard = async (id: string) => {
    if (!confirm('Are you sure you want to delete this TV Dashboard?')) return;

    try {
      if (!organizationId) throw new Error('No organization');

      // Security: Only delete if dashboard belongs to user's organization
      const result = await apiClient.delete('tv_dashboards', {
        eq: { id: id, organization_id: organizationId }
      });

      if (result.error) throw new Error(result.error);

      toast({
        title: t('common.success'),
        description: 'Dashboard deleted successfully'
      });

      await loadDashboards();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const toggleWidget = (widgetId: string) => {
    setSelectedWidgets(prev =>
      prev.includes(widgetId)
        ? prev.filter(id => id !== widgetId)
        : [...prev, widgetId]
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Tv className="h-5 w-5" />
                TV Dashboard Manager
              </CardTitle>
              <CardDescription>
                Create custom dashboards for TV displays with auto-refresh
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create TV Dashboard
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Widgets</TableHead>
                  <TableHead>Refresh</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Accessed</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboards.map((dashboard) => (
                  <TableRow key={dashboard.id}>
                    <TableCell>
                      <div className="font-medium">{dashboard.name}</div>
                      {dashboard.description && (
                        <div className="text-xs text-muted-foreground">{dashboard.description}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{dashboard.layout.length} widgets</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <RefreshCw className="h-3 w-3" />
                        {dashboard.refresh_interval}s
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={dashboard.is_active ? 'default' : 'secondary'}>
                        {dashboard.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {dashboard.last_accessed_at
                        ? new Date(dashboard.last_accessed_at).toLocaleString()
                        : 'Never'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyUrl(dashboard.access_token)}
                          title="Copy URL"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openInNewTab(dashboard.access_token)}
                          title="Open in new tab"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleDashboard(dashboard.id, dashboard.is_active)}
                          title={dashboard.is_active ? 'Deactivate' : 'Activate'}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteDashboard(dashboard.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {dashboards.length === 0 && !loading && (
            <div className="text-center py-12 text-muted-foreground">
              <Tv className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No TV Dashboards created yet. Click "Create TV Dashboard" to get started.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dashboard Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create TV Dashboard</DialogTitle>
            <DialogDescription>
              Configure your TV dashboard with widgets and auto-refresh settings
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Dashboard Name *</Label>
              <Input
                id="name"
                placeholder="Executive TV Display"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Dashboard for conference room TV..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                maxLength={500}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="refresh">Auto-Refresh Interval</Label>
              <Select
                value={formData.refreshInterval.toString()}
                onValueChange={(value) => setFormData({ ...formData, refreshInterval: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 seconds</SelectItem>
                  <SelectItem value="30">30 seconds</SelectItem>
                  <SelectItem value="60">1 minute</SelectItem>
                  <SelectItem value="300">5 minutes</SelectItem>
                  <SelectItem value="600">10 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Select Widgets *</Label>
              <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto p-2 border rounded-lg">
                {AVAILABLE_WIDGETS.map((widget) => (
                  <div
                    key={widget.id}
                    className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-secondary/50 cursor-pointer"
                    onClick={() => toggleWidget(widget.id)}
                  >
                    <Checkbox
                      checked={selectedWidgets.includes(widget.id)}
                      onCheckedChange={() => toggleWidget(widget.id)}
                    />
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-2xl">{widget.icon}</span>
                      <span className="text-sm font-medium">{widget.name}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Selected: {selectedWidgets.length} widget{selectedWidgets.length !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={createDashboard} disabled={loading}>
                Create Dashboard
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}