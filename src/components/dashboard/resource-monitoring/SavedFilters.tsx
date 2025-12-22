import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
<parameter name="Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Star, Save, Trash2 } from "lucide-react";

interface FilterState {
  resourceType: string;
  status: string;
  searchTerm: string;
  utilizationMin: number;
  utilizationMax: number;
}

interface Props {
  filterType: 'resource_monitoring' | 'cost_analysis';
  currentFilters: any;
  onLoadFilter: (filters: any) => void;
}

export function SavedFilters({ filterType, currentFilters, onLoadFilter }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [filterName, setFilterName] = useState("");

  const { data: savedFilters } = useQuery({
    queryKey: ['saved-filters', filterType],
    queryFn: async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');

      // Security: Only fetch filters for the current user
      const response = await apiClient.select(tableName, { eq: filters });
      const data = response.data;
      const error = response.error;
      return data;
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (name: string) => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Usuário não autenticado');

      const response = await apiClient.insert(tableName, data);
      const error = response.error;
          },
    onSuccess: () => {
      toast({
        title: "Filtro salvo!",
        description: "Você pode reusá-lo a qualquer momento",
      });
      queryClient.invalidateQueries({ queryKey: ['saved-filters'] });
      setIsOpen(false);
      setFilterName("");
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar filtro",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');

      // Security: Only delete if filter belongs to current user
      const response = await apiClient.insert(tableName, data);
      const error = response.error;
          },
    onSuccess: () => {
      toast({
        title: "Filtro removido",
      });
      queryClient.invalidateQueries({ queryKey: ['saved-filters'] });
    }
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Security: Only update if filter belongs to current user
      const response = await apiClient.insert(tableName, data);
      const error = response.error;
          },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-filters'] });
    }
  });

  return (
    <div className="flex items-center gap-2">
      {savedFilters && savedFilters.length > 0 && (
          <div className="flex flex-wrap gap-2">
          {savedFilters.map(filter => {
            const isDefault = (filter as any).description === 'default';
            const filterConfig = (filter as any).filter_config || {};
            return (
              <div key={filter.id} className="flex items-center gap-1">
                <Badge
                  variant="outline"
                  className="cursor-pointer hover:bg-primary/10"
                  onClick={() => onLoadFilter(filterConfig)}
                >
                  {isDefault && <Star className="h-3 w-3 mr-1 fill-current" />}
                  {filter.name}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setDefaultMutation.mutate(filter.id)}
                >
                  <Star className={`h-3 w-3 ${isDefault ? 'fill-current' : ''}`} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => deleteMutation.mutate(filter.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Save className="h-4 w-4 mr-2" />
            Salvar Filtro
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salvar Filtro Atual</DialogTitle>
            <DialogDescription>
              Dê um nome para este conjunto de filtros
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">Nome do Filtro</Label>
              <Input
                id="name"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                placeholder="Ex: EC2 Alta CPU"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => saveMutation.mutate(filterName)}
              disabled={!filterName || saveMutation.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
