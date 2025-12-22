import { APP_VERSION, getVersionString } from '@/lib/version';
import { Badge } from './ui/badge';

export default function VersionInfo() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>EVO UDS</span>
      <Badge variant="outline" className="text-xs">
        {getVersionString()}
      </Badge>
      {APP_VERSION.environment === 'development' && (
        <Badge variant="secondary" className="text-xs">
          DEV
        </Badge>
      )}
    </div>
  );
}
