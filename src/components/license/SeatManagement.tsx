import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/integrations/aws/api-client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { UserPlus, UserMinus, Users, CheckCircle2, XCircle, Mail, Calendar, Shield } from "lucide-react";

interface LicenseSeat {
  id: string;
  user_id: string;
  license_key: string;
  allocated_at: string;
  is_active: boolean;
  profile?: {
    full_name: string;
    email: string;
    role?: string;
  };
}

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role?: string;
}

interface SeatManagementProps {
  organizationId: string;
  totalSeats: number;
  licenseKey: string;
}

export function SeatManagement({ organizationId, totalSeats, licenseKey }: SeatManagementProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [isAllocateOpen, setIsAllocateOpen] = useState(false);

  // Fetch license and seat data via manage-seats handler
  const { data: seatsData, isLoading: seatsLoading } = useQuery({
    queryKey: ['license-seat-data', organizationId, licenseKey],
    queryFn: async () => {
      const response = await apiClient.invoke<any>('manage-seats', {
        body: { action: 'list' }
      });
      if (response.error) {
        console.error('Error fetching seats data:', response.error);
        return null;
      }
      return response.data;
    },
    enabled: !!organizationId && !!licenseKey
  });

  // Extract license and seat assignments from the handler response
  const license = seatsData?.licenses?.find((l: any) => l.license_key === licenseKey) || null;
  const seatAssignments: LicenseSeat[] = (license?.seats || []).map((s: any) => ({
    id: s.id,
    user_id: s.user_id,
    license_key: licenseKey,
    allocated_at: s.assigned_at,
    is_active: !s.is_orphan,
    profile: {
      full_name: s.user_name || 'Unknown',
      email: s.user_name || '',
      role: s.user_role,
    }
  }));

  // Seats are already enriched from the manage-seats handler response
  const validSeats = seatAssignments.filter(seat => seat.is_active);
  const seats: LicenseSeat[] = seatAssignments;

  // Calculate available users (without seats) from handler data
  const seatedUserIds = new Set(seatAssignments.map(s => s.user_id));
  const availableUsers = (seatsData?.users_without_seats || []).map((u: any) => ({
    ...u,
    email: u.full_name || '',
  })) as Profile[];
  
  // Check if there are invalid seats (orphans)
  const hasInvalidSeats = seatAssignments.some(s => !s.is_active);
  
  const availableSeatsCount = license?.available_seats ?? 0;
  
  // Cleanup mutation for invalid seats
  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.invoke('manage-seats', {
        body: {
          action: 'cleanup',
          licenseKey
        }
      });
      if (response.error) throw response.error;
      return response.data as { removedSeats?: number };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['license-seat-data'] });
      queryClient.invalidateQueries({ queryKey: ['license-data'] });
      queryClient.invalidateQueries({ queryKey: ['real-seat-summary'] });
      toast({
        title: "Limpeza Concluída",
        description: `${result?.removedSeats || 0} assento(s) inválido(s) foram removidos.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro na Limpeza",
        description: error.message || "Falha ao limpar assentos inválidos",
        variant: "destructive",
      });
    }
  });

  // Allocate seat mutation
  const allocateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiClient.invoke('manage-seats', {
        body: {
          action: 'allocate',
          licenseKey,
          userId
        }
      });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['license-seat-data'] });
      queryClient.invalidateQueries({ queryKey: ['license-data'] });
      queryClient.invalidateQueries({ queryKey: ['real-seat-summary'] });
      setIsAllocateOpen(false);
      setSelectedUserId("");
      toast({
        title: "Assento Alocado",
        description: "O assento foi alocado com sucesso ao usuário.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao Alocar",
        description: error.message || "Falha ao alocar assento",
        variant: "destructive",
      });
    }
  });

  // Deallocate seat mutation
  const deallocateMutation = useMutation({
    mutationFn: async (seatId: string) => {
      const response = await apiClient.invoke('manage-seats', {
        body: {
          action: 'deallocate',
          seatId
        }
      });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['license-seat-data'] });
      queryClient.invalidateQueries({ queryKey: ['license-data'] });
      queryClient.invalidateQueries({ queryKey: ['real-seat-summary'] });
      toast({
        title: "Assento Liberado",
        description: "O assento foi liberado e está disponível para alocação.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao Liberar",
        description: error.message || "Falha ao liberar assento",
        variant: "destructive",
      });
    }
  });

  const allocatedSeats = seats.length;
  const isLoading = seatsLoading;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Gerenciamento de Assentos
            </CardTitle>
            <CardDescription>
              Visualize e gerencie os assentos de licença atribuídos aos usuários
            </CardDescription>
          </div>
          <Dialog open={isAllocateOpen} onOpenChange={setIsAllocateOpen}>
            <DialogTrigger asChild>
              <Button disabled={availableSeatsCount === 0 || availableUsers.length === 0}>
                <UserPlus className="h-4 w-4 mr-2" />
                Alocar Assento
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Alocar Assento de Licença</DialogTitle>
                <DialogDescription>
                  Selecione um usuário para alocar um assento de licença.
                  {availableSeatsCount === 0 && (
                    <span className="text-destructive block mt-2">
                      Não há assentos disponíveis. Libere um assento ou aumente o limite da licença.
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Usuário</label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um usuário" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableUsers.length === 0 ? (
                        <SelectItem value="none" disabled>
                          Todos os usuários já possuem assento
                        </SelectItem>
                      ) : (
                        availableUsers.map((user) => (
                          <SelectItem key={user.user_id} value={user.user_id}>
                            <div className="flex items-center gap-2">
                              <span>{user.full_name || user.email}</span>
                              <span className="text-muted-foreground text-xs">
                                ({user.email})
                              </span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => allocateMutation.mutate(selectedUserId)}
                  disabled={!selectedUserId || allocateMutation.isPending || availableSeatsCount === 0}
                  className="w-full"
                >
                  {allocateMutation.isPending ? "Alocando..." : "Confirmar Alocação"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Seat Statistics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-muted">
            <div className="text-2xl font-semibold">{totalSeats}</div>
            <div className="text-sm text-muted-foreground">Total de Assentos</div>
          </div>
          <div className="p-4 rounded-lg bg-primary/10">
            <div className="text-2xl font-semibold text-primary">{allocatedSeats}</div>
            <div className="text-sm text-muted-foreground">Assentos Alocados</div>
          </div>
          <div className="p-4 rounded-lg bg-green-500/10">
            <div className="text-2xl font-semibold text-green-600">{availableSeatsCount}</div>
            <div className="text-sm text-muted-foreground">Assentos Disponíveis</div>
          </div>
        </div>

        {/* Seats Table */}
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Usuários com Assento Atribuído
          </h3>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data de Alocação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : seats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Nenhum assento alocado ainda</p>
                      <p className="text-sm">Clique em "Alocar Assento" para atribuir licenças aos usuários</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  seats.map((seat) => (
                    <TableRow key={seat.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-sm font-semibold text-primary">
                              {(seat.profile?.full_name || 'U')[0].toUpperCase()}
                            </span>
                          </div>
                          <span>{seat.profile?.full_name || 'Nome não disponível'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {seat.profile?.email || '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={seat.is_active !== false ? "default" : "secondary"}>
                          {seat.is_active !== false ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Ativo
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3 mr-1" />
                              Inativo
                            </>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {new Date(seat.allocated_at).toLocaleDateString('pt-BR')}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deallocateMutation.mutate(seat.id)}
                          disabled={deallocateMutation.isPending}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <UserMinus className="h-4 w-4 mr-1" />
                          Liberar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Info about unassigned users */}
        {availableUsers.length > 0 && (
          <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <p className="text-sm text-yellow-700 dark:text-yellow-400">
              <strong>{availableUsers.length}</strong> usuário(s) na organização ainda não possuem assento de licença atribuído.
              {availableSeatsCount > 0 && " Clique em 'Alocar Assento' para atribuir."}
              {availableSeatsCount === 0 && " Libere assentos ou aumente o limite da licença para atribuir a mais usuários."}
            </p>
          </div>
        )}

        {/* Warning about invalid seats */}
        {hasInvalidSeats && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-700 dark:text-red-400 font-medium">
                  Assentos Inválidos Detectados
                </p>
                <p className="text-xs text-red-600 dark:text-red-500 mt-1">
                  {seatAssignments.length - validSeats.length} assento(s) estão atribuídos a usuários de outras organizações.
                  Isso pode afetar a contagem de assentos disponíveis.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => cleanupMutation.mutate()}
                disabled={cleanupMutation.isPending}
                className="text-red-700 border-red-300 hover:bg-red-50"
              >
                {cleanupMutation.isPending ? "Limpando..." : "Limpar"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
