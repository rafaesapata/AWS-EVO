import { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  variant?: "primary" | "success" | "warning" | "critical";
  change?: number;
  trend?: 'up' | 'down';
}

export default function StatsCard({ title, value, icon: Icon, variant = "primary", change, trend }: StatsCardProps) {
  const variants = {
    primary: "glass-hover border-primary/30 bg-gradient-to-br from-primary/5 to-cyan-500/5",
    success: "glass-hover border-success/30 bg-gradient-to-br from-success/5 to-emerald-500/5",
    warning: "glass-hover border-warning/30 bg-gradient-to-br from-warning/5 to-orange-500/5",
    critical: "glass-hover border-destructive/30 bg-gradient-to-br from-destructive/5 to-rose-500/5",
  };

  const iconColors = {
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    critical: "text-destructive",
  };

  const iconBg = {
    primary: "bg-primary/10",
    success: "bg-success/10",
    warning: "bg-warning/10",
    critical: "bg-destructive/10",
  };

  const trendColors = {
    up: "text-success bg-success/10",
    down: "text-destructive bg-destructive/10",
  };

  return (
    <Card className={cn(
      "card-premium relative overflow-hidden group",
      variants[variant]
    )}>
      <div className="absolute inset-0 bg-gradient-mesh opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0 relative z-10">
        <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
          {title}
        </CardTitle>
        <div className={cn(
          "p-3 rounded-xl transition-all duration-300 group-hover:scale-110 group-hover:shadow-glow-sm",
          iconBg[variant]
        )}>
          <Icon className={cn("h-5 w-5", iconColors[variant])} />
        </div>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className="flex items-baseline justify-between">
          <div className={cn("text-3xl font-bold gradient-text")}>
            {value}
          </div>
          {change !== undefined && trend && (
            <div className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold",
              trendColors[trend]
            )}>
              <span className="text-base">{trend === 'up' ? '↑' : '↓'}</span>
              <span>{Math.abs(change)}%</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
