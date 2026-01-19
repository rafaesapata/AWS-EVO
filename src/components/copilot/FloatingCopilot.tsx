/**
 * Floating Copilot Chat - Chat flutuante no canto inferior direito
 */

import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useCloudAccount } from "@/contexts/CloudAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { cn } from "@/lib/utils";
import { 
  Bot, 
  Send, 
  X, 
  Minimize2,
  Maximize2,
  Sparkles,
  MessageSquare
} from "lucide-react";

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  suggestions?: string[];
}

export function FloatingCopilot() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { selectedAccountId } = useCloudAccount();
  const { data: organizationId } = useOrganization();
  
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Send message to Bedrock AI
  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      // Preparar histórico das últimas 5 mensagens para contexto
      const recentMessages = messages
        .filter(m => m.id !== 'welcome')
        .slice(-6)
        .map(m => ({
          role: m.type === 'user' ? 'user' : 'assistant',
          content: m.content
        }));

      const response = await apiClient.invoke('bedrock-chat', {
        body: {
          message,
          history: recentMessages,
          accountId: selectedAccountId,
          organizationId,
          language: i18n.language || 'pt' // Pass current language
        }
      });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
    onSuccess: (data) => {
      const assistantMessage: ChatMessage = {
        id: Date.now().toString(),
        type: 'assistant',
        content: data.response,
        timestamp: new Date(),
        suggestions: data.suggestions
      };

      setMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
    },
    onError: (error) => {
      toast({
        title: "Erro no Copilot",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
      setIsTyping(false);
    }
  });

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    setIsTyping(true);

    sendMessageMutation.mutate(inputMessage);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputMessage(suggestion);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize with welcome message when opened
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeMessage: ChatMessage = {
        id: 'welcome',
        type: 'assistant',
        content: t('copilot.welcomeMessage', "Hello! I'm EVO Copilot AI 🤖\n\nI can help with:\n• AWS cost analysis\n• Security and vulnerabilities\n• Resource optimization\n\nHow can I help?"),
        timestamp: new Date(),
        suggestions: [
          t('copilot.suggestions.analyzeCosts', 'Analyze my costs'),
          t('copilot.suggestions.checkSecurity', 'Check security'),
          t('copilot.suggestions.optimizeResources', 'Optimize resources')
        ]
      };
      setMessages([welcomeMessage]);
    }
  }, [isOpen, t]);

  const chatWidth = isExpanded ? 'w-[500px]' : 'w-[380px]';
  const chatHeight = isExpanded ? 'h-[600px]' : 'h-[480px]';

  return (
    <>
      {/* Chat Window */}
      {isOpen && (
        <div 
          className={cn(
            "fixed bottom-24 right-6 z-50 flex flex-col rounded-2xl shadow-2xl border border-primary/20 bg-background/95 backdrop-blur-xl transition-all duration-300",
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
                <h3 className="font-semibold text-sm">EVO Copilot AI</h3>
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
                {isExpanded ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
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
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    message.type === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                      message.type === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-muted/50 border border-border/50 rounded-bl-md'
                    )}
                  >
                    <div className="whitespace-pre-wrap">{message.content}</div>
                    
                    {/* Suggestions */}
                    {message.suggestions && message.suggestions.length > 0 && (
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
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-3 border-t border-border/50 bg-muted/20">
            <div className="flex gap-2">
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Digite sua pergunta..."
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                disabled={isTyping}
                className="bg-background/50 border-border/50 focus-visible:ring-primary/50"
              />
              <Button 
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || isTyping}
                size="icon"
                className="shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              Powered by Amazon Bedrock AI
            </p>
          </div>
        </div>
      )}

      {/* Floating Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg transition-all duration-300 hover:scale-110",
          isOpen 
            ? "bg-muted hover:bg-muted/80" 
            : "bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
        )}
        size="icon"
      >
        {isOpen ? (
          <MessageSquare className="h-6 w-6" />
        ) : (
          <div className="relative">
            <Bot className="h-6 w-6" />
            <Sparkles className="h-3 w-3 absolute -top-1 -right-1 text-yellow-300 animate-pulse" />
          </div>
        )}
      </Button>
    </>
  );
}

export default FloatingCopilot;
