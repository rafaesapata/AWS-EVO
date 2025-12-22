import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, UserMinus, Users, CheckCircle2, XCircle } from "lucide-react";

interface LicenseSeat {
  id: string;
  user_id: string;
  license_key: string;
  allocated_at: string;
  is_active: boolean;
  profiles: {
    full_name: string;
    email: string;
  };
}

interface Profile {
  id: string;
  full_name: string;
  email: string;
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

  // Fetch allocated seats
  const { data: seats = [], isLoading: seatsLoading } = useQuery({
    queryKey: ['license-seats', organizationId],
    queryFn: async () => {
      // First get seats
      const seatsResponse = await apiClient.select('license_seats', { 
        eq: { organization_id: organizationId }
      });
      const seatsData = seatsResponse.data;
      const seatsError = seatsResponse.error;
      if (seatsError) throw seatsError;

      // Then get user profiles separately
      const userIds = seatsData?.map(s => s.user_id) || [];
      if (userIds.length === 0) return [];

      const profilesResponse = await apiClient.select('profiles', { 
        in: { id: userIds }
      });
      const profilesData = profilesResponse.data;
      const profilesError = profilesResponse.error;
      if (profilesError) throw profilesError;

      // Merge the data
      const profilesMap = new Map(profilesData?.map(p => [p.id, p]));
      return seatsData?.map(seat => ({
        ...seat,
        profiles: profilesMap.get(seat.user_id) || { full_name: 'Unknown', email: 'Unknown' }
      })) as LicenseSeat[];
    }
  });

  // Fetch available users (without seats)
  const { data: availableUsers = [] } = useQuery({
    queryKey: ['available-users', organizationId],
    queryFn: async () => {
      const usersResponse = await apiClient.select('profiles', { 
        eq: { organization_id: organizationId }
      });
      const usersData = usersResponse.data;
      const usersError = usersResponse.error;
      if (usersError) throw usersError;

      // Filter out users who already have seats
      const seatedUserIds = new Set(seats.map(s => s.user_id));
      return allProfiles.filter(p => !seatedUserIds.has(p.id)) as Profile[];
    },
    enabled: seats.length > 0
  });

  // Allocate seat mutation
  const allocateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');

      const response = await apiClient.insert(tableName, data);
      const error = response.error;
          },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['license-seats'] });
      queryClient.invalidateQueries({ queryKey: ['available-users'] });
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
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Deallocate seat mutation
  const deallocateMutation = useMutation({
    mutationFn: async (seatId: string) => {
      const response = await apiClient.insert(tableName, data);
      const error = response.error;
          },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['license-seats'] });
      queryClient.invalidateQueries({ queryKey: ['available-users'] });
      toast({
        title: "Assento Liberado",
        description: "O assento foi liberado e está disponível para alocação.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao Liberar",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const allocatedSeats = seats.length;
  const availableSeats = totalSeats - allocatedSeats;

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
              Aloque e gerencie assentos de licença para usuários da organização
            </CardDescription>
          </div>
          <Dialog open={isAllocateOpen} onOpenChange={setIsAllocateOpen}>
            <DialogTrigger asChild>
              <Button disabled={availableSeats === 0 || availableUsers.length === 0}>
                <UserPlus className="h-4 w-4 mr-2" />
                Alocar Assento
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Alocar Assento de Licença</DialogTitle>
                <DialogDescription>
                  Selecione um usuário para alocar um assento de licença
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
                      {availableUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.full_name} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => allocateMutation.mutate(selectedUserId)}
                  disabled={!selectedUserId || allocateMutation.isPending}
                  className="w-full"
                >
                  {allocateMutation.isPending ? "Alocando..." : "Confirmar Alocação"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Seat Statistics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-muted">
            <div className="text-2xl font-bold">{totalSeats}</div>
            <div className="text-sm text-muted-foreground">Total de Assentos</div>
          </div>
          <div className="p-4 rounded-lg bg-primary/10">
            <div className="text-2xl font-bold text-primary">{allocatedSeats}</div>
            <div className="text-sm text-muted-foreground">Assentos Alocados</div>
          </div>
          <div className="p-4 rounded-lg bg-green-500/10">
            <div className="text-2xl font-bold text-green-600">{availableSeats}</div>
            <div className="text-sm text-muted-foreground">Assentos Disponíveis</div>
          </div>
        </div>

        {/* Seats Table */}
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
              {seatsLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    Carregando assentos...
                  </TableCell>
                </TableRow>
              ) : seats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nenhum assento alocado ainda
                  </TableCell>
                </TableRow>
              ) : (
                seats.map((seat) => (
                  <TableRow key={seat.id}>
                    <TableCell className="font-medium">
                      {seat.profiles?.full_name || 'Nome não disponível'}
                    </TableCell>
                    <TableCell>{seat.profiles?.email || 'Email não disponível'}</TableCell>
                    <TableCell>
                      <Badge variant={seat.is_active ? "default" : "secondary"}>
                        {seat.is_active ? (
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
                      {new Date(seat.allocated_at).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deallocateMutation.mutate(seat.id)}
                        disabled={deallocateMutation.isPending}
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
      </CardContent>
    </Card>
  );
}
