#!/usr/bin/env node

/**
 * Script to update CloudFront domain in environment files after deployment
 * This ensures the Quick Create Link uses the correct CloudFront URL for templates
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENV_FILES = ['.env', '.env.local', '.env.deploy'];
const STACK_NAME = 'EvoUdsDevelopmentFrontendStack';

async function updateCloudFrontDomain() {
  try {
    console.log('🔍 Getting CloudFront domain from AWS...');
    
    // Get CloudFront domain from CloudFormation stack outputs
    const command = `aws cloudformation describe-stacks --stack-name ${STACK_NAME} --query 'Stacks[0].Outputs[?OutputKey==\`FrontendUrl\`].OutputValue' --output text`;
    
    let frontendUrl;
    try {
      frontendUrl = execSync(command, { encoding: 'utf8' }).trim();
    } catch (error) {
      console.error('❌ Error getting CloudFront domain from AWS:', error.message);
      console.log('💡 Make sure you have deployed the frontend stack first:');
      console.log('   cd infra && npm run deploy:dev');
      process.exit(1);
    }

    if (!frontendUrl || frontendUrl === 'None') {
      console.error('❌ No CloudFront domain found in stack outputs');
      process.exit(1);
    }

    // Extract domain from URL
    const domain = frontendUrl.replace('https://', '').replace('http://', '');
    console.log(`✅ Found CloudFront domain: ${domain}`);

    // Update environment files
    let updatedFiles = 0;
    
    for (const envFile of ENV_FILES) {
      const envPath = path.join(process.cwd(), envFile);
      
      if (!fs.existsSync(envPath)) {
        console.log(`⏭️  Skipping ${envFile} (not found)`);
        continue;
      }

      let content = fs.readFileSync(envPath, 'utf8');
      const originalContent = content;

      // Update or add VITE_CLOUDFRONT_DOMAIN
      const domainRegex = /^VITE_CLOUDFRONT_DOMAIN=.*$/m;
      const newDomainLine = `VITE_CLOUDFRONT_DOMAIN=${domain}`;

      if (domainRegex.test(content)) {
        content = content.replace(domainRegex, newDomainLine);
        console.log(`📝 Updated VITE_CLOUDFRONT_DOMAIN in ${envFile}`);
      } else {
        // Add to the CloudFront section if it exists, otherwise at the end
        const cloudFrontSectionRegex = /# ===== AWS CLOUDFRONT =====/;
        if (cloudFrontSectionRegex.test(content)) {
          content = content.replace(
            /# ===== AWS CLOUDFRONT =====\n/,
            `# ===== AWS CLOUDFRONT =====\n${newDomainLine}\n`
          );
        } else {
          content += `\n# ===== AWS CLOUDFRONT =====\n${newDomainLine}\n`;
        }
        console.log(`➕ Added VITE_CLOUDFRONT_DOMAIN to ${envFile}`);
      }

      // Only write if content changed
      if (content !== originalContent) {
        fs.writeFileSync(envPath, content);
        updatedFiles++;
      }
    }

    console.log(`\n🎉 Successfully updated ${updatedFiles} environment file(s)`);
    console.log(`📋 CloudFront domain: ${domain}`);
    console.log(`🔗 Template URL: https://${domain}/cloudformation/evo-platform-role.yaml`);
    
    console.log('\n📝 Next steps:');
    console.log('1. Restart your development server to pick up the new environment variable');
    console.log('2. Test the Quick Create Link - it should now use the CloudFront URL');
    console.log('3. Verify the CloudFormation template is accessible at the URL above');

  } catch (error) {
    console.error('❌ Error updating CloudFront domain:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  updateCloudFrontDomain();
}

export { updateCloudFrontDomain };