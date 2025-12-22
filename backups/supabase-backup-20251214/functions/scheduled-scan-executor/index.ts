import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { calculateNextRun } from '../_shared/cron-utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Running scheduled scan executor...');

    // CRITICAL: This is a system/cron job - must use SERVICE_ROLE_KEY
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Verify this is a system call
    if (!authHeader || !authHeader.includes(serviceRoleKey)) {
      console.error('❌ Unauthorized: Only system/cron can call this function');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - system function only' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('⚙️ System call verified');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get active scheduled scans - NO organization filter (process all orgs)
    const { data: schedules, error: schedError } = await supabase
      .from('scheduled_scans')
      .select('*, aws_credentials(*)')
      .eq('is_active', true);

    if (schedError) {
      throw new Error(`Failed to fetch schedules: ${schedError.message}`);
    }

    if (!schedules || schedules.length === 0) {
      console.log('No active scheduled scans found');
      return new Response(
        JSON.stringify({ message: 'No active schedules' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = [];

    for (const schedule of schedules) {
      console.log(`Processing schedule ${schedule.id} for org ${schedule.aws_credentials?.organization_id}...`);

      // Execute each scan type
      for (const scanType of schedule.scan_types) {
        try {
          let functionName = '';
          
          switch (scanType) {
            case 'security':
              functionName = 'security-scan';
              break;
            case 'cost':
              functionName = 'cost-optimization';
              break;
            case 'well_architected':
              functionName = 'well-architected-scan';
              break;
            case 'iam':
              functionName = 'iam-deep-analysis';
              break;
            default:
              console.warn(`Unknown scan type: ${scanType}`);
              continue;
          }

          console.log(`Invoking ${functionName} for account ${schedule.aws_account_id}...`);

          // CRITICAL: Pass SERVICE_ROLE authorization to edge function
          // This allows the system to process scans for all organizations
          supabase.functions.invoke(functionName, {
            body: { 
              scheduled: true, 
              account_id: schedule.aws_account_id,
              organization_id: schedule.aws_credentials?.organization_id
            }
          }).catch(err => {
            console.error(`Error invoking ${functionName}:`, err);
          });

          results.push({
            schedule_id: schedule.id,
            organization_id: schedule.aws_credentials?.organization_id,
            scan_type: scanType,
            status: 'initiated'
          });

        } catch (scanError) {
          console.error(`Error executing ${scanType} scan:`, scanError);
          results.push({
            schedule_id: schedule.id,
            organization_id: schedule.aws_credentials?.organization_id,
            scan_type: scanType,
            status: 'failed',
            error: scanError instanceof Error ? scanError.message : 'Unknown error'
          });
        }
      }

      // Update last run time and calculate next run using proper cron parser
      try {
        const nextRun = calculateNextRun(schedule.schedule_cron || '0 0 * * *');
        await supabase
          .from('scheduled_scans')
          .update({ 
            last_run_at: new Date().toISOString(),
            next_run_at: nextRun
          })
          .eq('id', schedule.id);
        
        console.log(`Next run for schedule ${schedule.id}: ${nextRun}`);
      } catch (cronError) {
        console.error(`Error calculating next run for schedule ${schedule.id}:`, cronError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        schedules_processed: schedules.length,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Scheduled scan executor error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});