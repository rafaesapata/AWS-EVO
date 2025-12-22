import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getResolvedAWSCredentials, signAWSFormRequest } from '../_shared/aws-credentials-helper.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting drift detection...');

    // Get user's organization
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token || '');
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    const organizationId = profile?.organization_id;
    if (!organizationId) {
      throw new Error('Organization not found');
    }

    // Get AWS credentials - use limit(1) to handle multiple accounts
    const { data: credentialsArray, error: credError } = await supabase
      .from('aws_credentials')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .limit(1);

    const credentials = credentialsArray?.[0];

    if (credError || !credentials) {
      console.log('No active AWS credentials found for organization');
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'No AWS credentials configured. Please configure AWS credentials first.',
          drifts: [],
          stats: {
            total: 0,
            created: 0,
            modified: 0,
            deleted: 0,
            critical: 0,
            high: 0
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // CRITICAL: Resolve credentials via AssumeRole
    let resolvedCreds;
    try {
      resolvedCreds = await getResolvedAWSCredentials(credentials, credentials.regions?.[0] || 'us-east-1');
      console.log('✅ Credentials resolved via AssumeRole');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('❌ Failed to resolve AWS credentials:', msg);
      return new Response(
        JSON.stringify({ 
          error: `Failed to assume AWS role: ${msg}`,
          message: 'Please ensure your AWS CloudFormation stack is properly configured.'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const detectedDrifts: any[] = [];
    const regions = credentials.regions || ['us-east-1'];

    for (const region of regions) {
      console.log(`Scanning for drift in region ${region}...`);

      // Get current EC2 instances
      const currentInstances = await getEC2Instances(resolvedCreds, region);
      
      // Get expected state from resource inventory
      const { data: expectedResources } = await supabase
        .from('resource_inventory')
        .select('*')
        .eq('aws_account_id', credentials.id)
        .eq('resource_type', 'EC2::Instance')
        .eq('region', region);

      // Compare current vs expected state
      for (const current of currentInstances) {
        const expected = expectedResources?.find(r => r.resource_id === current.InstanceId);
        
        if (!expected) {
          // Resource created outside IaC
          detectedDrifts.push({
            aws_account_id: credentials.id,
            resource_id: current.InstanceId,
            resource_type: 'EC2::Instance',
            resource_name: current.Tags?.find((t: any) => t.Key === 'Name')?.Value || null,
            drift_type: 'created',
            detected_at: new Date().toISOString(),
            severity: 'high',
            diff: {
              instanceType: current.InstanceType,
              state: current.State?.Name,
              securityGroups: current.SecurityGroups?.map((sg: any) => sg.GroupId)
            },
            expected_state: null,
            actual_state: {
              instanceType: current.InstanceType,
              state: current.State?.Name
            }
          });
        } else {
          // Compare configs
          const expectedMeta = expected.metadata as any || {};
          if (expectedMeta.instanceType !== current.InstanceType) {
            detectedDrifts.push({
              aws_account_id: credentials.id,
              resource_id: current.InstanceId,
              resource_type: 'EC2::Instance',
              resource_name: current.Tags?.find((t: any) => t.Key === 'Name')?.Value || expected.resource_name,
              drift_type: 'configuration_drift',
              detected_at: new Date().toISOString(),
              severity: 'medium',
              diff: {
                field: 'instanceType',
                expected: expectedMeta.instanceType,
                actual: current.InstanceType
              },
              expected_state: expectedMeta,
              actual_state: {
                instanceType: current.InstanceType,
                state: current.State?.Name
              }
            });
          }
        }
      }

      // Check for deleted resources (exist in inventory but not in AWS)
      if (expectedResources) {
        for (const expected of expectedResources) {
          const exists = currentInstances.some((c: any) => c.InstanceId === expected.resource_id);
          if (!exists) {
            detectedDrifts.push({
              aws_account_id: credentials.id,
              resource_id: expected.resource_id,
              resource_type: 'EC2::Instance',
              resource_name: expected.resource_name,
              drift_type: 'deleted',
              detected_at: new Date().toISOString(),
              severity: 'critical',
              diff: { message: 'Resource no longer exists in AWS' },
              expected_state: expected.metadata,
              actual_state: null
            });
          }
        }
      }
    }

    // Save detected drifts
    if (detectedDrifts.length > 0) {
      const { error: insertError } = await supabase
        .from('drift_detections')
        .insert(detectedDrifts);

      if (insertError) {
        console.error('Error saving drifts:', insertError);
      }
    }

    // Update scan history
    const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const createdCount = detectedDrifts.filter(d => d.drift_type === 'created').length;
    const modifiedCount = detectedDrifts.filter(d => d.drift_type === 'configuration_drift').length;
    const deletedCount = detectedDrifts.filter(d => d.drift_type === 'deleted').length;
    const criticalCount = detectedDrifts.filter(d => d.severity === 'critical').length;
    const highCount = detectedDrifts.filter(d => d.severity === 'high').length;

    await supabase
      .from('drift_detection_history')
      .insert({
        organization_id: organizationId,
        total_drifts: detectedDrifts.length,
        created_count: createdCount,
        modified_count: modifiedCount,
        deleted_count: deletedCount,
        critical_count: criticalCount,
        high_count: highCount,
        execution_time_seconds: parseFloat(executionTime),
        message: `Detected ${detectedDrifts.length} drifts (${createdCount} created, ${modifiedCount} modified, ${deletedCount} deleted)`
      });

    console.log(`Detected ${detectedDrifts.length} drifts in ${executionTime}s`);

    return new Response(
      JSON.stringify({
        success: true,
        drifts_detected: detectedDrifts.length,
        execution_time: executionTime,
        summary: {
          created: createdCount,
          configuration_drift: modifiedCount,
          deleted: deletedCount,
          critical: criticalCount,
          high: highCount
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in drift detection:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getEC2Instances(
  resolvedCreds: { accessKeyId: string; secretAccessKey: string; sessionToken?: string; region: string },
  region: string
) {
  try {
    const response = await makeAWSRequest(resolvedCreds, region, 'ec2', 'DescribeInstances', {});

    const instances: any[] = [];
    if (response.Reservations) {
      for (const reservation of response.Reservations) {
        if (reservation.Instances) {
          instances.push(...reservation.Instances);
        }
      }
    }
    return instances;
  } catch (error) {
    console.error(`Error fetching EC2 instances in ${region}:`, error);
    return [];
  }
}

async function makeAWSRequest(
  resolvedCreds: { accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  region: string,
  service: string,
  action: string,
  params: any
) {
  const host = `${service}.${region}.amazonaws.com`;
  const endpoint = `https://${host}/`;
  
  const payload = new URLSearchParams({
    Action: action,
    Version: '2016-11-15',
    ...params
  }).toString();

  const headers = await signAWSFormRequest(
    resolvedCreds,
    service,
    region,
    host,
    '/',
    payload
  );

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: payload,
  });

  const text = await response.text();
  
  if (!response.ok) {
    throw new Error(`AWS API error: ${text}`);
  }

  return parseXMLResponse(text);
}

function parseXMLResponse(xml: string): any {
  const result: any = {};
  const reservationMatch = xml.match(/<reservationSet>([\s\S]*?)<\/reservationSet>/);

  if (reservationMatch) {
    result.Reservations = [];
    const reservations = reservationMatch[1].match(/<item>([\s\S]*?)<\/item>/g) || [];
    
    for (const res of reservations) {
      const reservation: any = { Instances: [] };
      const instancesMatch = res.match(/<instancesSet>([\s\S]*?)<\/instancesSet>/);
      
      if (instancesMatch) {
        const instances = instancesMatch[1].match(/<item>([\s\S]*?)<\/item>/g) || [];
        
        for (const inst of instances) {
          const instance: any = {};
          const idMatch = inst.match(/<instanceId>(.*?)<\/instanceId>/);
          const typeMatch = inst.match(/<instanceType>(.*?)<\/instanceType>/);
          const stateMatch = inst.match(/<name>(.*?)<\/name>/);
          
          instance.InstanceId = idMatch?.[1];
          instance.InstanceType = typeMatch?.[1];
          instance.State = { Name: stateMatch?.[1] };
          
          // Parse security groups
          const sgSetMatch = inst.match(/<groupSet>([\s\S]*?)<\/groupSet>/);
          if (sgSetMatch) {
            instance.SecurityGroups = [];
            const sgs = sgSetMatch[1].match(/<item>([\s\S]*?)<\/item>/g) || [];
            for (const sg of sgs) {
              const sgIdMatch = sg.match(/<groupId>(.*?)<\/groupId>/);
              if (sgIdMatch) {
                instance.SecurityGroups.push({ GroupId: sgIdMatch[1] });
              }
            }
          }
          
          // Parse tags
          const tagSetMatch = inst.match(/<tagSet>([\s\S]*?)<\/tagSet>/);
          if (tagSetMatch) {
            instance.Tags = [];
            const tags = tagSetMatch[1].match(/<item>([\s\S]*?)<\/item>/g) || [];
            for (const tag of tags) {
              const keyMatch = tag.match(/<key>(.*?)<\/key>/);
              const valueMatch = tag.match(/<value>(.*?)<\/value>/);
              if (keyMatch && valueMatch) {
                instance.Tags.push({ Key: keyMatch[1], Value: valueMatch[1] });
              }
            }
          }
          
          reservation.Instances.push(instance);
        }
      }
      
      result.Reservations.push(reservation);
    }
  }

  return result;
}
