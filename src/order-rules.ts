import { OrderStatus } from '@prisma/client';

export const allowedStatusTransitions: Record<OrderStatus, OrderStatus[]> = {
    NEW: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
    CONFIRMED: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
    PREPARING: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED],
    OUT_FOR_DELIVERY: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
    DELIVERED: [],
    CANCELLED: []
};

export function calculateLineTotal(price: number, quantity: number) {
    if (!Number.isInteger(price) || price < 0 || !Number.isInteger(quantity) || quantity < 1) throw new Error('Invalid price or quantity');
    return price * quantity;
}
