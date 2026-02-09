#!/usr/bin/env node
/**
 * Renew License for Production Organization
 * 
 * This script calls the external license API to create/renew a trial license
 * and then syncs it to the local database.
 * 
 * Usage: npx tsx scripts/renew-license-production.ts <customer_id> <organization_id>
 */

const LICENSE_CREATE_API_URL = 'https://mhutjgpipiklepvjrboi.supabase.co/functions/v1/api-create-trial';
const LICENSE_API_KEY = 'nck_59707b56bf8def71dfb657bb8f2f4b9c';

interface CreateTrialRequest {
  organization_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  website?: string;
  product_type: string;
  estimated_seats: number;
  notes?: string;
}

interface CreateTrialResponse {
  success: boolean;
  customer_id: string;
  license_key: string;
  valid_until: string;
  error?: string;
}

async function createTrialLicense(
  customerId: string,
  organizationId: string,
  companyName: string,
  contactName: string,
  email: string,
  phone: string = '+55 11 99999-9999'
): Promise<CreateTrialResponse> {
  console.log(`\n🔄 Calling external license API...`);
  console.log(`   URL: ${LICENSE_CREATE_API_URL}`);
  console.log(`   Organization: ${companyName}`);
  console.log(`   Contact: ${contactName} (${email})`);

  const response = await fetch(LICENSE_CREATE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': LICENSE_API_KEY,
    },
    body: JSON.stringify({
      organization_name: companyName,
      contact_name: contactName,
      contact_email: email,
      contact_phone: phone,
      website: '',
      product_type: 'evo',
      estimated_seats: 5,
      notes: `License renewal for existing organization - Org ID: ${organizationId}, Customer ID: ${customerId}`
    } as CreateTrialRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`License API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as CreateTrialResponse;
  
  if (!data.success) {
    throw new Error(`License creation failed: ${data.error || 'Unknown error'}`);
  }

  console.log(`✅ License created successfully!`);
  console.log(`   License Key: ${data.license_key}`);
  console.log(`   Valid Until: ${data.valid_until}`);

  return data;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error(`
❌ Usage: npx tsx scripts/renew-license-production.ts <customer_id> <organization_id>

Example:
  npx tsx scripts/renew-license-production.ts \\
    0d09b64b-46fe-446a-9b60-fe0a8500ea34 \\
    cf1cee1e-b545-4030-9ec5-b5b1802d6b56

Current Production Data:
  Customer ID: 0d09b64b-46fe-446a-9b60-fe0a8500ea34
  Organization ID: cf1cee1e-b545-4030-9ec5-b5b1802d6b56
  Organization: UDS Demo Evo
  User: comercial+evo@uds.com.br
`);
    process.exit(1);
  }

  const customerId = args[0];
  const organizationId = args[1];

  console.log(`\n🚀 Renewing License for Production Organization`);
  console.log(`================================================`);

  try {
    // Create trial license via external API
    const licenseData = await createTrialLicense(
      customerId,
      organizationId,
      'UDS Demo Evo',
      'Rafael Sapata',
      'comercial+evo@uds.com.br',
      '+55 11 99999-9999'
    );

    console.log(`\n✅ License renewed successfully!`);
    console.log(`\nNext steps:`);
    console.log(`1. The license has been created in the external system`);
    console.log(`2. Trigger sync via Lambda: scheduled-license-sync`);
    console.log(`   OR wait for automatic daily sync`);
    console.log(`3. User can login immediately after sync completes`);

  } catch (error) {
    console.error(`\n❌ Error renewing license:`, error);
    process.exit(1);
  }
}

main();
