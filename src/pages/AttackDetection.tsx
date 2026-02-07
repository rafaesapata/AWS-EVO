import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Shield, Activity, Bell, TrendingUp, Lock, ShieldAlert } from "lucide-react";
import { Layout } from "@/components/Layout";
import { useTranslation } from "react-i18next";

const AttackDetection = () => {
  const { t } = useTranslation();
  
  return (
    <Layout
      title={t('sidebar.attackDetection', 'Detecção de Ataques em Tempo Real')}
      description={t('attackDetection.description', 'Monitoramento contínuo de logs do AWS WAF para identificação proativa de tentativas de ataque')}
      icon={<ShieldAlert className="h-7 w-7" />}
    >
      <div className="space-y-6">

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <Activity className="h-8 w-8 text-primary mb-2" />
            <CardTitle>{t('attackDetection.realTimeAnalysis', 'Real-Time Analysis')}</CardTitle>
            <CardDescription>
              {t('attackDetection.continuousLogProcessing', 'Continuous log processing')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t('attackDetection.realTimeAnalysisDesc', 'The system processes AWS WAF logs in real time, analyzing each blocked or allowed request to identify attack patterns such as SQL Injection, XSS, DDoS, and brute force attempts.')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
            <CardTitle>{t('attackDetection.patternDetection', 'Pattern Detection')}</CardTitle>
            <CardDescription>
              {t('attackDetection.maliciousBehaviorId', 'Malicious behavior identification')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t('attackDetection.patternDetectionDesc', 'Machine learning algorithms identify suspicious patterns: multiple requests from the same IP, exploitation attempts of known vulnerabilities, and anomalous activities based on normal behavior history.')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Bell className="h-8 w-8 text-warning mb-2" />
            <CardTitle>{t('attackDetection.smartAlerts', 'Smart Alerts')}</CardTitle>
            <CardDescription>
              {t('attackDetection.configurableNotifications', 'Configurable notifications')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t('attackDetection.smartAlertsDesc', 'Multi-channel alert system (email, Slack, PagerDuty) with configurable severity. Critical alerts are prioritized and include full attack context for rapid security team response.')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <TrendingUp className="h-8 w-8 text-info mb-2" />
            <CardTitle>{t('attackDetection.advancedAnalytics', 'Advanced Analytics')}</CardTitle>
            <CardDescription>
              {t('attackDetection.metricsAndTrends', 'Metrics and trends')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t('attackDetection.advancedAnalyticsDesc', 'Dashboard with attack visualizations by type, geographic origin, triggered WAF rules, and trends over time. Report export for compliance and auditing.')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Lock className="h-8 w-8 text-success mb-2" />
            <CardTitle>{t('attackDetection.automatedResponse', 'Automated Response')}</CardTitle>
            <CardDescription>
              {t('attackDetection.preventiveBlocking', 'Preventive blocking')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t('attackDetection.automatedResponseDesc', 'Automated actions to mitigate attacks: temporary blocking of suspicious IPs via WAF, dynamic rate limiting, and integration with AWS Shield for large-scale DDoS protection.')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Shield className="h-8 w-8 text-primary mb-2" />
            <CardTitle>{t('attackDetection.threatIntelligence', 'Threat Intelligence')}</CardTitle>
            <CardDescription>
              {t('attackDetection.threatIntelFeeds', 'Threat intelligence feeds')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t('attackDetection.threatIntelligenceDesc', 'Integration with known threat databases, malicious IP lists, and updated attack signatures. Correlation with CVEs and indicators of compromise (IOCs).')}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-warning/30 bg-warning/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge variant="outline" className="bg-warning/20 text-warning-foreground border-warning/30">
              <Lock className="h-3 w-3 mr-1" />
              {t('attackDetection.licenseRequired', 'License Required')}
            </Badge>
            {t('attackDetection.featureAvailable', 'Feature Available')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              {t('attackDetection.licenseDesc', 'The Real-Time Attack Detection feature is ready and available, but is not included in your current license.')}
            </p>
            
            <div className="bg-background/50 rounded-lg p-4 border border-border/50">
              <h3 className="font-semibold mb-2">{t('attackDetection.includedResources', 'Resources included in this feature:')}</h3>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>{t('attackDetection.feature1', 'Real-time AWS WAF log analysis')}</li>
                <li>{t('attackDetection.feature2', 'Attack pattern detection with Machine Learning')}</li>
                <li>{t('attackDetection.feature3', 'Configurable multi-channel smart alerts')}</li>
                <li>{t('attackDetection.feature4', 'Analytics dashboard with metrics and trends')}</li>
                <li>{t('attackDetection.feature5', 'Automated response and preventive blocking')}</li>
                <li>{t('attackDetection.feature6', 'Integration with threat intelligence feeds')}</li>
                <li>{t('attackDetection.feature7', 'Compliance reports (PCI-DSS, SOC 2, ISO 27001)')}</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <a 
                href="https://www.nuevacore.com/contact" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {t('attackDetection.contactSales', 'Contact Sales')}
              </a>
              <a 
                href="mailto:comercial@nuevacore.com" 
                className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                comercial@nuevacore.com
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </Layout>
  );
};

export default AttackDetection;
