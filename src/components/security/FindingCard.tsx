import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { 
 AlertTriangle, 
 CheckCircle, 
 XCircle,
 Bug,
 Info,
 ChevronDown,
 ChevronRight,
 Copy
} from "lucide-react";

interface Finding {
 id: string;
 severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
 title: string;
 description: string;
 details?: any;
 resource_id: string;
 resource_arn?: string;
 service: string;
 category: string;
 scan_type?: string;
 compliance?: string[];
 remediation: string;
 evidence?: any;
 risk_vector?: string;
 source?: string;
 status: string;
 created_at: string;
}

interface FindingCardProps {
 finding: Finding;
 isExpanded: boolean;
 isSelected: boolean;
 onToggleExpansion: () => void;
 onToggleSelection: () => void;
 onCopyToClipboard: (text: string) => void;
}

export function FindingCard({ 
 finding, 
 isExpanded, 
 isSelected, 
 onToggleExpansion, 
 onToggleSelection, 
 onCopyToClipboard 
}: FindingCardProps) {
 const getSeverityIcon = (severity: string) => {
 switch (severity) {
 case 'critical': return <XCircle className="h-4 w-4 text-red-600" />;
 case 'high': return <AlertTriangle className="h-4 w-4 text-red-500" />;
 case 'medium': return <Bug className="h-4 w-4 text-yellow-500" />;
 case 'low': return <Info className="h-4 w-4 text-blue-500" />;
 case 'info': return <CheckCircle className="h-4 w-4 text-green-500" />;
 default: return <Bug className="h-4 w-4 text-gray-500" />;
 }
 };

 const getSeverityBadge = (severity: string) => {
 switch (severity) {
 case 'critical': return <Badge variant="destructive">Crítico</Badge>;
 case 'high': return <Badge variant="destructive">Alto</Badge>;
 case 'medium': return <Badge variant="secondary">Médio</Badge>;
 case 'low': return <Badge variant="outline">Baixo</Badge>;
 case 'info': return <Badge variant="outline">Info</Badge>;
 default: return <Badge variant="outline">{severity}</Badge>;
 }
 };

 const getStatusBadge = (status: string) => {
 switch (status) {
 case 'pending': return <Badge className="bg-yellow-500">Pendente</Badge>;
 case 'in_progress': return <Badge className="bg-blue-500">Em Progresso</Badge>;
 case 'resolved': return <Badge className="bg-green-500">Resolvido</Badge>;
 case 'dismissed': return <Badge variant="outline">Descartado</Badge>;
 default: return <Badge variant="outline">{status}</Badge>;
 }
 };

 let remediation: any;
 try {
 remediation = typeof finding.remediation === 'string' 
 ? JSON.parse(finding.remediation) 
 : finding.remediation;
 } catch {
 remediation = { description: finding.remediation };
 }

 return (
 <div className={`hover:bg-gray-50 border rounded-lg p-4 transition-all duration-300 ${isSelected ? 'ring-2 ring-primary shadow-lg' : ''}`}>
 <div className="flex items-start justify-between">
 <div className="flex items-start gap-3 flex-1">
 <input
 type="checkbox"
 checked={isSelected}
 onChange={onToggleSelection}
 className="mt-1 transition-transform hover:scale-110"
 />
 <div className="p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
 {getSeverityIcon(finding.severity)}
 </div>
 <div className="space-y-2 flex-1">
 <div className="flex items-start justify-between">
 <h4 className="font-semibold text-sm">{finding.title}</h4>
 <div className="flex items-center gap-2">
 {getSeverityBadge(finding.severity)}
 {getStatusBadge(finding.status)}
 </div>
 </div>
 
 <p className="text-sm text-muted-foreground">{finding.description}</p>
 
 <div className="flex items-center gap-4 text-xs text-muted-foreground">
 <span><strong>Serviço:</strong> {finding.service}</span>
 <span><strong>Categoria:</strong> {finding.category}</span>
 <span><strong>Recurso:</strong> {finding.resource_id}</span>
 </div>

 {finding.compliance && finding.compliance.length > 0 && (
 <div className="flex gap-2 flex-wrap">
 {finding.compliance.map((comp, index) => (
 <Badge key={index} variant="outline" className="text-xs hover:bg-primary/10 transition-colors">
 {comp}
 </Badge>
 ))}
 </div>
 )}
 </div>
 </div>
 
 <Button
 variant="ghost"
 size="sm"
 onClick={onToggleExpansion}
 className=" transition-all duration-300 hover:scale-110"
 >
 {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
 </Button>
 </div>

 <Collapsible open={isExpanded}>
 <CollapsibleContent className="mt-4 space-y-4">
 <Separator />
 
 {/* Details */}
 {finding.details && (
 <div>
 <h5 className="font-semibold text-sm mb-2">Detalhes Técnicos</h5>
 <div className="bg-muted/30 rounded p-3 text-sm hover:bg-gray-50">
 {typeof finding.details === 'object' ? (
 <pre className="whitespace-pre-wrap">{JSON.stringify(finding.details, null, 2)}</pre>
 ) : (
 <p>{finding.details}</p>
 )}
 </div>
 </div>
 )}

 {/* Resource Information */}
 <div>
 <h5 className="font-semibold text-sm mb-2">Informações do Recurso</h5>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
 <div>
 <strong>Resource ID:</strong>
 <div className="flex items-center gap-2 mt-1">
 <code className="bg-muted px-2 py-1 rounded text-xs hover:bg-gray-50">{finding.resource_id}</code>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => onCopyToClipboard(finding.resource_id)}
 className=" transition-all duration-300 hover:scale-110"
 >
 <Copy className="h-3 w-3" />
 </Button>
 </div>
 </div>
 {finding.resource_arn && (
 <div>
 <strong>Resource ARN:</strong>
 <div className="flex items-center gap-2 mt-1">
 <code className="bg-muted px-2 py-1 rounded text-xs break-all hover:bg-gray-50">{finding.resource_arn}</code>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => onCopyToClipboard(finding.resource_arn)}
 className=" transition-all duration-300 hover:scale-110"
 >
 <Copy className="h-3 w-3" />
 </Button>
 </div>
 </div>
 )}
 </div>
 </div>

 {/* Remediation */}
 {remediation && (
 <div>
 <h5 className="font-semibold text-sm mb-2">Ações de Remediação</h5>
 <div className="bg-blue-50 dark:bg-blue-950/30 rounded p-4 space-y-3 hover:bg-gray-50">
 {remediation.description && (
 <p className="text-sm">{remediation.description}</p>
 )}
 
 {remediation.steps && remediation.steps.length > 0 && (
 <div>
 <strong className="text-sm">Passos:</strong>
 <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
 {remediation.steps.map((step: string, index: number) => (
 <li key={index}>{step}</li>
 ))}
 </ol>
 </div>
 )}
 
 {remediation.cli_command && (
 <div>
 <strong className="text-sm">Comando CLI:</strong>
 <div className="flex items-center gap-2 mt-2">
 <code className="bg-muted px-3 py-2 rounded text-xs flex-1 overflow-x-auto hover:bg-gray-50">
 {remediation.cli_command}
 </code>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => onCopyToClipboard(remediation.cli_command)}
 className=" transition-all duration-300 hover:scale-110"
 >
 <Copy className="h-3 w-3" />
 </Button>
 </div>
 </div>
 )}
 
 {remediation.estimated_effort && (
 <div className="text-sm">
 <strong>Esforço Estimado:</strong> {remediation.estimated_effort}
 </div>
 )}
 </div>
 </div>
 )}

 {/* Evidence */}
 {finding.evidence && (
 <div>
 <h5 className="font-semibold text-sm mb-2">Evidências</h5>
 <div className="bg-muted/30 rounded p-3 text-sm hover:bg-gray-50">
 <pre className="whitespace-pre-wrap">{JSON.stringify(finding.evidence, null, 2)}</pre>
 </div>
 </div>
 )}
 </CollapsibleContent>
 </Collapsible>
 </div>
 );
}
