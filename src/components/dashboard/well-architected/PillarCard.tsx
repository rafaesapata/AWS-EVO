import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { LucideIcon } from "lucide-react";

interface PillarCardProps {
 pillar: {
 id: string;
 pillar: string;
 score: number;
 checks_passed: number;
 checks_failed: number;
 critical_issues: number;
 recommendations: any[];
 };
 icon: LucideIcon;
 name: string;
 isExpanded: boolean;
 onToggle: () => void;
}

export const PillarCard = ({ pillar, icon: Icon, name, isExpanded, onToggle }: PillarCardProps) => {
 const getScoreColor = (score: number) => {
 if (score >= 80) return 'text-success';
 if (score >= 60) return 'text-warning';
 return 'text-destructive';
 };

 return (
 <Collapsible open={isExpanded} onOpenChange={onToggle}>
 <Card className=" transition-all">
 <CollapsibleTrigger asChild>
 <div className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3 flex-1">
 <Icon className="h-5 w-5 text-primary " />
 <div className="flex-1">
 <h4 className="font-semibold text-sm">{name}</h4>
 <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
 <span className="tabular-nums">✓ {pillar.checks_passed} checks</span>
 <span className="tabular-nums">✗ {pillar.checks_failed} falhas</span>
 {pillar.critical_issues > 0 && (
 <Badge variant="destructive" className="text-xs py-0 ">
 {pillar.critical_issues} críticos
 </Badge>
 )}
 </div>
 </div>
 </div>
 <div className="flex items-center gap-3">
 <div className="text-right">
 <p className={`text-2xl font-semibold tabular-nums ${getScoreColor(pillar.score)}`}>
 {pillar.score.toFixed(0)}
 </p>
 <Progress value={pillar.score} className="h-2 w-24 mt-1 " />
 </div>
 {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
 </div>
 </div>
 </div>
 </CollapsibleTrigger>
 <CollapsibleContent>
 <div className="px-4 pb-4 pt-2 border-t border-border ">
 <div className="space-y-2">
 {pillar.recommendations && pillar.recommendations.length > 0 ? (
 pillar.recommendations.map((rec: any, idx: number) => (
 <div key={idx} className="p-3 bg-muted/30 rounded text-sm transition-all hover:bg-muted/50 hover:translate-x-1">
 <div className="flex items-start gap-2">
 <AlertTriangle className={`h-4 w-4 text-warning mt-0.5 flex-shrink-0 ${rec.severity === 'critical' ? '' : ''}`} />
 <div className="flex-1">
 <p className="font-medium">{rec.check_name}</p>
 <p className="text-muted-foreground mt-1">{rec.description}</p>
 {rec.recommendation && (
 <p className="text-xs mt-2 text-primary">
 💡 {rec.recommendation}
 </p>
 )}
 </div>
 <Badge variant={rec.severity === 'critical' ? 'destructive' : 'secondary'} className={rec.severity === 'critical' ? '' : ''}>
 {rec.severity}
 </Badge>
 </div>
 </div>
 ))
 ) : (
 <p className="text-sm text-muted-foreground text-center py-4">
 ✅ Nenhum problema encontrado neste pilar
 </p>
 )}
 </div>
 </div>
 </CollapsibleContent>
 </Card>
 </Collapsible>
 );
};
