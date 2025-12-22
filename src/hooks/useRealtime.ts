/**
 * Real-time WebSocket Hook
 * Manages WebSocket connections and real-time updates
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOrganization } from './useOrganization';
import { toast } from 'sonner';

interface RealtimeEvent {
  type: 'SCAN_PROGRESS' | 'SCAN_COMPLETE' | 'ALERT' | 'COST_UPDATE' | 'FINDING' | 'SYSTEM_NOTIFICATION';
  payload: any;
  timestamp: string;
  organizationId: string;
  userId?: string;
}

interface UseRealtimeOptions {
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export function useRealtime(options: UseRealtimeOptions = {}) {
  const {
    autoReconnect = true,
    reconnectInterval = 5000,
    maxReconnectAttempts = 10
  } = options;

  const ws = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const { organizationId } = useOrganization();
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<NodeJS.Timeout>();

  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data: RealtimeEvent = JSON.parse(event.data);
      setLastEvent(data);

      // Invalidar queries baseado no tipo de evento
      switch (data.type) {
        case 'SCAN_PROGRESS':
          // Atualizar progresso do scan em tempo real
          queryClient.setQueryData(
            ['scan-progress', data.payload.scanId],
            data.payload
          );
          break;

        case 'SCAN_COMPLETE':
          queryClient.invalidateQueries({ queryKey: ['security-scans'] });
          queryClient.invalidateQueries({ queryKey: ['findings'] });
          queryClient.invalidateQueries({ queryKey: ['security-posture'] });
          
          toast.success(`Security scan completed with ${data.payload.findingsCount} findings`);
          break;

        case 'COST_UPDATE':
          queryClient.invalidateQueries({ queryKey: ['costs'] });
          queryClient.invalidateQueries({ queryKey: ['cost-analysis'] });
          queryClient.invalidateQueries({ queryKey: ['budget-forecast'] });
          break;

        case 'ALERT':
          queryClient.invalidateQueries({ queryKey: ['alerts'] });
          
          // Mostrar toast baseado na severidade
          const severity = data.payload.severity;
          if (severity === 'critical') {
            toast.error(data.payload.title, {
              description: data.payload.message,
              duration: 10000,
            });
          } else if (severity === 'high') {
            toast.warning(data.payload.title, {
              description: data.payload.message,
            });
          } else {
            toast.info(data.payload.title, {
              description: data.payload.message,
            });
          }
          break;

        case 'FINDING':
          queryClient.invalidateQueries({ queryKey: ['findings'] });
          
          if (data.payload.severity === 'critical') {
            toast.error('Critical security finding detected', {
              description: data.payload.title,
            });
          }
          break;

        case 'SYSTEM_NOTIFICATION':
          toast.info(data.payload.title, {
            description: data.payload.message,
          });
          break;
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }, [queryClient]);

  const connect = useCallback(() => {
    if (!organizationId) {
      console.warn('Cannot connect to WebSocket: no organization ID');
      return;
    }

    if (ws.current?.readyState === WebSocket.CONNECTING || ws.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionState('connecting');

    const wsUrl = `${import.meta.env.VITE_WS_URL}?orgId=${organizationId}`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      setConnectionState('connected');
      reconnectAttempts.current = 0;
      console.log('WebSocket connected');
    };

    ws.current.onmessage = handleMessage;

    ws.current.onclose = (event) => {
      setConnectionState('disconnected');
      console.log('WebSocket disconnected:', event.code, event.reason);

      // Auto-reconnect se habilitado
      if (autoReconnect && reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current++;
        console.log(`Attempting to reconnect (${reconnectAttempts.current}/${maxReconnectAttempts})...`);
        
        reconnectTimer.current = setTimeout(() => {
          connect();
        }, reconnectInterval);
      }
    };

    ws.current.onerror = (error) => {
      setConnectionState('error');
      console.error('WebSocket error:', error);
    };
  }, [organizationId, handleMessage, autoReconnect, maxReconnectAttempts, reconnectInterval]);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
    }
    
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    
    setConnectionState('disconnected');
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttempts.current = 0;
    setTimeout(connect, 1000);
  }, [connect, disconnect]);

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
    };
  }, []);

  return {
    connectionState,
    lastEvent,
    isConnected: connectionState === 'connected',
    isConnecting: connectionState === 'connecting',
    reconnect,
    disconnect,
  };
}