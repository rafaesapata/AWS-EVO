import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getResolvedAWSCredentials, signAWSGetRequest, signAWSPostRequest } from '../_shared/aws-credentials-helper.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GuardDutyFinding {
  Id: string;
  Type: string;
  Severity: number;
  Title: string;
  Description: string;
  Resource?: {
    ResourceType?: string;
    InstanceDetails?: any;
  };
  Service?: {
    Action?: any;
    Evidence?: any;
    Archived?: boolean;
    Count?: number;
    EventFirstSeen?: string;
    EventLastSeen?: string;
  };
}

async function makeGuardDutyRequest(
  method: string,
  path: string,
  body: string,
  accessKeyId: string,
  secretAccessKey: string,
  sessionToken: string | undefined,
  region: string
): Promise<Response> {
  const host = `guardduty.${region}.amazonaws.com`;
  
  let headers: Record<string, string>;
  if (method === 'GET') {
    headers = await signAWSGetRequest(
      { accessKeyId, secretAccessKey, sessionToken },
      'guardduty',
      region,
      host,
      path,
      ''
    );
    headers['Content-Type'] = 'application/json';
  } else {
    headers = await signAWSPostRequest(
      { accessKeyId, secretAccessKey, sessionToken },
      'guardduty',
      region,
      host,
      path,
      body,
      { 'Content-Type': 'application/json' }
    );
  }

  return fetch(`https://${host}${path}`, {
    method,
    headers,
    body: method !== 'GET' ? body : undefined,
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { accountId } = await req.json();

    if (!accountId) {
      throw new Error('Account ID is required');
    }

    // Get AWS credentials with organization verification
    const { data: credentials, error: credError } = await supabase
      .from('aws_credentials')
      .select('*, organizations!inner(id)')
      .eq('id', accountId)
      .maybeSingle();

    if (credError) {
      console.error('Credentials error:', credError);
      throw new Error('Failed to fetch AWS credentials');
    }

    if (!credentials) {
      throw new Error('AWS credentials not found');
    }

    const organizationId = credentials.organizations.id;

    console.log('Scanning GuardDuty for account:', accountId);

    // Resolve credentials via AssumeRole
    const regions = credentials.regions || ['us-east-1'];
    const primaryRegion = regions[0] || 'us-east-1';
    
    let resolvedCreds;
    try {
      resolvedCreds = await getResolvedAWSCredentials(credentials, primaryRegion);
      console.log('✅ Credentials resolved via AssumeRole');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('❌ Failed to resolve credentials:', msg);
      throw new Error(`Failed to assume AWS Role: ${msg}`);
    }

    const allFindings: any[] = [];

    for (const region of regions) {
      console.log(`Scanning GuardDuty in region: ${region}`);

      try {
        // List detector IDs
        const detectorsResponse = await makeGuardDutyRequest(
          'GET',
          '/detector',
          '',
          resolvedCreds.accessKeyId,
          resolvedCreds.secretAccessKey,
          resolvedCreds.sessionToken,
          region
        );

        if (!detectorsResponse.ok) {
          const errText = await detectorsResponse.text();
          console.error(`GuardDuty API error in ${region}:`, detectorsResponse.status, errText);
          continue;
        }

        const detectors = await detectorsResponse.json();
        
        if (!detectors.detectorIds || detectors.detectorIds.length === 0) {
          console.log(`No GuardDuty detectors in ${region}`);
          continue;
        }

        const detectorId = detectors.detectorIds[0];
        console.log(`Found detector: ${detectorId} in ${region}`);

        // List findings
        const findingsResponse = await makeGuardDutyRequest(
          'POST',
          `/detector/${detectorId}/findings`,
          JSON.stringify({
            maxResults: 50,
            findingCriteria: {
              criterion: {
                'service.archived': {
                  eq: ['false']
                }
              }
            }
          }),
          resolvedCreds.accessKeyId,
          resolvedCreds.secretAccessKey,
          resolvedCreds.sessionToken,
          region
        );

        if (!findingsResponse.ok) {
          const errText = await findingsResponse.text();
          console.error(`Error listing findings in ${region}:`, findingsResponse.status, errText);
          continue;
        }

        const findingsList = await findingsResponse.json();
        
        if (!findingsList.findingIds || findingsList.findingIds.length === 0) {
          console.log(`No active findings in ${region}`);
          continue;
        }

        console.log(`Found ${findingsList.findingIds.length} findings in ${region}`);

        // Get finding details
        const detailsResponse = await makeGuardDutyRequest(
          'POST',
          `/detector/${detectorId}/findings/get`,
          JSON.stringify({
            findingIds: findingsList.findingIds
          }),
          resolvedCreds.accessKeyId,
          resolvedCreds.secretAccessKey,
          resolvedCreds.sessionToken,
          region
        );

        if (detailsResponse.ok) {
          const details = await detailsResponse.json();
          if (details.findings) {
            allFindings.push(...details.findings.map((f: GuardDutyFinding) => ({ ...f, region })));
          }
        }
      } catch (regionError) {
        console.error(`Error scanning region ${region}:`, regionError);
        continue;
      }
    }

    console.log(`Found ${allFindings.length} GuardDuty findings`);

    // Store findings in database
    const findingsToInsert = allFindings.map((finding: GuardDutyFinding & { region: string }) => {
      const severityLabel = finding.Severity >= 7 ? 'Critical' :
                           finding.Severity >= 4 ? 'High' :
                           finding.Severity >= 1 ? 'Medium' : 'Low';

      return {
        organization_id: organizationId,
        aws_account_id: accountId,
        finding_id: finding.Id,
        finding_type: finding.Type,
        severity: finding.Severity,
        severity_label: severityLabel,
        title: finding.Title,
        description: finding.Description,
        resource_type: finding.Resource?.ResourceType,
        resource_id: finding.Resource?.InstanceDetails?.InstanceId,
        region: finding.region,
        service: 'GuardDuty',
        action: finding.Service?.Action,
        evidence: finding.Service?.Evidence,
        first_seen: finding.Service?.EventFirstSeen,
        last_seen: finding.Service?.EventLastSeen,
        count: finding.Service?.Count || 1,
        status: finding.Service?.Archived ? 'archived' : 'active',
      };
    });

    if (findingsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('guardduty_findings')
        .upsert(findingsToInsert, {
          onConflict: 'aws_account_id,finding_id',
          ignoreDuplicates: false,
        });

      if (insertError) {
        console.error('Error inserting findings:', insertError);
        throw insertError;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        findings_count: allFindings.length,
        critical: findingsToInsert.filter(f => f.severity_label === 'Critical').length,
        high: findingsToInsert.filter(f => f.severity_label === 'High').length,
        medium: findingsToInsert.filter(f => f.severity_label === 'Medium').length,
        low: findingsToInsert.filter(f => f.severity_label === 'Low').length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('GuardDuty scan error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
