/**
 * Ticket Details Page v1.0
 * Full ticket management with comments, checklist, relations, attachments, history
 * Design: Light theme matching Executive Dashboard (#003C7D accent, #F9FAFB background)
 */

import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { Layout } from "@/components/Layout";
import { 
  Ticket, ArrowLeft, RefreshCw, Clock, CheckCircle, XCircle, User, Calendar,
  MessageSquare, AlertTriangle, Link2, Paperclip, History, ListChecks, Send, 
  Trash2, Edit2, Upload, Download, FileText, Image, Timer, AlertCircle,
  Plus, ChevronDown, ChevronUp, Eye, Shield, DollarSign, Settings, Zap,
  MoreVertical, ExternalLink, Check, X
} from "lucide-react";

// ==================== TYPES ====================

interface TicketComment {
  id: string;
  ticket_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  content: string;
  is_internal: boolean;
  is_resolution: boolean;
  parent_id: string | null;
  created_at: string;
  edited: boolean;
  edited_at: string | null;
}

interface TicketHistory {
  id: string;
  ticket_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  action: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  comment: string | null;
  created_at: string;
}

interface ChecklistItem {
  id: string;
  ticket_id: string;
  title: string;
  description: string | null;
  is_completed: boolean;
  completed_by_name: string | null;
  completed_at: string | null;
  is_required: boolean;
  order_index: number;
  due_date: string | null;
}

interface TicketRelation {
  id: string;
  source_ticket_id: string;
  target_ticket_id: string;
  relation_type: string;
  target_ticket: { id: string; title: string; status: string; severity: string; priority: string };
  created_at: string;
  notes: string | null;
}

interface TicketAttachment {
  id: string;
  file_name: string;
  original_name: string;
  file_size: number;
  mime_type: string;
  uploaded_by_name: string;
  description: string | null;
  created_at: string;
}

interface TicketDetails {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  priority: string;
  category: string;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  due_date: string | null;
  resolution_notes: string | null;
  affected_resources: string[];
  automation_available: boolean;
  estimated_effort_hours: number;
  business_impact: string;
  sla_due_at: string | null;
  sla_breached: boolean;
  first_response_at: string | null;
  time_to_first_response: number | null;
  time_to_resolution: number | null;
  escalation_level: number;
  sla_policy: any;
  comments: TicketComment[];
  checklist_items: ChecklistItem[];
  source_relations: TicketRelation[];
  history: TicketHistory[];
}

// ==================== CONSTANTS ====================

const SEVERITY_CONFIG: Record<string, { color: string; textColor: string; bgLight: string; labelKey: string }> = {
  critical: { color: 'bg-red-500', textColor: 'text-red-700', bgLight: 'bg-red-50', labelKey: 'ticketDetails.severityCritical' },
  high: { color: 'bg-orange-500', textColor: 'text-orange-700', bgLight: 'bg-orange-50', labelKey: 'ticketDetails.severityHigh' },
  medium: { color: 'bg-yellow-500', textColor: 'text-yellow-700', bgLight: 'bg-yellow-50', labelKey: 'ticketDetails.severityMedium' },
  low: { color: 'bg-green-500', textColor: 'text-green-700', bgLight: 'bg-green-50', labelKey: 'ticketDetails.severityLow' },
};

const STATUS_CONFIG: Record<string, { color: string; labelKey: string; icon: any }> = {
  open: { color: 'bg-blue-500', labelKey: 'ticketDetails.statusOpen', icon: AlertCircle },
  in_progress: { color: 'bg-purple-500', labelKey: 'ticketDetails.statusInProgress', icon: Zap },
  pending_review: { color: 'bg-yellow-500', labelKey: 'ticketDetails.statusPendingReview', icon: Clock },
  blocked: { color: 'bg-red-500', labelKey: 'ticketDetails.statusBlocked', icon: XCircle },
  resolved: { color: 'bg-green-500', labelKey: 'ticketDetails.statusResolved', icon: CheckCircle },
  closed: { color: 'bg-gray-500', labelKey: 'ticketDetails.statusClosed', icon: CheckCircle },
  cancelled: { color: 'bg-gray-400', labelKey: 'ticketDetails.statusCancelled', icon: XCircle },
  reopened: { color: 'bg-orange-500', labelKey: 'ticketDetails.statusReopened', icon: AlertTriangle },
};

const CATEGORY_CONFIG: Record<string, { icon: any; labelKey: string; color: string }> = {
  security: { icon: Shield, labelKey: 'ticketDetails.categorySecurity', color: 'text-red-600' },
  compliance: { icon: CheckCircle, labelKey: 'ticketDetails.categoryCompliance', color: 'text-blue-600' },
  cost_optimization: { icon: DollarSign, labelKey: 'ticketDetails.categoryCostOptimization', color: 'text-green-600' },
  performance: { icon: Zap, labelKey: 'ticketDetails.categoryPerformance', color: 'text-purple-600' },
  configuration: { icon: Settings, labelKey: 'ticketDetails.categoryConfiguration', color: 'text-gray-600' },
};

