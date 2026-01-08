const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const configs = await prisma.wafMonitoringConfig.findMany({
    where: {
      organization_id: '0f1b33dc-cd5f-49e5-8579-fb4e7b1f5a42'
    },
    orderBy: { created_at: 'desc' }
  });
  
  console.log('Total configs:', configs.length);
  configs.forEach(config => {
    console.log('\n---');
    console.log('ID:', config.id);
    console.log('Web ACL:', config.web_acl_name);
    console.log('Active:', config.is_active);
    console.log('Filter Mode:', config.filter_mode);
    console.log('Events Today:', config.events_today);
    console.log('Blocked Today:', config.blocked_today);
    console.log('Last Event:', config.last_event_at);
    console.log('Created:', config.created_at);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
