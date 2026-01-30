/**
 * Unified EVO Copilot - Combines beautiful FloatingCopilot UI with proactive notifications
 * Features:
 * - Beautiful glassmorphism design with rounded corners
 * - Proactive AI notifications with priority badges
 * - Action buttons for notifications (security scan, compliance scan, etc.)
 * - Chat with Amazon Bedrock AI
 * - Expand/minimize functionality
 * - Quick suggestions
 */

import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import i18n from '@/i18n/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiClient, getErrorMessage } from '@/integrations/aws/api-client';
import { useCloudAccount } from '@/contexts/CloudAccountContext';
import { useOrganization } from '@/hooks/useOrganization';
import { AINotification, useAINotifications } from '@/hooks/useAINotifications';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Bot,
  Send,
  X,
  Minimize2,
  Maximize2,
  Sparkles,
  MessageSquare,
  AlertTriangle,
  Info,
  AlertCircle,
  CheckCircle,
  Loader2,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  suggestions?: string[];
  notification?: AINotification;
  isLoading?: boolean;
  actions?: Array<{
    label: string;
    variant?: 'default' | 'outline' | 'destructive';
    action: () => void;
  }>;
}

const priorityConfig = {
  critical: {
    icon: AlertCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    badgeClass: 'bg-red-500/20 text-red-500 border-red-500/30',
  },
  high: {
    icon: AlertTriangle,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    badgeClass: 'bg-orange-500/20 text-orange-500 border-orange-500/30',
  },
  medium: {
    icon: Info,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    badgeClass: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
  },
  low: {
    icon: CheckCircle,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    badgeClass: 'bg-blue-500/20 text-blue-500 border-blue-500/30',
  },
};

