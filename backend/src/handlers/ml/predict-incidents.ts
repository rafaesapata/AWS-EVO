import { getHttpMethod } from '../../lib/middleware.js';
/**
 * Lambda handler for Predict Incidents
 * Analyzes historical data to predict potential incidents using ML-like heuristics
 * Saves predictions to database for frontend display
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { isOrganizationInDemoMode, generateDemoPredictIncidents } from '../../lib/demo-data-service.js';

interface ContributingFactor {
  factor: string;
  value: string;
  weight: number;
}

interface Prediction {
  incident_type: string;
  severity: string;
  probability: number;
  confidence_score: number;
  timeframe: string;
  time_to_incident_hours: number;
  description: string;
  recommendation: string;
  recommended_actions: string;
  contributing_factors: ContributingFactor[];
  indicators: Record<string, any>;
  resource_id?: string;
  resource_name?: string;
  resource_type?: string;
  region?: string;
}

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const startTime = Date.now();
  logger.info('🚀 Predict Incidents started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    const prisma = getPrismaClient();
    
    // Check if organization is in demo mode (FAIL-SAFE: returns false on any error)
    const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
    if (isDemo === true) {
      logger.info('🎭 Returning demo predict incidents data', { organizationId });
      return success(generateDemoPredictIncidents());
    }
    
    const predictions: Prediction[] = [];
    
    // Time ranges for analysis
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // ==================== DATA COLLECTION ====================
    
    // 1. Analyze historical alerts
    const historicalAlerts = await prisma.alert.findMany({
      where: {
        organization_id: organizationId,
        triggered_at: { gte: thirtyDaysAgo },
      },
      orderBy: { triggered_at: 'desc' },
    });
    
    // 2. Analyze critical findings
    const criticalFindings = await prisma.finding.count({
      where: {
        organization_id: organizationId,
        severity: 'critical',
        status: 'pending',
      },
    });
    
    const highFindings = await prisma.finding.count({
      where: {
        organization_id: organizationId,
        severity: 'high',
        status: 'pending',
      },
    });
    
    // 3. Analyze recent drifts
    const recentDrifts = await prisma.driftDetection.count({
      where: {
        organization_id: organizationId,
        detected_at: { gte: thirtyDaysAgo },
        severity: { in: ['critical', 'high'] },
      },
    });
    
    const driftsByType = await prisma.driftDetection.groupBy({
      by: ['drift_type'],
      where: {
        organization_id: organizationId,
        detected_at: { gte: thirtyDaysAgo },
      },
      _count: true,
    });
    
    // 4. Analyze cost trends
    const recentCosts = await prisma.dailyCost.groupBy({
      by: ['date'],
      where: {
        organization_id: organizationId,
        date: { gte: sevenDaysAgo },
      },
      _sum: { cost: true },
      orderBy: { date: 'asc' },
    });
    
    // 5. Analyze endpoint failures
    const failedEndpoints = await prisma.endpointCheckHistory.count({
      where: {
        status: 'down',
        checked_at: { gte: thirtyDaysAgo },
        endpoint: { organization_id: organizationId },
      },
    });
    
    // 6. Analyze security events
    const securityEvents = await prisma.securityEvent.count({
      where: {
        organization_id: organizationId,
        severity: { in: ['critical', 'high'] },
        created_at: { gte: sevenDaysAgo },
      },
    });
    
    // 7. Analyze IAM anomalies
    const iamAnomalies = await prisma.iAMBehaviorAnomaly.count({
      where: {
        organization_id: organizationId,
        detected_at: { gte: thirtyDaysAgo },
      },
    });
    
    // ==================== PREDICTION GENERATION ====================
    
    // Prediction 1: Security Incident Risk - Only if there are actual critical issues
    if (criticalFindings > 0) {
      const probability = Math.min(95, 60 + (criticalFindings * 8));
      const confidence = Math.min(95, 75 + Math.min(criticalFindings, 5) * 4);
      
      predictions.push({
        incident_type: 'security_incident',
        severity: criticalFindings > 5 ? 'critical' : criticalFindings > 2 ? 'high' : 'medium',
        probability,
        confidence_score: confidence,
        timeframe: criticalFindings > 5 ? '12-24 hours' : '24-48 hours',
        time_to_incident_hours: criticalFindings > 5 ? 18 : 36,
        description: `${criticalFindings} critical security finding(s) require immediate attention. Risk of security breach if not addressed.`,
        recommendation: 'Immediate remediation of critical findings required',
        recommended_actions: `1. Review and remediate ${criticalFindings} critical findings immediately\n2. Investigate root cause of each critical finding\n3. Enable enhanced monitoring for affected resources\n4. Review and tighten IAM policies`,
        contributing_factors: [
          { factor: 'Critical Findings', value: `${criticalFindings} pending`, weight: 0.6 },
          { factor: 'High Findings', value: `${highFindings} pending`, weight: 0.2 },
          { factor: 'Security Events', value: `${securityEvents} in 7 days`, weight: 0.2 },
        ],
        indicators: { criticalFindings, highFindings, securityEvents },
        resource_id: 'critical-findings-aggregate',
        resource_name: `${criticalFindings} Critical Security Findings`,
        resource_type: 'Security Hub Findings',
        region: 'All Regions',
      });
    } else if (highFindings > 10) {
      const probability = Math.min(75, 40 + Math.min(highFindings, 30));
      const confidence = Math.min(85, 60 + Math.min(highFindings / 2, 20));
      
      predictions.push({
        incident_type: 'security_risk',
        severity: highFindings > 30 ? 'high' : 'medium',
        probability,
        confidence_score: confidence,
        timeframe: '2-5 days',
        time_to_incident_hours: 72,
        description: `${highFindings} high severity findings detected. While not critical, these should be addressed to prevent escalation.`,
        recommendation: 'Plan remediation of high severity findings',
        recommended_actions: `1. Prioritize and address ${highFindings} high severity findings\n2. Group findings by category for efficient remediation\n3. Schedule regular security reviews\n4. Consider automated remediation for common issues`,
        contributing_factors: [
          { factor: 'High Findings', value: `${highFindings} pending`, weight: 0.7 },
          { factor: 'Security Events', value: `${securityEvents} in 7 days`, weight: 0.3 },
        ],
        indicators: { highFindings, securityEvents },
        resource_id: 'security-findings-aggregate',
        resource_name: `${highFindings} High Severity Findings`,
        resource_type: 'Security Hub Findings',
        region: 'All Regions',
      });
    }
    
    // Prediction 2: Configuration Drift Risk - Only if significant drifts
    if (recentDrifts > 10) {
      const probability = Math.min(85, 35 + (recentDrifts * 2));
      const confidence = Math.min(85, 60 + Math.min(recentDrifts, 15) * 1.5);
      
      const driftFactors: ContributingFactor[] = driftsByType.map(d => ({
        factor: `${d.drift_type} Drifts`,
        value: `${d._count} detected`,
        weight: Math.round((d._count / recentDrifts) * 100) / 100,
      }));
      
      predictions.push({
        incident_type: 'configuration_drift',
        severity: recentDrifts > 30 ? 'high' : 'medium',
        probability,
        confidence_score: confidence,
        timeframe: '2-5 days',
        time_to_incident_hours: 72,
        description: `${recentDrifts} configuration drifts detected in the last 30 days. Infrastructure may deviate from desired state.`,
        recommendation: 'Review and remediate configuration drifts',
        recommended_actions: `1. Review ${recentDrifts} detected drifts\n2. Prioritize critical/high severity drifts\n3. Update IaC templates to match desired state\n4. Implement drift detection automation`,
        contributing_factors: driftFactors.length > 0 ? driftFactors : [
          { factor: 'Total Drifts', value: `${recentDrifts} in 30 days`, weight: 1.0 },
        ],
        indicators: { driftsCount: recentDrifts, driftsByType },
        resource_id: 'drift-detection-aggregate',
        resource_name: `${recentDrifts} Configuration Drifts`,
        resource_type: 'CloudFormation Drift',
        region: 'All Regions',
      });
    }

    // Prediction 3: Cost Spike Risk - Only if significant increase
    if (recentCosts.length >= 3) {
      const costs = recentCosts.map(c => Number(c._sum?.cost) || 0);
      const lastCost = costs[costs.length - 1];
      const avgCost = costs.slice(0, -1).reduce((a, b) => a + b, 0) / (costs.length - 1);
      const costIncrease = avgCost > 0 ? ((lastCost - avgCost) / avgCost) * 100 : 0;
      
      if (costIncrease > 50 && lastCost > 10) {
        const probability = Math.min(80, 40 + costIncrease / 3);
        
        predictions.push({
          incident_type: 'cost_spike',
          severity: costIncrease > 150 ? 'high' : 'medium',
          probability,
          confidence_score: 75,
          timeframe: '2-4 days',
          time_to_incident_hours: 72,
          description: `Significant cost increase detected: $${lastCost.toFixed(2)}/day vs average $${avgCost.toFixed(2)}/day (+${costIncrease.toFixed(0)}%)`,
          recommendation: 'Investigate cost anomaly and optimize resources',
          recommended_actions: `1. Review recent resource provisioning\n2. Check for unused or oversized resources\n3. Analyze cost by service breakdown\n4. Set up cost alerts and budgets`,
          contributing_factors: [
            { factor: 'Current Daily Cost', value: `$${lastCost.toFixed(2)}`, weight: 0.4 },
            { factor: 'Average Daily Cost', value: `$${avgCost.toFixed(2)}`, weight: 0.3 },
            { factor: 'Cost Increase', value: `+${costIncrease.toFixed(0)}%`, weight: 0.3 },
          ],
          indicators: { currentCost: lastCost, avgCost, costIncrease },
          resource_id: 'cost-analysis-aggregate',
          resource_name: `Cost Anomaly (+${costIncrease.toFixed(0)}%)`,
          resource_type: 'AWS Cost Explorer',
          region: 'All Regions',
        });
      }
    }
    
    // Prediction 4: Availability Risk - Only if significant failures
    if (failedEndpoints > 10) {
      const probability = Math.min(75, 35 + (failedEndpoints * 2));
      
      predictions.push({
        incident_type: 'availability_issue',
        severity: failedEndpoints > 30 ? 'high' : 'medium',
        probability,
        confidence_score: 70,
        timeframe: '1-3 days',
        time_to_incident_hours: 48,
        description: `${failedEndpoints} endpoint failures detected in last 30 days. Potential availability concerns.`,
        recommendation: 'Review endpoint health and implement redundancy',
        recommended_actions: `1. Review failing endpoints\n2. Check health check configurations\n3. Implement redundancy for critical services\n4. Set up automated failover`,
        contributing_factors: [
          { factor: 'Failed Checks', value: `${failedEndpoints} in 30 days`, weight: 0.7 },
          { factor: 'Alert History', value: `${historicalAlerts.length} alerts`, weight: 0.3 },
        ],
        indicators: { failedEndpoints, alertCount: historicalAlerts.length },
        resource_id: 'endpoint-health-aggregate',
        resource_name: `${failedEndpoints} Endpoint Failures`,
        resource_type: 'Endpoint Monitoring',
        region: 'All Regions',
      });
    }
    
    // Prediction 5: IAM Security Risk - Only if significant anomalies
    if (iamAnomalies > 5) {
      const probability = Math.min(80, 45 + (iamAnomalies * 5));
      
      predictions.push({
        incident_type: 'iam_security_risk',
        severity: iamAnomalies > 15 ? 'high' : 'medium',
        probability,
        confidence_score: 72,
        timeframe: '2-5 days',
        time_to_incident_hours: 72,
        description: `${iamAnomalies} IAM behavior anomalies detected. Review for potential unauthorized access.`,
        recommendation: 'Review IAM activities and rotate credentials if necessary',
        recommended_actions: `1. Review anomalous IAM activities\n2. Check for unauthorized access patterns\n3. Rotate potentially compromised credentials\n4. Enable MFA for all users`,
        contributing_factors: [
          { factor: 'IAM Anomalies', value: `${iamAnomalies} detected`, weight: 0.8 },
          { factor: 'Security Events', value: `${securityEvents} in 7 days`, weight: 0.2 },
        ],
        indicators: { iamAnomalies, securityEvents },
        resource_id: 'iam-anomaly-aggregate',
        resource_name: `${iamAnomalies} IAM Anomalies`,
        resource_type: 'IAM Access Analyzer',
        region: 'All Regions',
      });
    }
    
    // Sort by probability (highest first)
    predictions.sort((a, b) => b.probability - a.probability);
    
    // ==================== SAVE TO DATABASE ====================
    
    // Clear old predictions for this organization (keep only last 7 days)
    const sevenDaysAgoDate = new Date();
    sevenDaysAgoDate.setDate(sevenDaysAgoDate.getDate() - 7);
    
    await prisma.predictiveIncident.deleteMany({
      where: {
        organization_id: organizationId,
        created_at: { lt: sevenDaysAgoDate },
      },
    });
    
    // Mark existing active predictions as resolved (new scan replaces old)
    await prisma.predictiveIncident.updateMany({
      where: {
        organization_id: organizationId,
        status: 'active',
      },
      data: {
        status: 'resolved',
        resolved_at: new Date(),
      },
    });
    
    // Save new predictions
    const savedPredictions = await Promise.all(
      predictions.map(p => 
        prisma.predictiveIncident.create({
          data: {
            organization_id: organizationId,
            resource_id: p.resource_id,
            resource_name: p.resource_name,
            resource_type: p.resource_type,
            region: p.region,
            incident_type: p.incident_type,
            severity: p.severity,
            probability: p.probability,
            confidence_score: p.confidence_score,
            timeframe: p.timeframe,
            time_to_incident_hours: p.time_to_incident_hours,
            description: p.description,
            recommendation: p.recommendation,
            recommended_actions: p.recommended_actions,
            contributing_factors: p.contributing_factors as any,
            indicators: p.indicators as any,
            status: 'active',
          },
        })
      )
    );
    
    // Save execution history
    const executionTime = (Date.now() - startTime) / 1000;
    
    await prisma.predictiveIncidentsHistory.create({
      data: {
        organization_id: organizationId,
        total_predictions: predictions.length,
        critical_count: predictions.filter(p => p.severity === 'critical').length,
        high_risk_count: predictions.filter(p => p.severity === 'high').length,
        medium_count: predictions.filter(p => p.severity === 'medium').length,
        low_count: predictions.filter(p => p.severity === 'low').length,
        execution_time_seconds: executionTime,
        message: predictions.length > 0 
          ? `Generated ${predictions.length} predictions based on analysis`
          : 'No significant risks detected - infrastructure appears healthy',
        alerts_analyzed: historicalAlerts.length,
        findings_analyzed: criticalFindings + highFindings,
        drifts_analyzed: recentDrifts,
        cost_points_analyzed: recentCosts.length,
      },
    });
    
    logger.info(`✅ Generated and saved ${predictions.length} incident predictions in ${executionTime.toFixed(2)}s`);
    
    // Return response
    const message = predictions.length === 0 
      ? 'Análise concluída. Nenhum risco significativo detectado - sua infraestrutura está saudável!'
      : undefined;
    
    return success({
      success: true,
      predictions_count: predictions.length,
      message,
      predictions: savedPredictions,
      summary: {
        total: predictions.length,
        critical: predictions.filter(p => p.severity === 'critical').length,
        high: predictions.filter(p => p.severity === 'high').length,
        medium: predictions.filter(p => p.severity === 'medium').length,
        low: predictions.filter(p => p.severity === 'low').length,
      },
      analyzedData: {
        alerts: historicalAlerts.length,
        criticalFindings,
        highFindings,
        recentDrifts,
        costDataPoints: recentCosts.length,
        failedEndpoints,
        securityEvents,
        iamAnomalies,
      },
      executionTime: executionTime.toFixed(2) + 's',
    });
    
  } catch (err) {
    logger.error('❌ Predict Incidents error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