const RELATION_LABEL_KEYS: Record<string, string> = {
  blocks: 'ticketDetails.relationBlocks',
  blocked_by: 'ticketDetails.relationBlockedBy',
  duplicates: 'ticketDetails.relationDuplicates',
  duplicate_of: 'ticketDetails.relationDuplicateOf',
  related_to: 'ticketDetails.relationRelatedTo',
  parent_of: 'ticketDetails.relationParentOf',
  child_of: 'ticketDetails.relationChildOf',
  caused_by: 'ticketDetails.relationCausedBy',
  causes: 'ticketDetails.relationCauses',
};

const ACTION_LABEL_KEYS: Record<string, string> = {
  created: 'ticketDetails.actionCreated',
  status_changed: 'ticketDetails.actionStatusChanged',
  assigned: 'ticketDetails.actionAssigned',
  commented: 'ticketDetails.actionCommented',
  priority_changed: 'ticketDetails.actionPriorityChanged',
  severity_changed: 'ticketDetails.actionSeverityChanged',
  sla_breached: 'ticketDetails.actionSlaBreached',
  escalated: 'ticketDetails.actionEscalated',
  resolved: 'ticketDetails.actionResolved',
  reopened: 'ticketDetails.actionReopened',
  checklist_updated: 'ticketDetails.actionChecklistUpdated',
  attachment_added: 'ticketDetails.actionAttachmentAdded',
  attachment_removed: 'ticketDetails.actionAttachmentRemoved',
  relation_added: 'ticketDetails.actionRelationAdded',
  relation_removed: 'ticketDetails.actionRelationRemoved',
};


// ==================== HELPER FUNCTIONS ====================

function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(dateString: string | null): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(dateString);
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getSlaStatus(ticket: TicketDetails): { status: string; color: string; labelKey: string; timeRemaining: string } {
  if (!ticket.sla_due_at) return { status: 'no_sla', color: 'text-gray-400', labelKey: 'ticketDetails.slaNoSla', timeRemaining: '-' };
  if (ticket.sla_breached) return { status: 'breached', color: 'text-red-600', labelKey: 'ticketDetails.slaBreached', timeRemaining: '' };
  
  const now = new Date();
  const dueAt = new Date(ticket.sla_due_at);
  const diff = dueAt.getTime() - now.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  
  if (diff < 0) {
    const absHours = Math.abs(hours);
    return { status: 'breached', color: 'text-red-600', labelKey: 'ticketDetails.slaBreached', timeRemaining: `${absHours}h` };
  }
  
  let timeRemaining = '';
  if (hours < 24) {
    timeRemaining = `${hours}h`;
  } else {
    const days = Math.floor(hours / 24);
    timeRemaining = `${days}d ${hours % 24}h`;
  }
  
  if (hours < 2) return { status: 'at_risk', color: 'text-orange-600', labelKey: 'ticketDetails.slaAtRisk', timeRemaining };
  return { status: 'on_track', color: 'text-green-600', labelKey: 'ticketDetails.slaOnTrack', timeRemaining };
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return Image;
  return FileText;
}


// ==================== COMMENTS SECTION ====================

