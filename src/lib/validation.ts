import { z } from 'zod';
import { HAZARD_CATEGORIES, SEVERITIES } from './types';

/** Shared validation rules. Messages are i18n keys resolved by the form UI. */
export const emailSchema = z.string().trim().toLowerCase().email('auth.v_email');
export const passwordSchema = z
  .string()
  .min(8, 'auth.v_password')
  .max(72, 'auth.v_password')
  .regex(/[A-Za-z؀-ۿ]/, 'auth.v_password')
  .regex(/[0-9٠-٩]/, 'auth.v_password');

export const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, 'auth.v_password') });

export const signUpSchema = z
  .object({
    fullName: z.string().trim().min(2, 'auth.v_name').max(80, 'auth.v_name'),
    email: emailSchema,
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'auth.v_match' });

export const resetSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'auth.v_match' });

export const forgotSchema = z.object({ email: emailSchema });

/** Final check before a report is queued; mirrors the server-side validation. */
export const reportSchema = z.object({
  category: z.enum(HAZARD_CATEGORIES),
  severity: z.enum(SEVERITIES),
  description: z.string().trim().max(1000),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  photos: z.array(z.object({ uri: z.string().min(1) })).min(1).max(6),
});

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type ResetValues = z.infer<typeof resetSchema>;
export type ForgotValues = z.infer<typeof forgotSchema>;
