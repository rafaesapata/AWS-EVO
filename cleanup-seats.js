// Cleanup script para remover seat assignments incorretos
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function cleanup() {
  try {
    console.log('Starting seat cleanup...');
    
    // 1. Find the license
    const license = await prisma.license.findFirst({
      where: {
        license_key: 'NC-C7FD-5186-BCAC-CFD5',
        organization_id: 'f7c9c432-d2c9-41ad-be8f-38883c06cb48'
      }
    });
    
    if (!license) {
      console.log('License not found');
      return;
    }
    
    console.log('License found:', license.id);
    
    // 2. Get all profiles from the organization
    const orgProfiles = await prisma.profile.findMany({
      where: { organization_id: 'f7c9c432-d2c9-41ad-be8f-38883c06cb48' },
      select: { user_id: true }
    });
    
    const validUserIds = orgProfiles.map(p => p.user_id);
    console.log('Valid user IDs for organization:', validUserIds);
    
    // 3. Find invalid seat assignments
    const invalidSeats = await prisma.licenseSeatAssignment.findMany({
      where: {
        license_id: license.id,
        user_id: {
          notIn: validUserIds
        }
      }
    });
    
    console.log('Invalid seats found:', invalidSeats.length);
    console.log('Invalid seat IDs:', invalidSeats.map(s => s.id));
    
    // 4. Delete invalid seats
    if (invalidSeats.length > 0) {
      const deleteResult = await prisma.licenseSeatAssignment.deleteMany({
        where: {
          id: { in: invalidSeats.map(s => s.id) }
        }
      });
      
      console.log('Deleted seats:', deleteResult.count);
      
      // 5. Update license counts
      const remainingSeats = await prisma.licenseSeatAssignment.count({
        where: { license_id: license.id }
      });
      
      await prisma.license.update({
        where: { id: license.id },
        data: {
          used_seats: remainingSeats,
          available_seats: license.max_users - remainingSeats
        }
      });
      
      console.log('Updated license counts - used:', remainingSeats, 'available:', license.max_users - remainingSeats);
    }
    
    console.log('Cleanup completed successfully');
    
  } catch (error) {
    console.error('Cleanup failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanup();