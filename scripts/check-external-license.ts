#!/usr/bin/env node
/**
 * Check External License Status
 * Queries the external license API to see the real state
 */

const LICENSE_API_URL = 'https://mhutjgpipiklepvjrboi.supabase.co/functions/v1/validate-license';
const LICENSE_API_KEY = 'nck_59707b56bf8def71dfb657bb8f2f4b9c';

async function checkExternalLicense(customerId: string) {
  console.log(`\n🔍 Checking external license API...`);
  console.log(`   Customer ID: ${customerId}`);

  const response = await fetch(LICENSE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': LICENSE_API_KEY,
    },
    body: JSON.stringify({ customer_id: customerId }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`License API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  console.log(`\n✅ External API Response:`);
  console.log(JSON.stringify(data, null, 2));

  return data;
}

async function main() {
  const customerId = process.argv[2] || '0d09b64b-46fe-446a-9b60-fe0a8500ea34';

  try {
    await checkExternalLicense(customerId);
  } catch (error) {
    console.error(`\n❌ Error:`, error);
    process.exit(1);
  }
}

main();
