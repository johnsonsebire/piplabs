const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const strats = await prisma.strategy.findMany();
  for (const s of strats) {
    if (s.name.includes("EMA3")) {
      console.log(`\nStrategy: ${s.name}`);
      console.log(`Code: ${s.code}`);
    }
  }
}
run().catch(console.error).finally(() => prisma.$disconnect());
