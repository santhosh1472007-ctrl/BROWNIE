import { OrderStatus, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { allowedStatusTransitions } from './order-rules.js';

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET;
const frontendUrl = process.env.FRONTEND_URL || `http://localhost:${port}`;
if (!jwtSecret) throw new Error('JWT_SECRET is required');

const customerSchema = z.object({
    customerName: z.string().trim().min(2).max(100),
    customerPhone: z.string().trim().regex(/^\+?[0-9\s-]{7,15}$/),
    customerAddress: z.string().trim().min(8).max(500),
    items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(30) })).min(1).max(50)
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(200) });
const statusSchema = z.object({ status: z.nativeEnum(OrderStatus) });

const publicOrderLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false });
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: frontendUrl, credentials: true }));
app.use(express.json({ limit: '32kb' }));
app.use('/api/orders', publicOrderLimiter);

function issueToken(adminId: string) {
    return jwt.sign({ sub: adminId, role: 'admin' }, jwtSecret!, { expiresIn: '8h' });
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Authentication required.' });
    try {
        const payload = jwt.verify(token, jwtSecret!);
        if (typeof payload !== 'object' || payload.role !== 'admin' || typeof payload.sub !== 'string') throw new Error('Invalid token');
        res.locals.adminId = payload.sub;
        next();
    } catch {
        return res.status(401).json({ error: 'Authentication required.' });
    }
}

app.post('/api/auth/login', async (req, res, next) => {
    try {
        const { email, password } = loginSchema.parse(req.body);
        const admin = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } });
        if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) return res.status(401).json({ error: 'Invalid email or password.' });
        return res.json({ token: issueToken(admin.id), admin: { email: admin.email } });
    } catch (error) {
        console.error('Admin login failed:', error instanceof Error ? error.message : 'Unknown error');
        return res.status(503).json({ error: 'The order service is unavailable. Please try again shortly.' });
    }
});

app.post('/api/orders', async (req, res, next) => {
    try {
        const input = customerSchema.parse(req.body);
        const idempotencyKey = req.header('Idempotency-Key');
        if (idempotencyKey && idempotencyKey.length <= 100) {
            const existing = await prisma.order.findUnique({ where: { idempotencyKey }, include: { items: true } });
            if (existing) return res.json({ success: true, order: { orderNumber: existing.orderNumber, status: existing.status, total: existing.total, items: existing.items.map(item => ({ name: item.productNameSnapshot, quantity: item.quantity, price: item.unitPriceSnapshot })) } });
        }
        const productIds = [...new Set(input.items.map(item => item.productId))];
        const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
        const byId = new Map(products.map(product => [product.id, product]));
        for (const item of input.items) {
            const product = byId.get(item.productId);
            if (!product) return res.status(400).json({ error: 'One of the selected brownies is no longer available.' });
            if (!product.available) return res.status(409).json({ error: `${product.name} is currently unavailable.` });
        }
        const pricedItems = input.items.map(item => {
            const product = byId.get(item.productId)!;
            return { productId: product.id, productNameSnapshot: product.name, unitPriceSnapshot: product.price, quantity: item.quantity, lineTotal: product.price * item.quantity };
        });
        const subtotal = pricedItems.reduce((sum, item) => sum + item.lineTotal, 0);
        const order = await prisma.$transaction(async transaction => transaction.order.create({
            data: {
                orderNumber: `BRW-${Date.now().toString(36).toUpperCase()}`,
                idempotencyKey: idempotencyKey && idempotencyKey.length <= 100 ? idempotencyKey : undefined,
                customerName: input.customerName,
                customerPhone: input.customerPhone,
                customerAddress: input.customerAddress,
                subtotal,
                total: subtotal,
                items: { create: pricedItems }
            },
            include: { items: true }
        }));
        return res.status(201).json({ success: true, order: { orderNumber: order.orderNumber, status: order.status, total: order.total, items: order.items.map(item => ({ name: item.productNameSnapshot, quantity: item.quantity, price: item.unitPriceSnapshot })) } });
    } catch (error) {
        console.error('Order creation failed:', error instanceof Error ? error.message : 'Unknown error');
        return res.status(503).json({ error: 'Unable to place your order right now. Your cart is still saved. Please try again.' });
    }
});

app.get('/api/admin/orders', requireAdmin, async (req, res, next) => {
    try {
        const status = typeof req.query.status === 'string' && Object.values(OrderStatus).includes(req.query.status as OrderStatus) ? req.query.status as OrderStatus : undefined;
        const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
        const orders = await prisma.order.findMany({ where: { ...(status ? { status } : {}), ...(search ? { OR: [{ orderNumber: { contains: search, mode: 'insensitive' } }, { customerName: { contains: search, mode: 'insensitive' } }, { customerPhone: { contains: search } }] } : {}) }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, orderNumber: true, customerName: true, customerPhone: true, total: true, status: true, createdAt: true } });
        return res.json({ orders });
    } catch (error) { next(error); }
});

app.get('/api/admin/orders/:id', requireAdmin, async (req, res, next) => {
    try {
        const orderId = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
        const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
        if (!order) return res.status(404).json({ error: 'Order not found.' });
        return res.json({ order });
    } catch (error) { next(error); }
});

app.patch('/api/admin/orders/:id/status', requireAdmin, async (req, res, next) => {
    try {
        const { status } = statusSchema.parse(req.body);
        const orderId = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
        const current = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
        if (!current) return res.status(404).json({ error: 'Order not found.' });
        if (!allowedStatusTransitions[current.status].includes(status)) return res.status(409).json({ error: `Cannot move an order from ${current.status} to ${status}.` });
        const order = await prisma.order.update({ where: { id: orderId }, data: { status }, select: { id: true, orderNumber: true, status: true, updatedAt: true } });
        return res.json({ order });
    } catch (error) { next(error); }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, '..');
app.get('/admin', (_req, res) => res.sendFile(path.join(projectRoot, 'admin', 'index.html')));
app.get('/admin/login', (_req, res) => res.sendFile(path.join(projectRoot, 'admin', 'login.html')));
app.use(express.static(projectRoot, { extensions: ['html'] }));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Please check the submitted information.' });
    console.error('Request failed:', error instanceof Error ? error.message : 'Unknown error');
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(port, () => console.log(`Brownie website running at http://localhost:${port}`));
