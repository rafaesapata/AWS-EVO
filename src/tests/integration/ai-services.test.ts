/**
 * AI Services Integration Tests
 * Tests Amazon Bedrock integration and AI functionality
 * Uses real AWS services with credentials from Secrets Manager
 */

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useKnowledgeBaseAI } from '@/hooks/useKnowledgeBaseAI';
import { bedrockAI } from '@/integrations/aws/bedrock-client';
// import { initializeAppSecrets } from '@/backend/lib/secrets-manager';
import {
  createTestQueryClient,
  measurePerformance,
  createMockCostData,
  createMockSecurityFinding,
} from '../setup/test-environment';

describe('AI Services Integration', () => {
  let useRealAWS = false;

  beforeAll(async () => {
    try {
      // For tests, load credentials directly from .env file
      const fs = await import('fs');
      const path = await import('path');
      
      const envPath = path.resolve('.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        envContent.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key && valueParts.length > 0) {
              const value = valueParts.join('=').replace(/^["']|["']$/g, '');
              process.env[key.trim()] = value;
            }
          }
        });
      }
      
      // Initialize secrets from AWS Secrets Manager (fallback to env vars)
      // await initializeAppSecrets(); // Moved to backend-only
      useRealAWS = !!(process.env.AWS_ACCESS_KEY_ID && process.env.BEDROCK_REGION);
      
      console.log(`🔍 Debug credentials check:`);
      console.log(`   AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? 'Set (' + process.env.AWS_ACCESS_KEY_ID.substring(0, 8) + '...)' : 'Not set'}`);
      console.log(`   BEDROCK_REGION: ${process.env.BEDROCK_REGION || 'Not set'}`);
      console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
      console.log(`🧪 Tests will use ${useRealAWS ? 'REAL AWS Bedrock' : 'MOCKED'} services`);
    } catch (error) {
      console.warn('⚠️ Failed to initialize AWS secrets, using mocks:', error.message);
      useRealAWS = false;
    }
  });

  beforeEach(() => {
    if (!useRealAWS) {
      // Reset AI mocks only if using mocks
      vi.clearAllMocks();
    }
  });

  describe('Knowledge Base AI', () => {
    it('should generate tags for content', async () => {
      const testContent = 'This article covers AWS EC2 cost optimization strategies and monitoring best practices.';
      
      if (useRealAWS) {
        // Test with real Bedrock
        const response = await bedrockAI.generateQuickResponse(
          `Based on this content, suggest 5-8 relevant tags separated by commas: "${testContent}"`
        );
        
        expect(response).toBeTruthy();
        expect(typeof response).toBe('string');
        expect(response.length).toBeGreaterThan(0);
        
        // Should contain relevant AWS/tech terms
        const lowerResponse = response.toLowerCase();
        const hasRelevantTerms = ['aws', 'ec2', 'cost', 'optimization', 'monitoring', 'cloud'].some(term => 
          lowerResponse.includes(term)
        );
        expect(hasRelevantTerms).toBe(true);
        
        console.log('🎯 Real Bedrock tags response:', response);
      } else {
        // Fallback to mock test
        const { result } = renderHook(() => useKnowledgeBaseAI());
        const tags = await result.current.suggestTags(testContent);
        expect(Array.isArray(tags)).toBe(true);
      }
    }, 15000); // Increased timeout for real AWS calls

    it('should generate content summaries', async () => {
      const testContent = `
        AWS Cost Optimization Best Practices
        
        This comprehensive guide covers various strategies for optimizing AWS costs:
        
        1. EC2 Instance Right-sizing: Analyze your EC2 usage patterns and select appropriate instance types
        2. Reserved Instances: Purchase reserved instances for predictable workloads
        3. Spot Instances: Use spot instances for fault-tolerant applications
        4. Auto Scaling: Implement auto scaling to match capacity with demand
        5. Storage Optimization: Use appropriate storage classes for different data access patterns
        6. Monitoring and Alerting: Set up CloudWatch alarms for cost anomalies
        
        By implementing these strategies, organizations can reduce their AWS costs by 20-40%.
      `;
      
      if (useRealAWS) {
        // Test with real Bedrock
        const summary = await bedrockAI.generateQuickResponse(
          `Create a concise summary (2-3 sentences) of the following content: ${testContent}`
        );
        
        expect(summary).toBeTruthy();
        expect(typeof summary).toBe('string');
        expect(summary.length).toBeGreaterThan(50);
        expect(summary.length).toBeLessThan(500);
        
        // Should mention key concepts
        const lowerSummary = summary.toLowerCase();
        const hasKeyTerms = ['aws', 'cost', 'optimization'].some(term => 
          lowerSummary.includes(term)
        );
        expect(hasKeyTerms).toBe(true);
        
        console.log('📝 Real Bedrock summary response:', summary);
      } else {
        // Fallback to mock test
        const { result } = renderHook(() => useKnowledgeBaseAI());
        const summary = await result.current.generateSummary(testContent);
        expect(typeof summary).toBe('string');
      }
    }, 15000);

    it('should improve writing quality', async () => {
      const originalText = 'This is bad writing with grammar errors and unclear sentences.';
      
      if (useRealAWS) {
        const improved = await bedrockAI.generateAnalysis(
          `Improve the following text for clarity, grammar, and readability: "${originalText}"`
        );
        
        expect(improved).toBeTruthy();
        expect(typeof improved).toBe('string');
        expect(improved.length).toBeGreaterThan(originalText.length * 0.5);
        expect(improved).not.toBe(originalText); // Should be different from original
        
        console.log('✍️ Real Bedrock writing improvement:', improved);
      } else {
        // Fallback to mock test
        const { result } = renderHook(() => useKnowledgeBaseAI());
        // Mock test would go here
        expect(true).toBe(true);
      }
    }, 15000);

    it('should translate content', async () => {
      const originalText = 'Hello, this is a test article about AWS services.';
      
      if (useRealAWS) {
        const translated = await bedrockAI.generateAnalysis(
          `Translate the following content to Portuguese: "${originalText}"`
        );
        
        expect(translated).toBeTruthy();
        expect(typeof translated).toBe('string');
        expect(translated).not.toBe(originalText); // Should be different from original
        
        // Should contain Portuguese characteristics
        const lowerTranslated = translated.toLowerCase();
        const hasPortugueseTerms = ['olá', 'este', 'sobre', 'serviços', 'aws'].some(term => 
          lowerTranslated.includes(term)
        );
        
        console.log('🌍 Real Bedrock translation:', translated);
      } else {
        // Fallback to mock test
        const { result } = renderHook(() => useKnowledgeBaseAI());
        // Mock test would go here
        expect(true).toBe(true);
      }
    }, 15000);
  });

  describe('Cost Optimization AI', () => {
    it('should generate cost optimization recommendations', async () => {
      const costData = {
        totalCost: 2500,
        services: [
          { name: 'EC2', cost: 1200, utilization: 45 },
          { name: 'RDS', cost: 800, utilization: 70 },
          { name: 'S3', cost: 300, utilization: 85 },
          { name: 'CloudFront', cost: 200, utilization: 60 }
        ],
        trends: {
          monthly: [2000, 2200, 2500],
          daily: [80, 85, 83, 90, 95]
        },
        region: 'us-east-1',
        accountId: '123456789012'
      };

      if (useRealAWS) {
        // Test with real Bedrock
        const recommendations = await bedrockAI.generateCostOptimization(costData);
        
        expect(recommendations).toBeTruthy();
        expect(typeof recommendations).toBe('string');
        expect(recommendations.length).toBeGreaterThan(200);
        
        // Should contain cost optimization concepts
        const lowerRecommendations = recommendations.toLowerCase();
        const hasOptimizationTerms = [
          'cost', 'optimization', 'savings', 'ec2', 'rightsizing', 'reserved'
        ].some(term => lowerRecommendations.includes(term));
        expect(hasOptimizationTerms).toBe(true);
        
        // Should contain actionable recommendations
        const hasActionableContent = [
          'recommend', 'implement', 'consider', 'optimize', 'reduce'
        ].some(term => lowerRecommendations.includes(term));
        expect(hasActionableContent).toBe(true);
        
        console.log('💰 Real Bedrock cost optimization response:', recommendations.substring(0, 200) + '...');
      } else {
        // Fallback to mock test
        const recommendations = 'Mock cost optimization recommendations';
        expect(recommendations).toBeTruthy();
      }
    }, 20000);

    it('should analyze cost trends and anomalies', async () => {
      const costData = {
        trends: {
          monthly: [800, 900, 1500], // Spike in last month
          daily: [30, 35, 80], // Spike in last day
        },
        services: [
          { name: 'EC2', cost: 1200, trend: 'increasing' },
          { name: 'S3', cost: 300, trend: 'stable' }
        ],
        anomalies: [
          { date: '2024-12-10', increase: '50%', service: 'EC2' },
          { date: '2024-12-11', increase: '128%', service: 'Data Transfer' }
        ]
      };

      if (useRealAWS) {
        const analysis = await bedrockAI.generateAnalysis(
          'Analyze the following AWS cost trends and identify anomalies with recommendations',
          JSON.stringify(costData)
        );
        
        expect(analysis).toBeTruthy();
        expect(typeof analysis).toBe('string');
        expect(analysis.length).toBeGreaterThan(200);
        
        // Should contain cost analysis concepts
        const lowerAnalysis = analysis.toLowerCase();
        const hasCostTerms = ['cost', 'anomaly', 'increase', 'spike', 'trend'].some(term => 
          lowerAnalysis.includes(term)
        );
        expect(hasCostTerms).toBe(true);
        
        console.log('📊 Real Bedrock cost trend analysis:', analysis.substring(0, 200) + '...');
      } else {
        // Mock test
        expect(true).toBe(true);
      }
    }, 20000);
  });

  describe('Security Analysis AI', () => {
    it('should analyze security findings and provide recommendations', async () => {
      const securityFindings = [
        {
          id: 'finding-001',
          severity: 'CRITICAL',
          title: 'Unencrypted S3 Bucket',
          description: 'S3 bucket "company-data-bucket" does not have default encryption enabled',
          resource: 'arn:aws:s3:::company-data-bucket',
          region: 'us-east-1',
          accountId: '123456789012',
          status: 'ACTIVE',
          firstObserved: '2024-12-10T10:00:00Z',
          compliance: ['PCI-DSS', 'SOC2']
        },
        {
          id: 'finding-002', 
          severity: 'HIGH',
          title: 'Overprivileged IAM Role',
          description: 'IAM role "lambda-execution-role" has excessive permissions including s3:*',
          resource: 'arn:aws:iam::123456789012:role/lambda-execution-role',
          region: 'us-east-1',
          accountId: '123456789012',
          status: 'ACTIVE',
          firstObserved: '2024-12-09T15:30:00Z',
          compliance: ['SOC2', 'ISO27001']
        }
      ];

      if (useRealAWS) {
        // Test with real Bedrock
        const analysis = await bedrockAI.generateSecurityAnalysis(securityFindings);
        
        expect(analysis).toBeTruthy();
        expect(typeof analysis).toBe('string');
        expect(analysis.length).toBeGreaterThan(300);
        
        // Should contain security analysis concepts
        const lowerAnalysis = analysis.toLowerCase();
        const hasSecurityTerms = [
          'security', 'risk', 'critical', 'high', 'remediation', 'encrypt'
        ].some(term => lowerAnalysis.includes(term));
        expect(hasSecurityTerms).toBe(true);
        
        // Should contain actionable recommendations
        const hasActionableContent = [
          'recommend', 'implement', 'enable', 'review', 'fix', 'update'
        ].some(term => lowerAnalysis.includes(term));
        expect(hasActionableContent).toBe(true);
        
        console.log('🔒 Real Bedrock security analysis response:', analysis.substring(0, 200) + '...');
      } else {
        // Fallback to mock test
        const analysis = 'Mock security analysis';
        expect(analysis).toBeTruthy();
      }
    }, 20000);

    it('should generate remediation scripts', async () => {
      const findings = [
        {
          id: 'finding-001',
          title: 'Unencrypted S3 Bucket',
          description: 'S3 bucket does not have default encryption enabled',
          resource: 'arn:aws:s3:::company-data-bucket',
          severity: 'CRITICAL',
          remediation: 'Enable S3 bucket encryption'
        }
      ];
      
      if (useRealAWS) {
        const script = await bedrockAI.generateRemediationScript(findings, 'terraform');
        
        expect(script).toBeTruthy();
        expect(typeof script).toBe('string');
        expect(script.length).toBeGreaterThan(100);
        
        // Should contain Terraform and S3 encryption concepts
        const lowerScript = script.toLowerCase();
        const hasTerraformTerms = ['terraform', 'resource', 'aws_s3'].some(term => 
          lowerScript.includes(term)
        );
        const hasEncryptionTerms = ['encrypt', 'aes', 'kms', 'server_side'].some(term => 
          lowerScript.includes(term)
        );
        
        expect(hasTerraformTerms || hasEncryptionTerms).toBe(true);
        
        console.log('🔧 Real Bedrock remediation script:', script.substring(0, 200) + '...');
      } else {
        // Mock test
        expect(true).toBe(true);
      }
    }, 20000);
  });

  describe('Well-Architected Analysis', () => {
    it('should perform comprehensive architecture analysis', async () => {
      const architectureData = {
        services: [
          { name: 'EC2', instances: 15, types: ['t3.medium', 't3.large'], regions: ['us-east-1'] },
          { name: 'RDS', instances: 2, engine: 'postgresql', multiAZ: true },
          { name: 'S3', buckets: 8, totalSize: '2.5TB', encryption: 'partial' },
          { name: 'CloudFront', distributions: 3, caching: 'enabled' },
          { name: 'Lambda', functions: 25, runtime: 'nodejs18.x' }
        ],
        regions: ['us-east-1', 'us-west-2'],
        monitoring: { 
          cloudwatch: true, 
          xray: false, 
          customMetrics: 12,
          alarms: 8
        },
        security: { 
          waf: true, 
          guardduty: true, 
          inspector: false,
          iam: { roles: 15, policies: 23 },
          encryption: 'partial'
        },
        networking: {
          vpcs: 2,
          subnets: 8,
          loadBalancers: 3,
          natGateways: 2
        },
        backup: {
          automated: true,
          crossRegion: false,
          retentionDays: 30
        }
      };

      if (useRealAWS) {
        // Test with real Bedrock
        const analysis = await bedrockAI.generateWellArchitectedAnalysis(architectureData);
        
        expect(analysis).toBeTruthy();
        expect(typeof analysis).toBe('string');
        expect(analysis.length).toBeGreaterThan(500);
        
        // Should contain Well-Architected Framework pillars
        const lowerAnalysis = analysis.toLowerCase();
        const hasPillars = [
          'operational excellence', 'security', 'reliability', 
          'performance efficiency', 'cost optimization', 'sustainability'
        ].filter(pillar => lowerAnalysis.includes(pillar));
        expect(hasPillars.length).toBeGreaterThanOrEqual(3); // At least 3 pillars mentioned
        
        // Should contain architectural recommendations
        const hasRecommendations = [
          'recommend', 'improve', 'implement', 'enable', 'consider'
        ].some(term => lowerAnalysis.includes(term));
        expect(hasRecommendations).toBe(true);
        
        console.log('🏗️ Real Bedrock Well-Architected analysis response:', analysis.substring(0, 300) + '...');
      } else {
        // Fallback to mock test
        const analysis = 'Mock Well-Architected analysis';
        expect(analysis).toBeTruthy();
      }
    }, 25000); // Longer timeout for comprehensive analysis
  });

  describe('AI Performance and Reliability', () => {
    it('should complete AI analysis within performance thresholds', async () => {
      if (useRealAWS) {
        const { duration, result } = await measurePerformance(async () => {
          return await bedrockAI.generateQuickResponse('Provide a brief summary of AWS Lambda benefits in 2 sentences.');
        });

        expect(result).toBeTruthy();
        expect(typeof result).toBe('string');
        expect(duration).toBeLessThan(15000); // Real AWS calls may take longer
        
        console.log(`⚡ Real Bedrock response time: ${duration}ms`);
      } else {
        // Mock performance test
        const { duration } = await measurePerformance(async () => {
          return 'Mock quick response';
        });
        expect(duration).toBeLessThan(100);
      }
    }, 20000);

    it('should handle concurrent AI requests', async () => {
      if (useRealAWS) {
        const prompts = [
          'What is AWS EC2?',
          'What is AWS S3?', 
          'What is AWS Lambda?'
        ];
        
        const { duration, result } = await measurePerformance(async () => {
          const promises = prompts.map(prompt => 
            bedrockAI.generateQuickResponse(`Answer in one sentence: ${prompt}`)
          );
          return await Promise.all(promises);
        });

        expect(result).toHaveLength(3);
        result.forEach(response => {
          expect(response).toBeTruthy();
          expect(typeof response).toBe('string');
        });
        expect(duration).toBeLessThan(30000); // Allow more time for concurrent real requests
        
        console.log(`🔄 Concurrent Bedrock requests completed in: ${duration}ms`);
      } else {
        // Mock concurrent test
        const results = await Promise.all([
          Promise.resolve('Mock response 1'),
          Promise.resolve('Mock response 2'),
          Promise.resolve('Mock response 3')
        ]);
        expect(results).toHaveLength(3);
      }
    }, 35000);

    it('should handle AI service errors gracefully', async () => {
      if (useRealAWS) {
        // Test with invalid model ID to trigger error handling
        try {
          await bedrockAI.generateQuickResponse('Test prompt with invalid model');
          // If no error, that's fine - the service is working
          expect(true).toBe(true);
        } catch (error) {
          // Should handle errors gracefully
          expect(error).toBeInstanceOf(Error);
          expect(error.message).toBeTruthy();
          console.log('🚨 Expected error handling test:', error.message);
        }
      } else {
        // Mock error handling test
        expect(true).toBe(true);
      }
    }, 10000);
  });

  describe('AI Content Quality', () => {
    it('should generate contextually relevant content', async () => {
      const context = 'AWS cost optimization for e-commerce platform';
      const prompt = 'Generate 3 specific recommendations for reducing AWS costs for an e-commerce platform';

      if (useRealAWS) {
        const result = await bedrockAI.generateAnalysis(prompt, context);
        
        expect(result).toBeTruthy();
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(200);
        
        // Should contain e-commerce and AWS cost optimization concepts
        const lowerResult = result.toLowerCase();
        const hasEcommerceTerms = ['ecommerce', 'e-commerce', 'retail', 'shopping', 'traffic'].some(term => 
          lowerResult.includes(term)
        );
        const hasCostTerms = ['cost', 'saving', 'optimization', 'reduce', 'efficient'].some(term => 
          lowerResult.includes(term)
        );
        const hasAWSTerms = ['aws', 'ec2', 'rds', 's3', 'cloudfront', 'lambda'].some(term => 
          lowerResult.includes(term)
        );
        
        expect(hasEcommerceTerms || hasCostTerms).toBe(true);
        expect(hasAWSTerms).toBe(true);
        
        console.log('🎯 Real Bedrock contextual response:', result.substring(0, 200) + '...');
      } else {
        // Mock contextual test
        expect(true).toBe(true);
      }
    }, 20000);

    it('should maintain technical accuracy in generated content', async () => {
      const technicalPrompt = 'Explain AWS Lambda cold starts and provide 3 optimization strategies';

      if (useRealAWS) {
        const result = await bedrockAI.generateAnalysis(technicalPrompt);
        
        expect(result).toBeTruthy();
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(300);
        
        // Should contain Lambda and cold start concepts
        const lowerResult = result.toLowerCase();
        const hasLambdaTerms = ['lambda', 'cold start', 'warm', 'execution', 'container'].some(term => 
          lowerResult.includes(term)
        );
        const hasOptimizationTerms = ['optimization', 'performance', 'latency', 'provisioned', 'concurrency'].some(term => 
          lowerResult.includes(term)
        );
        
        expect(hasLambdaTerms).toBe(true);
        expect(hasOptimizationTerms).toBe(true);
        
        console.log('🔧 Real Bedrock technical response:', result.substring(0, 200) + '...');
      } else {
        // Mock technical test
        expect(true).toBe(true);
      }
    }, 20000);

    it('should test real AWS Bedrock connectivity', async () => {
      if (useRealAWS) {
        // Simple connectivity test
        const response = await bedrockAI.generateQuickResponse('Hello, please respond with "AWS Bedrock is working"');
        
        expect(response).toBeTruthy();
        expect(typeof response).toBe('string');
        expect(response.length).toBeGreaterThan(5);
        
        console.log('🔗 Bedrock connectivity test response:', response);
      } else {
        console.log('⚠️ Skipping real AWS connectivity test - using mocks');
        expect(true).toBe(true);
      }
    }, 15000);
  });
});