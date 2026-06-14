import { PrismaClient, AnomalyStatus, ImportJobStatus, SplitType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Create default groups
  const group = await prisma.group.upsert({
    where: { id: 'dd7905d3-e42b-4aa2-b14c-0c29d5ae9ce7' },
    update: { name: 'group2', defaultCurrency: 'INR' },
    create: {
      id: 'dd7905d3-e42b-4aa2-b14c-0c29d5ae9ce7',
      name: 'group2',
      description: 'Shared house expenses group',
      defaultCurrency: 'INR'
    }
  });

  console.log(`Group "group2" upserted (ID: ${group.id})`);

  // 2. Create users & group memberships
  const usersToCreate = [
    { email: 'aisha123@gmail.com', name: 'Aisha', joinedAt: new Date('2026-02-01T00:00:00.000Z'), leftAt: null },
    { email: 'rohan123@gmail.com', name: 'Rohan', joinedAt: new Date('2026-02-01T00:00:00.000Z'), leftAt: null },
    { email: 'priya123@gmail.com', name: 'Priya', joinedAt: new Date('2026-02-01T00:00:00.000Z'), leftAt: null },
    { email: 'meera123@gmail.com', name: 'Meera', joinedAt: new Date('2026-02-01T00:00:00.000Z'), leftAt: new Date('2026-03-31T23:59:59.999Z') },
    { email: 'sam123@gmail.com', name: 'Sam', joinedAt: new Date('2026-04-15T00:00:00.000Z'), leftAt: null },
    { email: 'dev123@gmail.com', name: 'Dev', joinedAt: new Date('2026-02-01T00:00:00.000Z'), leftAt: null }
  ];

  const passwordHash = await bcrypt.hash('password', 10);
  
  for (const item of usersToCreate) {
    const user = await prisma.user.upsert({
      where: { email: item.email },
      update: { name: item.name },
      create: { email: item.email, name: item.name, passwordHash }
    });

    const existingMembership = await prisma.groupMembership.findFirst({
      where: { groupId: group.id, userId: user.id }
    });

    if (existingMembership) {
      await prisma.groupMembership.update({
        where: { id: existingMembership.id },
        data: {
          joinedAt: item.joinedAt,
          leftAt: item.leftAt
        }
      });
    } else {
      await prisma.groupMembership.create({
        data: {
          groupId: group.id,
          userId: user.id,
          joinedAt: item.joinedAt,
          leftAt: item.leftAt
        }
      });
    }
  }

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
