import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { InfoTooltip, tooltipContent } from "@/components/ui/info-tooltip";

interface ScoreOverviewProps {
  score: number;
}

export const ScoreOverview = ({ score }: ScoreOverviewProps) => {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  const getRiskLevel = (score: number) => {
    if (score >= 80) return { level: 'Baixo', color: 'bg-success/20 text-success' };
    if (score >= 60) return { level: 'Médio', color: 'bg-warning/20 text-warning' };
    return { level: 'Alto', color: 'bg-destructive/20 text-destructive' };
  };

  const risk = getRiskLevel(score);

  return (
    <div className="p-6 bg-muted/50 rounded-lg space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-medium text-muted-foreground">Score Geral</h3>
            <InfoTooltip title="Como é calculado o Score?">
              {tooltipContent.wellArchitected}
            </InfoTooltip>
          </div>
          <p className={`text-4xl font-bold ${getScoreColor(score)}`}>
            {score.toFixed(0)}/100
          </p>
        </div>
        <Badge className={risk.color}>
          Risco {risk.level}
        </Badge>
      </div>
      <Progress value={score} className="h-3" />
    </div>
  );
};
