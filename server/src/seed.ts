import "dotenv/config";
import { prisma } from "./db.js";
import { hashPassword } from "./auth.js";

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin123";
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User ${email} already exists, skipping.`);
  } else {
    await prisma.user.create({
      data: { email, name, passwordHash: await hashPassword(password), isAdmin: true },
    });
    console.log(`Created admin user: ${email} / ${password}`);
  }

  // Default squads with their board id / project key (idempotent by name).
  const defaults = [
    { name: "Athens", defaultBoardId: "ATH" },
    { name: "Berlin", defaultBoardId: "BER" },
    { name: "Cairo", defaultBoardId: "CAI" },
  ];
  for (const s of defaults) {
    const squad = await prisma.squad.upsert({
      where: { name: s.name },
      create: s,
      update: { defaultBoardId: s.defaultBoardId },
    });
    console.log(`Squad ready: ${squad.name} (board ${squad.defaultBoardId})`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
