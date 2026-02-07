import { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import i18n from '@/i18n/config';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Knowledge Base Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {i18n.t('knowledgeBase.errorLoading', 'Error Loading')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {i18n.t('knowledgeBase.errorLoadingDesc', 'An error occurred while loading this component. Please try again.')}
            </p>
            {this.state.error && (
              <p className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded">
                {this.state.error.message}
              </p>
            )}
            <Button
              variant="outline"
              onClick={() => this.setState({ hasError: false, error: undefined })}
            >
              {i18n.t('knowledgeBase.tryAgain', 'Try Again')}
            </Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}
