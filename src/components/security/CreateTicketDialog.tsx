import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Ticket } from "lucide-react";

interface Finding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  [key: string]: any;
}

interface CreateTicketDialogProps {
  selectedFindings: string[];
  findings: Finding[];
  onCreateTicket: (data: { findingIds: string[], title: string, description: string }) => void;
  isLoading: boolean;
}

export function CreateTicketDialog({ 
  selectedFindings, 
  findings, 
  onCreateTicket, 
  isLoading 
}: CreateTicketDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const selectedFindingObjects = (findings || []).filter(f => selectedFindings.includes(f.id));
  const criticalCount = selectedFindingObjects.filter(f => f.severity === 'critical').length;
  const highCount = selectedFindingObjects.filter(f => f.severity === 'high').length;

  const handleSubmit = () => {
    if (!title.trim()) return;
    
    onCreateTicket({
      findingIds: selectedFindings,
      title: title.trim(),
      description: description.trim()
    });
    
    setOpen(false);
    setTitle("");
    setDescription("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="hover-glow transition-all duration-300 hover:scale-105">
          <Ticket className="h-4 w-4 mr-2" />
          Criar Ticket ({selectedFindings.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Criar Ticket de Remediação</DialogTitle>
          <DialogDescription>
            Criar um ticket para remediar {selectedFindings.length} achados selecionados
            {criticalCount > 0 && ` (${criticalCount} críticos)`}
            {highCount > 0 && ` (${highCount} altos)`}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Título do Ticket</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Corrigir vulnerabilidades críticas de segurança"
              className="mt-1"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium">Descrição</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva as ações necessárias para remediar os achados..."
              className="mt-1"
              rows={4}
            />
          </div>
          
          <div>
            <label className="text-sm font-medium">Achados Incluídos</label>
            <div className="mt-2 max-h-40 overflow-y-auto space-y-2">
              {selectedFindingObjects.map(finding => (
                <div key={finding.id} className="flex items-center gap-2 text-sm p-2 bg-muted/30 rounded">
                  <Badge variant={finding.severity === 'critical' ? 'destructive' : 'secondary'}>
                    {finding.severity}
                  </Badge>
                  <span className="flex-1">{finding.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="hover-glow transition-all duration-300">
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!title.trim() || isLoading}
            className="hover-glow transition-all duration-300 hover:scale-105"
          >
            {isLoading ? "Criando..." : "Criar Ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