function CommentsSection({ 
  ticketId, 
  comments, 
  onRefresh 
}: { 
  ticketId: string; 
  comments: TicketComment[]; 
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [newComment, setNewComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  
  const addCommentMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/api/functions/ticket-management', {
        action: 'add-comment',
        ticketId,
        content: newComment,
        isInternal,
      });
      return response.data;
    },
    onSuccess: () => {
      toast({ title: t('ticketDetails.commentAdded', 'Comment added') });
      setNewComment('');
      onRefresh();
    },
    onError: (err) => {
      toast({ title: t('ticketDetails.errorAddingComment', 'Error adding comment'), description: getErrorMessage(err), variant: 'destructive' });
    },
  });
  
  return (
    <div className="space-y-4">
      {/* Add Comment */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <Textarea
          placeholder={t('ticketDetails.addCommentPlaceholder', 'Add a comment...')}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          rows={3}
          className="mb-3"
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-gray-500">
            <Checkbox checked={isInternal} onCheckedChange={(c) => setIsInternal(!!c)} />
            {t('ticketDetails.internalComment', 'Internal comment (not visible to all)')}
          </label>
          <Button
            size="sm"
            onClick={() => addCommentMutation.mutate()}
            disabled={!newComment.trim() || addCommentMutation.isPending}
            className="bg-[#003C7D] hover:bg-[#002d5c]"
          >
            <Send className="h-4 w-4 mr-2" />
            {t('ticketDetails.send', 'Send')}
          </Button>
        </div>
      </div>
      
      {/* Comments List */}
      <div className="space-y-3">
        {comments.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>{t('ticketDetails.noComments', 'No comments yet')}</p>
          </div>
        ) : (
          comments.map(comment => (
            <div 
              key={comment.id} 
              className={`bg-white rounded-xl border p-4 ${comment.is_internal ? 'border-yellow-200 bg-yellow-50/50' : 'border-gray-100'}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#003C7D]/10 flex items-center justify-center">
                    <User className="h-4 w-4 text-[#003C7D]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#1F2937]">{comment.user_name || t('ticketDetails.user', 'User')}</p>
                    <p className="text-xs text-gray-400">{formatRelativeTime(comment.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {comment.is_internal && (
                    <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-300">
                      {t('ticketDetails.internal', 'Internal')}
                    </Badge>
                  )}
                  {comment.is_resolution && (
                    <Badge className="text-xs bg-green-500">{t('ticketDetails.resolution', 'Resolution')}</Badge>
                  )}
                </div>
              </div>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{comment.content}</p>
              {comment.edited && (
                <p className="text-xs text-gray-400 mt-2">({t('ticketDetails.edited', 'edited')})</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}


// ==================== CHECKLIST SECTION ====================

function ChecklistSection({ 
  ticketId, 
  items, 
  onRefresh 
}: { 
  ticketId: string; 
  items: ChecklistItem[]; 
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemRequired, setNewItemRequired] = useState(false);
  
  const completedCount = items.filter(i => i.is_completed).length;
  const requiredCount = items.filter(i => i.is_required).length;
  const requiredCompletedCount = items.filter(i => i.is_required && i.is_completed).length;
  const progress = items.length > 0 ? (completedCount / items.length) * 100 : 0;
  
  const addItemMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/api/functions/ticket-management', {
        action: 'add-checklist-item',
        ticketId,
        title: newItemTitle,
        isRequired: newItemRequired,
      });
      return response.data;
    },
    onSuccess: () => {
      toast({ title: t('ticketDetails.itemAdded', 'Item added') });
      setNewItemTitle('');
      setNewItemRequired(false);
      onRefresh();
    },
    onError: (err) => {
      toast({ title: t('ticketDetails.errorAddingItem', 'Error adding item'), description: getErrorMessage(err), variant: 'destructive' });
    },
  });
  
  const toggleItemMutation = useMutation({
    mutationFn: async ({ itemId, isCompleted }: { itemId: string; isCompleted: boolean }) => {
      const response = await apiClient.post('/api/functions/ticket-management', {
        action: 'update-checklist-item',
        itemId,
        isCompleted,
      });
      return response.data;
    },
    onSuccess: () => {
      onRefresh();
    },
    onError: (err) => {
      toast({ title: t('ticketDetails.errorUpdatingItem', 'Error updating item'), description: getErrorMessage(err), variant: 'destructive' });
    },
  });
  
  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await apiClient.post('/api/functions/ticket-management', {
        action: 'delete-checklist-item',
        itemId,
      });
      return response.data;
    },
    onSuccess: () => {
      toast({ title: t('ticketDetails.itemRemoved', 'Item removed') });
      onRefresh();
    },
    onError: (err) => {
      toast({ title: t('ticketDetails.errorRemovingItem', 'Error removing item'), description: getErrorMessage(err), variant: 'destructive' });
    },
  });
  
  return (
    <div className="space-y-4">
      {/* Progress */}
      {items.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[#1F2937]">{t('ticketDetails.progress', 'Progress')}</span>
            <span className="text-sm text-gray-500">{completedCount}/{items.length} {t('ticketDetails.completed', 'completed')}</span>
          </div>
          <Progress value={progress} className="h-2" />
          {requiredCount > 0 && (
            <p className="text-xs text-gray-400 mt-2">
              {requiredCompletedCount}/{requiredCount} {t('ticketDetails.requiredItemsCompleted', 'required items completed')}
            </p>
          )}
        </div>
      )}
      
      {/* Add Item */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center gap-3">
          <Input
            placeholder={t('ticketDetails.addChecklistItem', 'Add checklist item...')}
            value={newItemTitle}
            onChange={(e) => setNewItemTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && newItemTitle.trim() && addItemMutation.mutate()}
            className="flex-1"
          />
          <label className="flex items-center gap-2 text-sm text-gray-500 whitespace-nowrap">
            <Checkbox checked={newItemRequired} onCheckedChange={(c) => setNewItemRequired(!!c)} />
            {t('ticketDetails.required', 'Required')}
          </label>
          <Button
            size="sm"
            onClick={() => addItemMutation.mutate()}
            disabled={!newItemTitle.trim() || addItemMutation.isPending}
            className="bg-[#003C7D] hover:bg-[#002d5c]"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Items List */}
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <ListChecks className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>{t('ticketDetails.noChecklistItems', 'No checklist items')}</p>
          </div>
        ) : (
          items.map(item => (
            <div 
              key={item.id} 
              className={`bg-white rounded-xl border p-3 flex items-center gap-3 group ${
                item.is_completed ? 'border-green-200 bg-green-50/30' : 'border-gray-100'
              }`}
            >
              <Checkbox
                checked={item.is_completed}
                onCheckedChange={(checked) => toggleItemMutation.mutate({ itemId: item.id, isCompleted: !!checked })}
              />
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${item.is_completed ? 'text-gray-400 line-through' : 'text-[#1F2937]'}`}>
                  {item.title}
                </p>
                {item.description && (
                  <p className="text-xs text-gray-400 mt-1">{item.description}</p>
                )}
                {item.is_completed && item.completed_by_name && (
                  <p className="text-xs text-gray-400 mt-1">
                    {t('ticketDetails.completedBy', 'Completed by')} {item.completed_by_name} {t('ticketDetails.on', 'on')} {formatDateTime(item.completed_at)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {item.is_required && (
                  <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
                    {t('ticketDetails.required', 'Required')}
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteItemMutation.mutate(item.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}


// ==================== RELATIONS SECTION ====================

function RelationsSection({ 
  ticketId, 
  relations, 
  onRefresh 
}: { 
  ticketId: string; 
  relations: TicketRelation[]; 
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [targetTicketId, setTargetTicketId] = useState('');
  const [relationType, setRelationType] = useState('related_to');
  
  const addRelationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/api/functions/ticket-management', {
        action: 'add-relation',
        sourceTicketId: ticketId,
        targetTicketId,
        relationType,
      });
      return response.data;
    },
    onSuccess: () => {
      toast({ title: t('ticketDetails.relationAdded', 'Relation added') });
      setShowAddDialog(false);
      setTargetTicketId('');
      onRefresh();
    },
    onError: (err) => {
      toast({ title: t('ticketDetails.errorAddingRelation', 'Error adding relation'), description: getErrorMessage(err), variant: 'destructive' });
    },
  });
  
  const deleteRelationMutation = useMutation({
    mutationFn: async (relationId: string) => {
      const response = await apiClient.post('/api/functions/ticket-management', {
        action: 'delete-relation',
        relationId,
      });
      return response.data;
    },
    onSuccess: () => {
      toast({ title: t('ticketDetails.relationRemoved', 'Relation removed') });
      onRefresh();
    },
    onError: (err) => {
      toast({ title: t('ticketDetails.errorRemovingRelation', 'Error removing relation'), description: getErrorMessage(err), variant: 'destructive' });
    },
  });
  
  // Group relations by type
  const groupedRelations = relations.reduce((acc, rel) => {
    if (!acc[rel.relation_type]) acc[rel.relation_type] = [];
    acc[rel.relation_type].push(rel);
    return acc;
  }, {} as Record<string, TicketRelation[]>);
  
  return (
    <div className="space-y-4">
      {/* Add Relation Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowAddDialog(true)}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        {t('ticketDetails.addRelation', 'Add Relation')}
      </Button>
      
      {/* Relations List */}
      {Object.keys(groupedRelations).length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <Link2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>{t('ticketDetails.noRelations', 'No relations with other tickets')}</p>
        </div>
      ) : (
        Object.entries(groupedRelations).map(([type, rels]) => (
          <div key={type} className="space-y-2">
            <h4 className="text-sm font-medium text-gray-500">{t(RELATION_LABEL_KEYS[type], type)}</h4>
            {rels.map(rel => (
              <div 
                key={rel.id} 
                className="bg-white rounded-xl border border-gray-100 p-3 flex items-center justify-between group"
              >
                <div 
                  className="flex items-center gap-3 cursor-pointer flex-1"
                  onClick={() => navigate(`/tickets/${rel.target_ticket.id}`)}
                >
                  <div className={`w-2 h-2 rounded-full ${SEVERITY_CONFIG[rel.target_ticket.severity]?.color || 'bg-gray-400'}`} />
                  <div>
                    <p className="text-sm font-medium text-[#1F2937] hover:text-[#003C7D]">
                      {rel.target_ticket.title}
                    </p>
                    <p className="text-xs text-gray-400">
                      {t(STATUS_CONFIG[rel.target_ticket.status]?.labelKey, rel.target_ticket.status)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4 text-gray-300" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteRelationMutation.mutate(rel.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
      
      {/* Add Relation Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ticketDetails.addRelation', 'Add Relation')}</DialogTitle>
            <DialogDescription>
              {t('ticketDetails.addRelationDesc', 'Link this ticket to another existing ticket')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('ticketDetails.ticketId', 'Ticket ID')}</Label>
              <Input
                placeholder={t('ticketDetails.pasteTicketId', 'Paste the ticket ID (UUID)')}
                value={targetTicketId}
                onChange={(e) => setTargetTicketId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('ticketDetails.relationType', 'Relation Type')}</Label>
              <Select value={relationType} onValueChange={setRelationType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="related_to">{t('ticketDetails.relationRelatedTo', 'Related to')}</SelectItem>
                  <SelectItem value="blocks">{t('ticketDetails.relationBlocks', 'Blocks')}</SelectItem>
                  <SelectItem value="blocked_by">{t('ticketDetails.relationBlockedBy', 'Blocked by')}</SelectItem>
                  <SelectItem value="duplicates">{t('ticketDetails.relationDuplicates', 'Duplicates')}</SelectItem>
                  <SelectItem value="duplicate_of">{t('ticketDetails.relationDuplicateOf', 'Duplicate of')}</SelectItem>
                  <SelectItem value="parent_of">{t('ticketDetails.relationParentOf', 'Parent of')}</SelectItem>
                  <SelectItem value="child_of">{t('ticketDetails.relationChildOf', 'Child of')}</SelectItem>
                  <SelectItem value="causes">{t('ticketDetails.relationCauses', 'Causes')}</SelectItem>
                  <SelectItem value="caused_by">{t('ticketDetails.relationCausedBy', 'Caused by')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>{t('ticketDetails.cancel', 'Cancel')}</Button>
            <Button 
              onClick={() => addRelationMutation.mutate()}
              disabled={!targetTicketId || addRelationMutation.isPending}
              className="bg-[#003C7D] hover:bg-[#002d5c]"
            >
              {t('ticketDetails.add', 'Add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ==================== ATTACHMENTS SECTION ====================

function AttachmentsSection({ 
  ticketId, 
  onRefresh 
}: { 
  ticketId: string; 
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const { data: attachmentsData, isLoading, refetch: refetchAttachments } = useQuery({
    queryKey: ['ticket-attachments', ticketId],
    queryFn: async () => {
      const response = await apiClient.post('/api/functions/ticket-attachments', {
        action: 'list-attachments',
        ticketId,
      });
      return response.data;
    },
  });
  
  const attachments: TicketAttachment[] = attachmentsData?.attachments || [];
  
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Validate file size (50MB max)
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: t('ticketDetails.fileTooLarge', 'File too large'), description: t('ticketDetails.maxFileSize', 'Maximum size is 50MB'), variant: 'destructive' });
      return;
    }
    
    setUploading(true);
    setUploadProgress(10);
    
    try {
      // 1. Request upload URL
      const requestResponse = await apiClient.post('/api/functions/ticket-attachments', {
        action: 'request-upload',
        ticketId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });
      
      const { attachmentId, uploadUrl } = requestResponse.data;
      setUploadProgress(30);
      
      // 2. Upload to S3
      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });
      setUploadProgress(80);
      
      // 3. Confirm upload
      await apiClient.post('/api/functions/ticket-attachments', {
        action: 'confirm-upload',
        attachmentId,
      });
      setUploadProgress(100);
      
      toast({ title: t('ticketDetails.fileUploaded', 'File uploaded successfully') });
      refetchAttachments();
      onRefresh();
    } catch (err) {
      toast({ title: t('ticketDetails.errorUploadingFile', 'Error uploading file'), description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
  
  const handleDownload = async (attachmentId: string) => {
    try {
      const response = await apiClient.post('/api/functions/ticket-attachments', {
        action: 'get-download-url',
        attachmentId,
      });
      
      const { downloadUrl, fileName } = response.data;
      
      // Open download in new tab
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      toast({ title: t('ticketDetails.errorDownloadingFile', 'Error downloading file'), description: getErrorMessage(err), variant: 'destructive' });
    }
  };
  
  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      const response = await apiClient.post('/api/functions/ticket-attachments', {
        action: 'delete-attachment',
        attachmentId,
      });
      return response.data;
    },
    onSuccess: () => {
      toast({ title: t('ticketDetails.attachmentRemoved', 'Attachment removed') });
      refetchAttachments();
      onRefresh();
    },
    onError: (err) => {
      toast({ title: t('ticketDetails.errorRemovingAttachment', 'Error removing attachment'), description: getErrorMessage(err), variant: 'destructive' });
    },
  });
  
  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div 
        className="bg-white rounded-xl border-2 border-dashed border-gray-200 p-6 text-center hover:border-[#003C7D]/50 transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.json,.xml,.zip,.gz"
        />
        {uploading ? (
          <div className="space-y-3">
            <div className="animate-pulse">
              <Upload className="h-8 w-8 mx-auto text-[#003C7D]" />
            </div>
            <Progress value={uploadProgress} className="h-2 max-w-xs mx-auto" />
            <p className="text-sm text-gray-500">{t('ticketDetails.uploadingFile', 'Uploading file...')}</p>
          </div>
        ) : (
          <>
            <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-600">{t('ticketDetails.clickToUpload', 'Click to upload or drag files here')}</p>
            <p className="text-xs text-gray-400 mt-1">{t('ticketDetails.maxUploadInfo', 'Max 50MB - Images, PDFs, documents, archives')}</p>
          </>
        )}
      </div>
      
      {/* Attachments List */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map(i => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : attachments.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <Paperclip className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>{t('ticketDetails.noAttachments', 'No attachments')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {attachments.map(attachment => {
            const FileIcon = getFileIcon(attachment.mime_type);
            return (
              <div 
                key={attachment.id} 
                className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3 group"
              >
                <div className="p-2 bg-gray-50 rounded-lg">
                  <FileIcon className="h-5 w-5 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1F2937] truncate">{attachment.original_name}</p>
                  <p className="text-xs text-gray-400">
                    {formatFileSize(attachment.file_size)} • {attachment.uploaded_by_name} • {formatRelativeTime(attachment.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownload(attachment.id)}
                    className="text-gray-400 hover:text-[#003C7D]"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteAttachmentMutation.mutate(attachment.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
          
          {attachmentsData?.totalSizeFormatted && (
            <p className="text-xs text-gray-400 text-center">
              Total: {attachments.length} {t('ticketDetails.files', 'file(s)')}, {attachmentsData.totalSizeFormatted}
            </p>
          )}
        </div>
      )}
    </div>
  );
}


// ==================== HISTORY SECTION ====================

function HistorySection({ history }: { history: TicketHistory[] }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      {history.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>{t('ticketDetails.noHistory', 'No history available')}</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
          
          <div className="space-y-4">
            {history.map((entry, index) => (
              <div key={entry.id} className="relative flex gap-4 pl-10">
                {/* Timeline dot */}
                <div className="absolute left-2.5 w-3 h-3 rounded-full bg-white border-2 border-[#003C7D]" />
                
                <div className="flex-1 bg-white rounded-xl border border-gray-100 p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-[#1F2937]">
                        {t(ACTION_LABEL_KEYS[entry.action], entry.action)}
                      </p>
                      {entry.field_changed && entry.old_value && entry.new_value && (
                        <p className="text-xs text-gray-500 mt-1">
                          <span className="line-through text-gray-400">{entry.old_value}</span>
                          {' → '}
                          <span className="text-[#003C7D]">{entry.new_value}</span>
                        </p>
                      )}
                      {entry.comment && (
                        <p className="text-xs text-gray-500 mt-1 italic">"{entry.comment}"</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">{formatRelativeTime(entry.created_at)}</p>
                      <p className="text-xs text-gray-400">{entry.user_name || t('ticketDetails.system', 'System')}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ==================== STATUS UPDATE DIALOG ====================

function StatusUpdateDialog({
  open,
  onOpenChange,
  ticketId,
  currentStatus,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
  currentStatus: string;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [newStatus, setNewStatus] = useState(currentStatus);
  const [comment, setComment] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  
  const updateStatusMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/api/functions/ticket-management', {
        action: 'update-status',
        ticketId,
        status: newStatus,
        comment: comment || undefined,
        resolutionNotes: resolutionNotes || undefined,
      });
      return response.data;
    },
    onSuccess: () => {
      toast({ title: t('ticketDetails.statusUpdated', 'Status updated') });
      onOpenChange(false);
      onSuccess();
    },
    onError: (err) => {
      toast({ title: t('ticketDetails.errorUpdatingStatus', 'Error updating status'), description: getErrorMessage(err), variant: 'destructive' });
    },
  });
  
  const showResolutionNotes = ['resolved', 'closed'].includes(newStatus);
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('ticketDetails.changeStatus', 'Change Status')}</DialogTitle>
          <DialogDescription>
            {t('ticketDetails.changeStatusDesc', 'Update the ticket status and add an optional comment')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t('ticketDetails.newStatus', 'New Status')}</Label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">{t('ticketDetails.statusOpen', 'Open')}</SelectItem>
                <SelectItem value="in_progress">{t('ticketDetails.statusInProgress', 'In Progress')}</SelectItem>
                <SelectItem value="pending_review">{t('ticketDetails.statusPendingReview', 'Pending Review')}</SelectItem>
                <SelectItem value="blocked">{t('ticketDetails.statusBlocked', 'Blocked')}</SelectItem>
                <SelectItem value="resolved">{t('ticketDetails.statusResolved', 'Resolved')}</SelectItem>
                <SelectItem value="closed">{t('ticketDetails.statusClosed', 'Closed')}</SelectItem>
                <SelectItem value="cancelled">{t('ticketDetails.statusCancelled', 'Cancelled')}</SelectItem>
                <SelectItem value="reopened">{t('ticketDetails.statusReopened', 'Reopened')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label>{t('ticketDetails.commentOptional', 'Comment (optional)')}</Label>
            <Textarea
              placeholder={t('ticketDetails.statusCommentPlaceholder', 'Add a comment about the status change...')}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
            />
          </div>
          
          {showResolutionNotes && (
            <div className="space-y-2">
              <Label>{t('ticketDetails.resolutionNotes', 'Resolution Notes')}</Label>
              <Textarea
                placeholder={t('ticketDetails.resolutionNotesPlaceholder', 'Describe how the issue was resolved...')}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                rows={3}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('ticketDetails.cancel', 'Cancel')}</Button>
          <Button 
            onClick={() => updateStatusMutation.mutate()}
            disabled={newStatus === currentStatus || updateStatusMutation.isPending}
            className="bg-[#003C7D] hover:bg-[#002d5c]"
          >
            {t('ticketDetails.updateStatus', 'Update Status')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ==================== MAIN PAGE COMPONENT ====================

export default function TicketDetailsPage() {
  const { t } = useTranslation();
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState('details');
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  
  // Fetch ticket details
  const { data: ticketData, isLoading, refetch } = useQuery({
    queryKey: ['ticket-details', ticketId],
    queryFn: async () => {
      const response = await apiClient.post('/api/functions/ticket-management', {
        action: 'get-ticket-details',
        ticketId,
      });
      return response.data;
    },
    enabled: !!ticketId,
  });
  
  const ticket: TicketDetails | null = ticketData?.ticket || null;
  const checklistStats = ticketData?.checklistStats || { total: 0, completed: 0, required: 0, requiredCompleted: 0 };
  const slaStatusData = ticket ? getSlaStatus(ticket) : null;
  
  if (isLoading) {
    return (
      <Layout
        title={t('ticketDetails.loading', 'Loading...')}
        description={t('ticketDetails.loadingDetails', 'Loading ticket details')}
        icon={<Ticket className="h-4 w-4 text-white" />}
      >
        <div className="space-y-6">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </Layout>
    );
  }
  
  if (!ticket) {
    return (
      <Layout
        title={t('ticketDetails.notFound', 'Ticket not found')}
        description={t('ticketDetails.notFoundDesc', 'The requested ticket was not found')}
        icon={<Ticket className="h-4 w-4 text-white" />}
      >
        <Card className="glass border-primary/20">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-12 w-12 text-orange-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-600 mb-2">{t('ticketDetails.notFound', 'Ticket not found')}</h3>
            <p className="text-sm text-gray-400 mb-4">{t('ticketDetails.notFoundMessage', 'The ticket may have been removed or you do not have permission to access it.')}</p>
            <Button onClick={() => navigate('/tickets')} className="bg-[#003C7D] hover:bg-[#002d5c]">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('ticketDetails.backToTickets', 'Back to Tickets')}
            </Button>
          </CardContent>
        </Card>
      </Layout>
    );
  }
  
  const StatusIcon = STATUS_CONFIG[ticket.status]?.icon || AlertCircle;
  const CategoryIcon = CATEGORY_CONFIG[ticket.category]?.icon || Settings;
  
  return (
    <Layout
      title={ticket.title}
      description={`Ticket ${ticket.id.slice(0, 8)} • ${t(CATEGORY_CONFIG[ticket.category]?.labelKey, ticket.category)}`}
      icon={<Ticket className="h-4 w-4 text-white" />}
    >
      <div className="space-y-6">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/tickets')}
          className="text-gray-500 hover:text-[#003C7D] -ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('ticketDetails.backToTickets', 'Back to Tickets')}
        </Button>
        
        {/* Header Card */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            {/* Left: Main Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-3 h-3 rounded-full ${SEVERITY_CONFIG[ticket.severity]?.color}`} />
                <Badge variant="outline" className={`${CATEGORY_CONFIG[ticket.category]?.color}`}>
                  <CategoryIcon className="h-3 w-3 mr-1" />
                  {t(CATEGORY_CONFIG[ticket.category]?.labelKey, ticket.category)}
                </Badge>
                <span className="text-sm text-gray-400">#{ticket.id.slice(0, 8)}</span>
              </div>
              
              <h1 className="text-2xl font-semibold text-[#1F2937] mb-2">{ticket.title}</h1>
              
              {ticket.description && (
                <p className="text-gray-600 mb-4">{ticket.description}</p>
              )}
              
              {/* Meta Info */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {t('ticketDetails.createdOn', 'Created on')} {formatDateTime(ticket.created_at)}
                </span>
                {ticket.due_date && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {t('ticketDetails.deadline', 'Deadline:')} {formatDate(ticket.due_date)}
                  </span>
                )}
                {ticket.estimated_effort_hours > 0 && (
                  <span className="flex items-center gap-1">
                    <Timer className="h-4 w-4" />
                    {ticket.estimated_effort_hours}h {t('ticketDetails.estimated', 'estimated')}
                  </span>
                )}
              </div>
            </div>
            
            {/* Right: Status & Actions */}
            <div className="flex flex-col items-end gap-3">
              <div className="flex items-center gap-2">
                <Badge className={`${STATUS_CONFIG[ticket.status]?.color} text-white`}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {t(STATUS_CONFIG[ticket.status]?.labelKey, ticket.status)}
                </Badge>
                <Badge variant="outline" className={`${SEVERITY_CONFIG[ticket.severity]?.bgLight} ${SEVERITY_CONFIG[ticket.severity]?.textColor} border-0`}>
                  {t(SEVERITY_CONFIG[ticket.severity]?.labelKey, ticket.severity)}
                </Badge>
              </div>
              
              {/* SLA Status */}
              {slaStatusData && ticket.sla_due_at && (
                <div className={`flex items-center gap-2 text-sm ${slaStatusData.color}`}>
                  <Timer className="h-4 w-4" />
                  <span>{t(slaStatusData.labelKey, slaStatusData.status)}: {slaStatusData.timeRemaining}</span>
                </div>
              )}
              
              {/* Actions */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  className="glass hover-glow"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  onClick={() => setStatusDialogOpen(true)}
                  className="bg-[#003C7D] hover:bg-[#002d5c]"
                >
                  {t('ticketDetails.changeStatus', 'Change Status')}
                </Button>
              </div>
            </div>
          </div>
        </div>

        
        {/* Tabs Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="glass">
            <TabsTrigger value="details" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              {t('ticketDetails.tabDetails', 'Details')}
            </TabsTrigger>
            <TabsTrigger value="comments" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              {t('ticketDetails.tabComments', 'Comments')}
              {ticket.comments.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">{ticket.comments.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="checklist" className="flex items-center gap-2">
              <ListChecks className="h-4 w-4" />
              {t('ticketDetails.tabChecklist', 'Checklist')}
              {checklistStats.total > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                  {checklistStats.completed}/{checklistStats.total}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="relations" className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              {t('ticketDetails.tabRelations', 'Relations')}
              {ticket.source_relations.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">{ticket.source_relations.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="attachments" className="flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              {t('ticketDetails.tabAttachments', 'Attachments')}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              {t('ticketDetails.tabHistory', 'History')}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="details" className="mt-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Ticket Info */}
              <div className="bg-white rounded-xl border border-gray-100 p-6">
                <h3 className="text-lg font-medium text-[#1F2937] mb-4">{t('ticketDetails.ticketInfo', 'Ticket Information')}</h3>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">{t('ticketDetails.severity', 'Severity')}</span>
                    <Badge className={`${SEVERITY_CONFIG[ticket.severity]?.color} text-white`}>
                      {t(SEVERITY_CONFIG[ticket.severity]?.labelKey, ticket.severity)}
                    </Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">{t('ticketDetails.priority', 'Priority')}</span>
                    <span className="text-sm font-medium">{ticket.priority}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">{t('ticketDetails.category', 'Category')}</span>
                    <span className="text-sm font-medium">{t(CATEGORY_CONFIG[ticket.category]?.labelKey, ticket.category)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">{t('ticketDetails.estimatedEffort', 'Estimated Effort')}</span>
                    <span className="text-sm font-medium">{ticket.estimated_effort_hours}h</span>
                  </div>
                  {ticket.business_impact && (
                    <>
                      <Separator />
                      <div>
                        <span className="text-sm text-gray-500 block mb-1">{t('ticketDetails.businessImpact', 'Business Impact')}</span>
                        <span className="text-sm">{ticket.business_impact}</span>
                      </div>
                    </>
                  )}
                  {ticket.affected_resources && ticket.affected_resources.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <span className="text-sm text-gray-500 block mb-2">{t('ticketDetails.affectedResources', 'Affected Resources')}</span>
                        <div className="flex flex-wrap gap-1">
                          {ticket.affected_resources.map((resource, i) => (
                            <Badge key={i} variant="outline" className="text-xs">{resource}</Badge>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
              
              {/* SLA Info */}
              <div className="bg-white rounded-xl border border-gray-100 p-6">
                <h3 className="text-lg font-medium text-[#1F2937] mb-4">{t('ticketDetails.slaMetrics', 'SLA & Metrics')}</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">{t('ticketDetails.slaStatus', 'SLA Status')}</span>
                    {slaStatusData && (
                      <Badge className={`${slaStatusData.status === 'breached' ? 'bg-red-500' : slaStatusData.status === 'at_risk' ? 'bg-orange-500' : 'bg-green-500'} text-white`}>
                        {t(slaStatusData.labelKey, slaStatusData.status)}
                      </Badge>
                    )}
                  </div>
                  {ticket.sla_due_at && (
                    <>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">{t('ticketDetails.slaDueDate', 'SLA Due Date')}</span>
                        <span className="text-sm font-medium">{formatDateTime(ticket.sla_due_at)}</span>
                      </div>
                    </>
                  )}
                  {ticket.first_response_at && (
                    <>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">{t('ticketDetails.firstResponse', 'First Response')}</span>
                        <span className="text-sm font-medium">{formatDateTime(ticket.first_response_at)}</span>
                      </div>
                    </>
                  )}
                  {ticket.time_to_first_response && (
                    <>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">{t('ticketDetails.timeToFirstResponse', 'Time to First Response')}</span>
                        <span className="text-sm font-medium">{ticket.time_to_first_response} min</span>
                      </div>
                    </>
                  )}
                  {ticket.time_to_resolution && (
                    <>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">{t('ticketDetails.timeToResolution', 'Time to Resolution')}</span>
                        <span className="text-sm font-medium">{ticket.time_to_resolution} min</span>
                      </div>
                    </>
                  )}
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">{t('ticketDetails.escalationLevel', 'Escalation Level')}</span>
                    <span className="text-sm font-medium">{ticket.escalation_level}</span>
                  </div>
                </div>
              </div>
              
              {/* Resolution Notes */}
              {ticket.resolution_notes && (
                <div className="bg-white rounded-xl border border-green-200 p-6 lg:col-span-2">
                  <h3 className="text-lg font-medium text-green-700 mb-2 flex items-center gap-2">
                    <CheckCircle className="h-5 w-5" />
                    {t('ticketDetails.resolutionNotes', 'Resolution Notes')}
                  </h3>
                  <p className="text-gray-600 whitespace-pre-wrap">{ticket.resolution_notes}</p>
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="comments" className="mt-6">
            <CommentsSection ticketId={ticket.id} comments={ticket.comments} onRefresh={refetch} />
          </TabsContent>
          
          <TabsContent value="checklist" className="mt-6">
            <ChecklistSection ticketId={ticket.id} items={ticket.checklist_items} onRefresh={refetch} />
          </TabsContent>
          
          <TabsContent value="relations" className="mt-6">
            <RelationsSection ticketId={ticket.id} relations={ticket.source_relations} onRefresh={refetch} />
          </TabsContent>
          
          <TabsContent value="attachments" className="mt-6">
            <AttachmentsSection ticketId={ticket.id} onRefresh={refetch} />
          </TabsContent>
          
          <TabsContent value="history" className="mt-6">
            <HistorySection history={ticket.history} />
          </TabsContent>
        </Tabs>
      </div>
      
      {/* Status Update Dialog */}
      <StatusUpdateDialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        ticketId={ticket.id}
        currentStatus={ticket.status}
        onSuccess={refetch}
      />
    </Layout>
  );
}