export function UnifiedCopilot() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectedAccountId } = useCloudAccount();
  const { data: organizationId } = useOrganization();
  const { notifications, unreadCount, markAsRead, markAsActioned, dismiss, refetch } = useAINotifications();

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [hasNewNotification, setHasNewNotification] = useState(false);
  const [lastUnreadCount, setLastUnreadCount] = useState(0);
  const [processedNotifications, setProcessedNotifications] = useState<Set<string>>(new Set());
  const [welcomeShown, setWelcomeShown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Pulse effect when new notification arrives
  useEffect(() => {
    if (unreadCount > lastUnreadCount) {
      setHasNewNotification(true);

      // Auto-open for high priority notifications
      const highPriorityNotification = notifications.find(
        (n: AINotification) => n.priority === 'critical' || n.priority === 'high'
      );

      if (highPriorityNotification && !isOpen) {
        const timer = setTimeout(() => {
          setIsOpen(true);
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
    setLastUnreadCount(unreadCount);
  }, [unreadCount, notifications, isOpen, lastUnreadCount]);

  // Reset pulse animation
  useEffect(() => {
    if (hasNewNotification) {
      const timer = setTimeout(() => {
        setHasNewNotification(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [hasNewNotification]);

  // Add notifications as messages when dialog opens
  useEffect(() => {
    if (isOpen) {
      // Refetch notifications when opening to get latest
      refetch();
    }
  }, [isOpen, refetch]);

  // Process notifications into messages - runs BEFORE welcome message
  useEffect(() => {
    if (isOpen && notifications.length > 0) {
      const newNotifications = notifications.filter(
        (n: AINotification) => !processedNotifications.has(n.id) && n.status !== 'dismissed'
      );

      if (newNotifications.length > 0) {
        const notificationMessages: ChatMessage[] = newNotifications.map((notification: AINotification) => ({
          id: `notification-${notification.id}`,
          type: 'assistant' as const,
          content: notification.message,
          timestamp: new Date(notification.created_at),
          notification,
          actions: notification.action_type
            ? [
                {
                  label: notification.suggested_action || t('ai.executeAction', 'Executar'),
                  action: () => handleNotificationAction(notification),
                },
                {
                  label: t('ai.dismiss', 'Dismiss'),
                  variant: 'outline' as const,
                  action: () => handleDismiss(notification),
                },
              ]
            : [
                {
                  label: t('ai.gotIt', 'OK'),
                  variant: 'outline' as const,
                  action: () => handleDismiss(notification),
                },
              ],
        }));

        setMessages(prev => [...notificationMessages, ...prev]);
        setProcessedNotifications(prev => {
          const newSet = new Set(prev);
          newNotifications.forEach((n: AINotification) => newSet.add(n.id));
          return newSet;
        });

        // Mark as read
        newNotifications.forEach((n: AINotification) => markAsRead(n.id));
      }
    }
  }, [isOpen, notifications, processedNotifications, markAsRead, t]);

  // Initialize with welcome message - only after notifications are processed
  useEffect(() => {
    if (isOpen && !welcomeShown) {
      // Small delay to allow notifications to be processed first
      const timer = setTimeout(() => {
        // Only add welcome if no messages exist yet
        setMessages(prev => {
          if (prev.length === 0) {
            return [{
              id: 'welcome',
              type: 'assistant',
              content: t(
                'copilot.welcomeMessage',
                "Olá! Sou o EVO Copilot AI 🤖\n\nPosso ajudar com:\n• Análise de custos AWS\n• Segurança e vulnerabilidades\n• Otimização de recursos\n\nComo posso ajudar?"
              ),
              timestamp: new Date(),
              suggestions: [
                t('copilot.suggestions.analyzeCosts', 'Analisar meus custos'),
                t('copilot.suggestions.checkSecurity', 'Verificar segurança'),
                t('copilot.suggestions.optimizeResources', 'Otimizar recursos'),
              ],
            }];
          }
          return prev;
        });
        setWelcomeShown(true);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, welcomeShown, t]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const recentMessages = messages
        .filter(m => m.id !== 'welcome' && !m.id.startsWith('notification-'))
        .slice(-6)
        .map(m => ({
          role: m.type === 'user' ? 'user' : 'assistant',
          content: m.content,
        }));

      const response = await apiClient.invoke('bedrock-chat', {
        body: {
          message,
          history: recentMessages,
          accountId: selectedAccountId,
          organizationId,
          language: i18n.language || 'pt',
        },
      });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data as { response: string; suggestions?: string[] };
    },
    onSuccess: (data) => {
      const assistantMessage: ChatMessage = {
        id: Date.now().toString(),
        type: 'assistant',
        content: data.response,
        timestamp: new Date(),
        suggestions: data.suggestions,
      };

      setMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
    },
    onError: error => {
      toast.error(error instanceof Error ? error.message : t('ai.chatError', 'Erro ao processar mensagem'));
      setIsTyping(false);
    },
  });

  const handleNotificationAction = async (notification: AINotification) => {
    const actionType = notification.action_type;
    const actionParams = notification.action_params || {};

    // Add loading message
    const loadingId = `loading-${Date.now()}`;
    setMessages(prev => [
      ...prev,
      {
        id: loadingId,
        type: 'assistant',
        content: t('ai.executingAction', 'Executando ação...'),
        timestamp: new Date(),
        isLoading: true,
      },
    ]);

    try {
      let successMessage = '';

      switch (actionType) {
        case 'security_scan':
          await apiClient.invoke('start-security-scan', { body: actionParams });
          successMessage = t(
            'ai.securityScanStarted',
            '✅ Scan de segurança iniciado! Você pode acompanhar o progresso na página de Segurança.'
          );
          break;

        case 'compliance_scan':
          await apiClient.invoke('start-compliance-scan', { body: actionParams });
          successMessage = t(
            'ai.complianceScanStarted',
            '✅ Verificação de compliance iniciada! Você pode acompanhar o progresso na página de Compliance.'
          );
          break;

        case 'cost_analysis':
          await apiClient.invoke('fetch-daily-costs', { body: { ...actionParams, incremental: true } });
          successMessage = t(
            'ai.costAnalysisStarted',
            '✅ Análise de custos atualizada! Você pode ver os resultados no Dashboard de Custos.'
          );
          break;

        case 'navigate':
          const path = actionParams.path as string;
          if (path) {
            // Map old/invalid paths to correct ones
            const pathMapping: Record<string, string> = {
              // Security
              '/security': '/security-scans',
              '/security-scan': '/security-scans',
              '/findings': '/security-scans',
              // Cost
              '/settings': '/cloud-credentials',
              '/aws-credentials': '/cloud-credentials',
              '/credentials': '/cloud-credentials',
              '/ri-sp-analysis': '/ri-savings-plans',
              '/ri-sp': '/ri-savings-plans',
              '/savings-plans': '/ri-savings-plans',
              '/costs': '/cost-analysis',
              '/cost': '/cost-analysis',
              // Compliance
              '/compliance-scan': '/compliance',
              '/compliance-scans': '/compliance',
              // Dashboard
              '/home': '/dashboard',
              '/index': '/dashboard',
            };
            const correctedPath = pathMapping[path] || path;
            
            setIsOpen(false);
            navigate(correctedPath);
            successMessage = t('ai.navigating', 'Redirecionando...');
          }
          break;

        default:
          successMessage = t('ai.actionCompleted', '✅ Ação executada com sucesso!');
      }

      markAsActioned(notification.id);

      // Remove loading and add success
      setMessages(prev =>
        prev
          .filter(m => m.id !== loadingId)
          .concat({
            id: `success-${Date.now()}`,
            type: 'assistant',
            content: successMessage,
            timestamp: new Date(),
          })
      );
    } catch (error) {
      console.error('Error executing action:', error);

      // Remove loading and add error
      setMessages(prev =>
        prev
          .filter(m => m.id !== loadingId)
          .concat({
            id: `error-${Date.now()}`,
            type: 'assistant',
            content: t('ai.actionError', '❌ Ocorreu um erro ao executar a ação. Por favor, tente novamente.'),
            timestamp: new Date(),
          })
      );

      toast.error(t('ai.actionErrorToast', 'Erro ao executar ação'));
    }
  };

  const handleDismiss = (notification: AINotification) => {
    dismiss(notification.id);
    setMessages(prev => prev.filter(m => m.id !== `notification-${notification.id}`));
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isTyping) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsTyping(true);

    sendMessageMutation.mutate(inputMessage);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputMessage(suggestion);
  };

  const chatWidth = isExpanded ? 'w-[500px]' : 'w-[400px]';
  const chatHeight = isExpanded ? 'h-[650px]' : 'h-[520px]';

  return (
    <>
      {/* Chat Window */}
      {isOpen && (
        <div
          className={cn(
            'fixed bottom-24 right-6 z-50 flex flex-col rounded-2xl shadow-2xl border border-primary/20 bg-background/95 backdrop-blur-xl transition-all duration-300',
            chatWidth,
            chatHeight
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-gradient-to-r from-primary/10 to-primary/5 rounded-t-2xl">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Bot className="h-6 w-6 text-primary" />
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background"></span>
              </div>
              <div>
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  EVO Copilot AI
                  {unreadCount > 0 && (
                    <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                      {unreadCount}
                    </Badge>
                  )}
                </h3>
                <p className="text-xs text-muted-foreground">{t('copilot.online', 'Online')}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-primary/10"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map(message => (
                <div
                  key={message.id}
                  className={cn('flex', message.type === 'user' ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
                      message.type === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : message.notification
                        ? cn(
                            'border rounded-bl-md',
                            priorityConfig[message.notification.priority].bgColor,
                            priorityConfig[message.notification.priority].borderColor
                          )
                        : 'bg-muted/50 border border-border/50 rounded-bl-md'
                    )}
                  >
                    {/* Notification header */}
                    {message.notification && (
                      <div className="flex items-center gap-2 mb-2">
                        {(() => {
                          const config = priorityConfig[message.notification.priority];
                          const Icon = config.icon;
                          return <Icon className={cn('h-4 w-4', config.color)} />;
                        })()}
                        <span className="text-xs font-semibold">{message.notification.title}</span>
                        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', priorityConfig[message.notification.priority].badgeClass)}>
                          {message.notification.priority}
                        </Badge>
                      </div>
                    )}

                    {/* Content */}
                    {message.isLoading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{message.content}</span>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    )}

                    {/* Actions for notifications */}
                    {message.actions && message.actions.length > 0 && (
                      <div className="flex flex-col gap-2 mt-3">
                        {message.actions.map((action, idx) => (
                          <Button
                            key={idx}
                            size="sm"
                            variant={action.variant || 'default'}
                            onClick={action.action}
                            className="text-xs h-auto py-1.5 px-3 whitespace-normal text-left justify-start"
                          >
                            <span className="line-clamp-2">{action.label}</span>
                          </Button>
                        ))}
                      </div>
                    )}

                    {/* Suggestions */}
                    {message.suggestions && message.suggestions.length > 0 && !message.notification && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {message.suggestions.map((suggestion, idx) => (
                          <Button
                            key={idx}
                            variant="outline"
                            size="sm"
                            onClick={() => handleSuggestionClick(suggestion)}
                            className="text-xs h-7 px-2 bg-background/50 hover:bg-primary/10 hover:border-primary/50"
                          >
                            {suggestion}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-muted/50 border border-border/50 rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                      <div
                        className="w-2 h-2 bg-primary rounded-full animate-bounce"
                        style={{ animationDelay: '0.15s' }}
                      ></div>
                      <div
                        className="w-2 h-2 bg-primary rounded-full animate-bounce"
                        style={{ animationDelay: '0.3s' }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-3 border-t border-border/50 bg-muted/20 rounded-b-2xl">
            <div className="flex gap-2">
              <Input
                value={inputMessage}
                onChange={e => setInputMessage(e.target.value)}
                placeholder={t('ai.inputPlaceholder', 'Pergunte sobre custos, segurança, otimizações...')}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                disabled={isTyping}
                className="bg-background/50 border-border/50 focus-visible:ring-primary/50"
              />
              <Button onClick={handleSendMessage} disabled={!inputMessage.trim() || isTyping} size="icon" className="shrink-0">
                {isTyping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              {t('copilot.poweredBy', 'Powered by Amazon Bedrock AI')}
            </p>
          </div>
        </div>
      )}

      {/* Floating Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg transition-all duration-300 hover:scale-110',
          isOpen
            ? 'bg-muted hover:bg-muted/80'
            : 'bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70',
          hasNewNotification && !isOpen && 'animate-pulse ring-4 ring-primary/30'
        )}
        size="icon"
      >
        {isOpen ? (
          <MessageSquare className="h-6 w-6" />
        ) : (
          <div className="relative">
            <Bot className="h-6 w-6" />
            <Sparkles className="h-3 w-3 absolute -top-1 -right-1 text-yellow-300 animate-pulse" />

            {/* Notification badge */}
            {unreadCount > 0 && (
              <Badge
                className={cn(
                  'absolute -top-2 -right-2 h-5 w-5 p-0',
                  'flex items-center justify-center',
                  'bg-red-500 text-white text-xs font-bold border-0',
                  'animate-bounce'
                )}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </Badge>
            )}
          </div>
        )}
      </Button>
    </>
  );
}

export default UnifiedCopilot;
