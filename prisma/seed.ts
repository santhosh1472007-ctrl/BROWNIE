import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const products = [
    { id: 'classic', name: 'Classic Fudge Square', description: 'Dense, dark, unapologetically fudgy.', price: 149, image: 'static/classic fudge square.jpg' },
    { id: 'walnut', name: 'Walnut Crunch', description: 'Toasted walnuts folded into rich fudge.', price: 159, image: 'static/walnut brownie.jpg' },
    { id: 'nutella', name: 'Nutella Swirl', description: 'Hazelnut-chocolate ribboned through.', price: 169, image: 'static/nutella swirl.jpg' },
    { id: 'saltcaramel', name: 'Salted Caramel', description: 'Caramel core, flaky sea salt finish.', price: 169, image: 'static/salted carame;.jpg' },
    { id: 'assorted', name: 'Assorted Box of 6', description: 'A little bit of everything, boxed up.', price: 799, image: 'static/asserted box.jpg' }
];

async function main() {
    for (const product of products) {
        await prisma.product.upsert({ where: { id: product.id }, update: product, create: product });
    }
    const email = process.env.ADMIN_EMAIL || 'owner@example.com';
    const password = process.env.ADMIN_PASSWORD;
    if (!password) throw new Error('Set ADMIN_PASSWORD before seeding an admin account.');
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.adminUser.upsert({ where: { email }, update: { passwordHash }, create: { email, passwordHash } });
    console.log(`Seeded ${products.length} products and admin ${email}.`);
}

main().finally(() => prisma.$disconnect());
