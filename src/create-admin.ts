import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const prisma = new PrismaClient();
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD before creating an admin.');

const passwordHash = await bcrypt.hash(password, 12);
await prisma.adminUser.upsert({ where: { email: email.toLowerCase() }, update: { passwordHash }, create: { email: email.toLowerCase(), passwordHash } });
console.log(`Admin account ready for ${email.toLowerCase()}.`);
await prisma.$disconnect();
