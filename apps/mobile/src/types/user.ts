import { z } from 'zod';

// Zod schemas for runtime validation
export const UserProfileSchema = z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    // Null for Google accounts until the app collects it — a Google ID token
    // never carries a phone number.
    mobile: z.string().nullable().optional(),
    authProvider: z.string().optional().default('password'),
    avatarUrl: z.string().url().optional(),
    createdAt: z.string().datetime().optional(),
    isAdmin: z.boolean().optional().default(false),
});

export const TransactionSchema = z.object({
    id: z.string(),
    amount: z.number(),
    type: z.enum(['credit', 'debit']),
    description: z.string(),
    date: z.string().datetime(),
});

export const WalletBalanceSchema = z.object({
    currency: z.string(),
    amount: z.number(),
    transactions: z.array(TransactionSchema),
});

// TypeScript types derived from schemas
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type WalletBalance = z.infer<typeof WalletBalanceSchema>;
