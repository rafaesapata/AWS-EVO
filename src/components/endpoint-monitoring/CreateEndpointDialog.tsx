import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plus, Globe, Loader2, ShieldCheck } from "lucide-react";

const createEndpointSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(100, "Nome muito longo"),
  url: z.string().url("URL inválida").min(1, "URL é obrigatória"),
  timeout: z.number().min(1000, "Mínimo 1000ms").max(60000, "Máximo 60000ms").default(5000),
  is_active: z.boolean().default(true),
  alert_on_failure: z.boolean().default(true),
  monitor_ssl: z.boolean().default(true),
  ssl_alert_days: z.number().min(1, "Mínimo 1 dia").max(90, "Máximo 90 dias").default(30),
});

type CreateEndpointForm = z.infer<typeof createEndpointSchema>;

export function CreateEndpointDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<CreateEndpointForm>({
    resolver: zodResolver(createEndpointSchema),
    defaultValues: {
      name: "",
      url: "",
      timeout: 5000,
      is_active: true,
      alert_on_failure: true,
      monitor_ssl: true,
      ssl_alert_days: 30,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateEndpointForm) => {
      const response = await apiClient.post('/api/functions/monitored-endpoints', data);

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Endpoint criado",
        description: "O monitoramento do endpoint foi configurado com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ['monitored-endpoints'] });
      queryClient.invalidateQueries({ queryKey: ['endpoint-health'] });
      setOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar endpoint",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateEndpointForm) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Endpoint
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Adicionar Endpoint para Monitoramento
          </DialogTitle>
          <DialogDescription>
            Configure um novo endpoint para ser monitorado. Você receberá alertas quando houver problemas.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Endpoint</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: API Principal" {...field} />
                  </FormControl>
                  <FormDescription>
                    Um nome descritivo para identificar este endpoint
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL</FormLabel>
                  <FormControl>
                    <Input placeholder="https://api.exemplo.com/health" {...field} />
                  </FormControl>
                  <FormDescription>
                    URL completa do endpoint a ser monitorado
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="timeout"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Timeout (ms)</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      placeholder="5000" 
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 5000)}
                    />
                  </FormControl>
                  <FormDescription>
                    Tempo máximo de espera pela resposta (1000-60000ms)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Monitoramento Ativo</FormLabel>
                    <FormDescription>
                      Ativar verificações automáticas deste endpoint
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="alert_on_failure"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Alertas de Falha</FormLabel>
                    <FormDescription>
                      Receber notificações quando o endpoint falhar
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="monitor_ssl"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-green-500" />
                      Monitorar SSL
                    </FormLabel>
                    <FormDescription>
                      Verificar validade do certificado SSL/TLS
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {form.watch("monitor_ssl") && (
              <FormField
                control={form.control}
                name="ssl_alert_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alertar antes de expirar (dias)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="30" 
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 30)}
                      />
                    </FormControl>
                    <FormDescription>
                      Receber alerta quando o SSL estiver a X dias de expirar
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Criar Endpoint
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
