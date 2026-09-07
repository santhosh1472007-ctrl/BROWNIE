import { OrderStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { allowedStatusTransitions, calculateLineTotal } from './order-rules.js';

describe('order rules', () => {
    it('calculates totals from server-side price snapshots', () => {
        expect(calculateLineTotal(149, 2)).toBe(298);
        expect(calculateLineTotal(159, 1) + calculateLineTotal(149, 1)).toBe(308);
    });

    it('allows only forward lifecycle transitions or cancellation', () => {
        expect(allowedStatusTransitions[OrderStatus.NEW]).toContain(OrderStatus.CONFIRMED);
        expect(allowedStatusTransitions[OrderStatus.CONFIRMED]).toContain(OrderStatus.PREPARING);
        expect(allowedStatusTransitions[OrderStatus.DELIVERED]).not.toContain(OrderStatus.PREPARING);
        expect(allowedStatusTransitions[OrderStatus.CANCELLED]).toHaveLength(0);
    });

    it('rejects invalid quantities', () => {
        expect(() => calculateLineTotal(149, 0)).toThrow();
        expect(() => calculateLineTotal(149, 1.5)).toThrow();
    });
});
