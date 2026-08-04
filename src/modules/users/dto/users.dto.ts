import { z } from "zod";
import { EmailSchema, PhoneSchema } from "@/shared/dto";
import { AddressType } from "@prisma/client";

export const UpdateProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    phone: PhoneSchema,
    locale: z.string().length(2).optional(),
    currency: z.string().length(3).optional(),
    marketingOptIn: z.boolean().optional(),
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z
      .string()
      .min(8)
      .max(72)
      .regex(/[a-z]/)
      .regex(/[A-Z]/)
      .regex(/[0-9]/),
  })
  .strict();

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const UpdateEmailSchema = z
  .object({
    email: EmailSchema,
  })
  .strict();

export type UpdateEmailInput = z.infer<typeof UpdateEmailSchema>;

export const CreateAddressSchema = z
  .object({
    label: z.string().trim().max(50).optional(),
    type: z.nativeEnum(AddressType).default(AddressType.SHIPPING),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    phone: PhoneSchema,
    line1: z.string().trim().min(1).max(200),
    line2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().min(1).max(100),
    postalCode: z.string().trim().max(20).optional(),
    country: z.string().length(2).default("NG"),
    isDefault: z.boolean().default(false),
  })
  .strict();

export type CreateAddressInput = z.infer<typeof CreateAddressSchema>;

export const UpdateAddressSchema = CreateAddressSchema.partial();

export type UpdateAddressInput = z.infer<typeof UpdateAddressSchema>;
