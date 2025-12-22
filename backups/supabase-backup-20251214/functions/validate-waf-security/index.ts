import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { scanId } = await req.json();

    // Always use SERVICE_ROLE_KEY for database operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get authorization token to extract user info
    const authHeader = req.headers.get('Authorization');
    
    // Get user's organization ID
    let organizationId = null;
    
    if (authHeader) {
      // Extract JWT token
      const token = authHeader.replace('Bearer ', '');
      
      // Decode JWT to get user_id (JWT format: header.payload.signature)
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const userId = payload.sub;
        
        if (userId) {
          console.log(`Extracted user ID from JWT: ${userId}`);
          
          // Get organization using RPC
          const { data: orgId, error: orgError } = await supabaseClient.rpc('get_user_organization', { _user_id: userId });
          
          if (orgError) {
            console.error('Error getting organization:', orgError);
            throw new Error('Failed to get user organization');
          }
          
          organizationId = orgId;
          console.log(`User ${userId} belongs to organization ${organizationId}`);
        }
      } catch (jwtError) {
        console.error('Error decoding JWT:', jwtError);
        throw new Error('Invalid authentication token');
      }
    }

    if (!organizationId) {
      console.error('Organization ID is null - user may not be properly authenticated');
      throw new Error('Organization ID not found. Please ensure you are logged in.');
    }

    console.log(`Starting WAF/Security Group validation for scan ${scanId}`);

    // Delete old validations for this organization to prevent accumulation
    const { error: deleteError } = await supabaseClient
      .from('waf_validations')
      .delete()
      .eq('organization_id', organizationId);

    if (deleteError) {
      console.error('Error deleting old validations:', deleteError);
    } else {
      console.log('Cleared old validations for organization');
    }

    // Get AWS credentials
    const { data: credentials, error: credError } = await supabaseClient
      .from('aws_credentials')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (credError || !credentials) {
      throw new Error('AWS credentials not found');
    }

    const region = credentials.regions?.[0] || 'us-east-1';
    console.log(`Using AWS credentials for account: ${credentials.account_name}, region: ${region}`);

    // Check EC2 instances for public access and security groups (FILTERED BY ORGANIZATION)
    const { data: ec2Instances } = await supabaseClient
      .from('resource_inventory')
      .select('*')
      .eq('resource_type', 'ec2')
      .eq('organization_id', organizationId);
    
    console.log(`Found ${ec2Instances?.length || 0} EC2 instances in resource_inventory`);

    // Check Load Balancers (FILTERED BY ORGANIZATION) - includes ALB and NLB
    const { data: loadBalancers } = await supabaseClient
      .from('resource_inventory')
      .select('*')
      .in('resource_type', ['alb', 'nlb'])
      .eq('organization_id', organizationId);
    
    console.log(`Found ${loadBalancers?.length || 0} Load Balancers in resource_inventory`);

    // Check RDS instances (FILTERED BY ORGANIZATION)
    const { data: rdsInstances } = await supabaseClient
      .from('resource_inventory')
      .select('*')
      .eq('resource_type', 'rds')
      .eq('organization_id', organizationId);
    
    console.log(`Found ${rdsInstances?.length || 0} RDS instances in resource_inventory`);

    
    // Remove infrastructure_topology check as it's not being populated
    // All resources now come from resource_inventory
    
    const validations = [];
    let criticalCount = 0;
    let highCount = 0;

    // Validate EC2 instances
    // Note: Since metadata may not have complete IP info, we validate all EC2s
    // and mark them based on available security group data
    if (ec2Instances) {
      for (const instance of ec2Instances) {
        const metadata = instance.metadata || {};
        const securityGroups = metadata.SecurityGroups || instance.tags?.SecurityGroups || [];
        
        // Validate all EC2 instances (metadata may be incomplete)
        // We'll mark risk based on security group configuration
          // Check security groups for overly permissive rules
          const sgIssues: Array<{groupId?: string; issue: string; port: string | number; protocol: string}> = [];
          let sgConfigured = true;
          
          // Check if security groups allow 0.0.0.0/0
          if (Array.isArray(securityGroups)) {
            for (const sg of securityGroups) {
              if (sg.IpPermissions) {
                for (const rule of sg.IpPermissions) {
                  if (rule.IpRanges?.some((range: any) => range.CidrIp === '0.0.0.0/0')) {
                    sgConfigured = false;
                    sgIssues.push({
                      groupId: sg.GroupId,
                      issue: 'Allows unrestricted inbound access from internet',
                      port: rule.FromPort || 'all',
                      protocol: rule.IpProtocol || 'all'
                    });
                  }
                }
              }
            }
          }

          // EC2 instances typically don't have WAF (that's for ALB/CloudFront)
          const hasWAF = false;
          
        let riskLevel = 'low';
        if (!sgConfigured) {
          riskLevel = 'critical';
          criticalCount++;
        } else if (securityGroups.length > 0) {
          riskLevel = 'medium';
        }

        const recommendations = [];
        recommendations.push('EC2 instance should be reviewed for public accessibility');
        if (!sgConfigured) {
          recommendations.push('CRITICAL: Security Groups allow unrestricted access (0.0.0.0/0)');
          recommendations.push('Restrict inbound rules to specific IP ranges');
          recommendations.push('Remove overly permissive rules');
        }
        recommendations.push('Verify if instance needs public access');
        recommendations.push('Consider placing instance in private subnet');
        recommendations.push('Use bastion host or VPN for access');
        recommendations.push('If public access is required, use ALB with WAF');

          validations.push({
            organization_id: organizationId,
            scan_id: scanId,
            resource_id: instance.resource_id,
            resource_type: 'EC2_Instance',
            resource_name: instance.resource_name || instance.resource_id,
            is_public: true,
            has_waf: hasWAF,
            waf_name: null,
            waf_rules: null,
            security_groups: securityGroups,
            sg_properly_configured: sgConfigured,
            sg_issues: sgIssues.length > 0 ? sgIssues : null,
            risk_level: riskLevel,
          recommendations: recommendations.join('\n')
        });
      }
    }

    // Validate Load Balancers
    if (loadBalancers) {
      for (const lb of loadBalancers) {
        const metadata = lb.metadata || {};
        const isPublic = metadata.Scheme === 'internet-facing';
        
        if (isPublic) {
          // Check if ALB has WAF attached
          const hasWAF = metadata.WebACLId || false;
          const securityGroups = metadata.SecurityGroups || [];
          
          const sgIssues: Array<{groupId?: string; issue: string; port?: string | number; protocol?: string}> = [];
          let sgConfigured = securityGroups.length > 0;

          let riskLevel = 'low';
          if (!hasWAF && !sgConfigured) {
            riskLevel = 'critical';
            criticalCount++;
          } else if (!hasWAF) {
            riskLevel = 'high';
            highCount++;
          }

          const recommendations = [];
          if (!hasWAF) {
            recommendations.push('Attach AWS WAF to protect against web exploits');
            recommendations.push('Configure WAF rules for SQL injection and XSS protection');
            recommendations.push('Enable rate limiting in WAF');
          }
          if (!sgConfigured) {
            recommendations.push('Configure Security Groups for the load balancer');
            recommendations.push('Restrict traffic to known sources when possible');
          }

          validations.push({
            organization_id: organizationId,
            scan_id: scanId,
            resource_id: lb.resource_id,
            resource_type: lb.resource_type,
            resource_name: lb.resource_name || lb.resource_id,
            is_public: isPublic,
            has_waf: hasWAF,
            waf_name: hasWAF ? metadata.WebACLId : null,
            waf_rules: null,
            security_groups: securityGroups,
            sg_properly_configured: sgConfigured,
            sg_issues: sgIssues.length > 0 ? sgIssues : null,
            risk_level: riskLevel,
            recommendations: recommendations.join('\n')
          });
        }
      }
    }

    // Validate RDS instances
    if (rdsInstances) {
      for (const rds of rdsInstances) {
        const metadata = rds.metadata || {};
        const isPublic = metadata.PubliclyAccessible === true;
        
        if (isPublic) {
          const securityGroups = metadata.VpcSecurityGroups || [];
          let sgConfigured = true;
          const sgIssues = [];

          // RDS should never be publicly accessible
          const riskLevel = 'critical';
          criticalCount++;

          const recommendations = [];
          recommendations.push('CRITICAL: RDS instance is publicly accessible');
          recommendations.push('Disable public accessibility immediately');
          recommendations.push('Place RDS in private subnet');
          recommendations.push('Use VPN or bastion host for administrative access');
          recommendations.push('Configure Security Groups to allow access only from application servers');

          validations.push({
            organization_id: organizationId,
            scan_id: scanId,
            resource_id: rds.resource_id,
            resource_type: 'RDS_Instance',
            resource_name: rds.resource_name || rds.resource_id,
            is_public: isPublic,
            has_waf: false,
            waf_name: null,
            waf_rules: null,
            security_groups: securityGroups,
            sg_properly_configured: false,
            sg_issues: [{ issue: 'Database is publicly accessible from internet' }],
            risk_level: riskLevel,
            recommendations: recommendations.join('\n')
          });
        }
      }
    }

    // Insert validations into database
    if (validations.length > 0) {
      const { error: insertError } = await supabaseClient
        .from('waf_validations')
        .insert(validations);

      if (insertError) {
        console.error('Error inserting validations:', insertError);
        throw insertError;
      }

      // Create findings for critical and high issues
      const criticalValidations = validations.filter(v => v.risk_level === 'critical' || v.risk_level === 'high');
      
      for (const validation of criticalValidations) {
        await supabaseClient
          .from('findings')
          .insert({
            organization_id: organizationId,
            event_id: `waf-validation-${validation.resource_id}-${Date.now()}`,
            event_name: 'Public Resource Security Issue',
            event_time: new Date().toISOString(),
            severity: validation.risk_level === 'critical' ? 'critical' : 'high',
            description: `${validation.resource_type} ${validation.resource_name || validation.resource_id} has security configuration issues`,
            user_identity: {},
            details: {
              resource_id: validation.resource_id,
              resource_type: validation.resource_type,
              has_waf: validation.has_waf,
              sg_configured: validation.sg_properly_configured,
              issues: validation.sg_issues,
              recommendations: validation.recommendations,
              is_public: validation.is_public
            },
            source: 'waf_validation',
            scan_type: 'security'
          });
      }
    }

    console.log(`Validation complete: ${validations.length} resources checked, ${criticalCount} critical, ${highCount} high risk`);

    return new Response(
      JSON.stringify({
        success: true,
        validations: validations.length,
        critical: criticalCount,
        high: highCount,
        message: `Validated ${validations.length} public resources`
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error: any) {
    console.error('WAF validation error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to validate WAF and security groups',
        details: error.toString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});