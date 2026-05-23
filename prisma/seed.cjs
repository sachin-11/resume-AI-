/**
 * Run: npx prisma db seed
 * Requires DATABASE_URL (e.g. from .env).
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const ADMIN_EMAIL = "rajeshsachin786@gmail.com";
const ADMIN_PASSWORD = "Rajeshsi@1";

async function main() {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      email: ADMIN_EMAIL,
      name: "Admin",
      password: hash,
      role: "admin",
      techStack: [],
    },
    update: {
      password: hash,
      role: "admin",
    },
  });

  console.log("Seed OK — admin user:", ADMIN_EMAIL);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
