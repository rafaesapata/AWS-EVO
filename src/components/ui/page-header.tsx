import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children?: ReactNode;
  className?: string;
  actions?: ReactNode;
}

/**
 * Componente padronizado de cabeçalho de página
 * Garante consistência visual em todo o sistema
 */
export function PageHeader({ 
  title, 
  description, 
  icon: Icon, 
  children,
  className,
  actions 
}: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between mb-6", className)}>
      <div>
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          {Icon && <Icon className="h-8 w-8 text-primary" />}
          {title}
          {children}
        </h2>
        {description && (
          <p className="text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
