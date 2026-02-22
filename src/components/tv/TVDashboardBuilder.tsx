import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Tv, Plus, Trash2, Copy, ExternalLink, RefreshCw, Eye, GripVertical, Pencil } from "lucide-react";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useOrganization } from "@/hooks/useOrganization";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface TVDashboard {
  id: string;
  name: string;
  description: string | null;
  layout: Array<{ widgetId: string }>;
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

function SortableWidget({ id, widget, onRemove }: { id: string; widget: typeof AVAILABLE_WIDGETS[0]; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 p-3 border rounded-lg glass border-primary/20 group">
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground" aria-label="Drag to reorder">
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="text-2xl">{widget.icon}</span>
      <span className="text-sm font-medium flex-1">{widget.name}</span>
      <Button size="sm" variant="ghost" onClick={() => onRemove(id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

export default function TVDashboardBuilder() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: organizationId } = useOrganization();
  const [dashboards, setDashboards] = useState<TVDashboard[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingDashboard, setEditingDashboard] = useState<TVDashboard | null>(null);
  const [selectedWidgets, setSelectedWidgets] = useState<string[]>([]);
  const [formData, setFormData] = useState({ name: '', description: '', refreshInterval: 30 });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (organizationId) loadDashboards();
  }, [organizationId]);

  const loadDashboards = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const result = await apiClient.select('tv_dashboards', {
        select: '*',
        eq: { organization_id: organizationId },
        order: { created_at: 'desc' }
      });
      if (result.error) throw new Error(getErrorMessage(result.error));
      setDashboards(result.data || []);
    } catch (error: any) {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const createDashboard = async () => {
    if (!formData.name || selectedWidgets.length === 0) {
      toast({ title: t('common.error'), description: t('tvDashboard.nameRequired'), variant: "destructive" });
      return;
    }
    if (!organizationId) return;

    setLoading(true);
    try {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');

      const token = crypto.randomUUID();
      const result = await apiClient.insert('tv_dashboards', {
        user_id: user.username,
        organization_id: organizationId,
        name: formData.name,
        description: formData.description || null,
        layout: selectedWidgets.map(id => ({ widgetId: id })),
        refresh_interval: formData.refreshInterval,
        access_token: token
      });
      if (result.error) throw new Error(getErrorMessage(result.error));

      toast({ title: t('common.success'), description: t('tvDashboard.dashboardCreated') });
      setShowCreateDialog(false);
      setFormData({ name: '', description: '', refreshInterval: 30 });
      setSelectedWidgets([]);
      await loadDashboards();
    } catch (error: any) {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const saveLayout = useCallback(async (dashboardId: string, newLayout: Array<{ widgetId: string }>) => {
    if (!organizationId) return;
    try {
      const result = await apiClient.update('tv_dashboards',
        { layout: newLayout },
        { eq: { id: dashboardId, organization_id: organizationId } }
      );
      if (result.error) throw new Error(getErrorMessage(result.error));
      toast({ title: t('common.success'), description: t('tvDashboard.layoutSaved') });
    } catch (error: any) {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    }
  }, [organizationId, t, toast]);

  const handleEditDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !editingDashboard) return;

    const oldIndex = editingDashboard.layout.findIndex(w => w.widgetId === active.id);
    const newIndex = editingDashboard.layout.findIndex(w => w.widgetId === over.id);
    const newLayout = arrayMove(editingDashboard.layout, oldIndex, newIndex);

    setEditingDashboard({ ...editingDashboard, layout: newLayout });
    setDashboards(prev => prev.map(d => d.id === editingDashboard.id ? { ...d, layout: newLayout } : d));
    saveLayout(editingDashboard.id, newLayout);
  };

  const handleCreateDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSelectedWidgets(prev => {
      const oldIndex = prev.indexOf(active.id as string);
      const newIndex = prev.indexOf(over.id as string);
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const removeWidgetFromEdit = (widgetId: string) => {
    if (!editingDashboard) return;
    const newLayout = editingDashboard.layout.filter(w => w.widgetId !== widgetId);
    setEditingDashboard({ ...editingDashboard, layout: newLayout });
    setDashboards(prev => prev.map(d => d.id === editingDashboard.id ? { ...d, layout: newLayout } : d));
    saveLayout(editingDashboard.id, newLayout);
  };

  const addWidgetToEdit = (widgetId: string) => {
    if (!editingDashboard || editingDashboard.layout.some(w => w.widgetId === widgetId)) return;
    const newLayout = [...editingDashboard.layout, { widgetId }];
    setEditingDashboard({ ...editingDashboard, layout: newLayout });
    setDashboards(prev => prev.map(d => d.id === editingDashboard.id ? { ...d, layout: newLayout } : d));
    saveLayout(editingDashboard.id, newLayout);
  };

  const copyUrl = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/tv/${token}`);
    toast({ title: t('common.success'), description: t('tvDashboard.urlCopied') });
  };

  const openInNewTab = (token: string) => window.open(`${window.location.origin}/tv/${token}`, '_blank');

  const toggleDashboard = async (id: string, currentStatus: boolean) => {
    if (!organizationId) return;
    try {
      const result = await apiClient.update('tv_dashboards', { is_active: !currentStatus }, { eq: { id, organization_id: organizationId } });
      if (result.error) throw new Error(getErrorMessage(result.error));
      toast({ title: t('common.success'), description: !currentStatus ? t('tvDashboard.dashboardActivated') : t('tvDashboard.dashboardDeactivated') });
      await loadDashboards();
    } catch (error: any) {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    }
  };

  const deleteDashboard = async (id: string) => {
    if (!confirm(t('tvDashboard.confirmDelete'))) return;
    if (!organizationId) return;
    try {
      const result = await apiClient.delete('tv_dashboards', { eq: { id, organization_id: organizationId } });
      if (result.error) throw new Error(getErrorMessage(result.error));
      toast({ title: t('common.success'), description: t('tvDashboard.dashboardDeleted') });
      if (editingDashboard?.id === id) setEditingDashboard(null);
      await loadDashboards();
    } catch (error: any) {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    }
  };

  const toggleWidget = (widgetId: string) => {
    setSelectedWidgets(prev => prev.includes(widgetId) ? prev.filter(id => id !== widgetId) : [...prev, widgetId]);
  };

  return (
    <>
      <Card className="glass border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Tv className="h-5 w-5" />
                {t('tvDashboard.management')}
              </CardTitle>
              <CardDescription>{t('tvDashboard.managementDesc')}</CardDescription>
            </div>
            <Button className="glass hover-glow" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('tvDashboard.createDashboard')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('tvDashboard.dashboardName')}</TableHead>
                  <TableHead>{t('tvDashboard.widgets')}</TableHead>
                  <TableHead>{t('tvDashboard.refresh')}</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>{t('tvDashboard.lastAccessed')}</TableHead>
                  <TableHead>{t('tvDashboard.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboards.map((dashboard) => (
                  <TableRow key={dashboard.id}>
                    <TableCell>
                      <div className="font-medium">{dashboard.name}</div>
                      {dashboard.description && <div className="text-xs text-muted-foreground">{dashboard.description}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{dashboard.layout.length} {t('tvDashboard.widgets')}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <RefreshCw className="h-3 w-3" />
                        {dashboard.refresh_interval}s
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={dashboard.is_active ? 'default' : 'secondary'}>
                        {dashboard.is_active ? t('tvDashboard.active') : t('tvDashboard.inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {dashboard.last_accessed_at ? new Date(dashboard.last_accessed_at).toLocaleString() : t('tvDashboard.never')}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => setEditingDashboard(dashboard)} title={t('tvDashboard.editLayout')}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => copyUrl(dashboard.access_token)} title={t('tvDashboard.copyLink')}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openInNewTab(dashboard.access_token)}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => toggleDashboard(dashboard.id, dashboard.is_active)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => deleteDashboard(dashboard.id)}>
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
              <p>{t('tvDashboard.noDashboards')}</p>
              <p className="text-sm">{t('tvDashboard.noDashboardsDesc')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Layout Dialog */}
      <Dialog open={!!editingDashboard} onOpenChange={(open) => { if (!open) setEditingDashboard(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('tvDashboard.editLayout')} - {editingDashboard?.name}</DialogTitle>
            <DialogDescription>{t('tvDashboard.dragToReorder')}</DialogDescription>
          </DialogHeader>
          {editingDashboard && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('tvDashboard.selectWidgets')}</Label>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEditDragEnd}>
                  <SortableContext items={editingDashboard.layout.map(w => w.widgetId)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {editingDashboard.layout.map((item) => {
                        const widget = AVAILABLE_WIDGETS.find(w => w.id === item.widgetId);
                        if (!widget) return null;
                        return <SortableWidget key={item.widgetId} id={item.widgetId} widget={widget} onRemove={removeWidgetFromEdit} />;
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
              {/* Add more widgets */}
              {AVAILABLE_WIDGETS.filter(w => !editingDashboard.layout.some(l => l.widgetId === w.id)).length > 0 && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs">{t('tvDashboard.selectWidgets')}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {AVAILABLE_WIDGETS.filter(w => !editingDashboard.layout.some(l => l.widgetId === w.id)).map(widget => (
                      <button key={widget.id} onClick={() => addWidgetToEdit(widget.id)}
                        className="flex items-center gap-2 p-2 border rounded-lg hover:bg-secondary/50 text-left text-sm">
                        <span>{widget.icon}</span>
                        <span>{widget.name}</span>
                        <Plus className="h-3 w-3 ml-auto text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Dashboard Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('tvDashboard.createDashboard')}</DialogTitle>
            <DialogDescription>{t('tvDashboard.createDashboardDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('tvDashboard.dashboardName')} *</Label>
              <Input id="name" placeholder={t('tvDashboard.dashboardNamePlaceholder')} value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })} maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('tvDashboard.description')}</Label>
              <Textarea id="description" placeholder={t('tvDashboard.descriptionPlaceholder')} value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })} maxLength={500} />
            </div>
            <div className="space-y-2">
              <Label>{t('tvDashboard.refreshInterval')}</Label>
              <Select value={formData.refreshInterval.toString()} onValueChange={(v) => setFormData({ ...formData, refreshInterval: parseInt(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 {t('tvDashboard.seconds')}</SelectItem>
                  <SelectItem value="30">30 {t('tvDashboard.seconds')}</SelectItem>
                  <SelectItem value="60">1 {t('tvDashboard.minute')}</SelectItem>
                  <SelectItem value="300">5 {t('tvDashboard.minutes')}</SelectItem>
                  <SelectItem value="600">10 {t('tvDashboard.minutes')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('tvDashboard.selectWidgets')} *</Label>
              {selectedWidgets.length > 0 && (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCreateDragEnd}>
                  <SortableContext items={selectedWidgets} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2 mb-3">
                      {selectedWidgets.map(wId => {
                        const widget = AVAILABLE_WIDGETS.find(w => w.id === wId);
                        if (!widget) return null;
                        return <SortableWidget key={wId} id={wId} widget={widget} onRemove={(id) => toggleWidget(id)} />;
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
              <div className="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto p-2 border rounded-lg">
                {AVAILABLE_WIDGETS.filter(w => !selectedWidgets.includes(w.id)).map((widget) => (
                  <div key={widget.id} className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-secondary/50 cursor-pointer"
                    onClick={() => toggleWidget(widget.id)}>
                    <Checkbox checked={false} onCheckedChange={() => toggleWidget(widget.id)} />
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-2xl">{widget.icon}</span>
                      <span className="text-sm font-medium">{widget.name}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('tvDashboard.selectedWidgets', { count: selectedWidgets.length })}
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>{t('common.cancel')}</Button>
              <Button className="glass hover-glow" onClick={createDashboard} disabled={loading}>{t('tvDashboard.createDashboard')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
