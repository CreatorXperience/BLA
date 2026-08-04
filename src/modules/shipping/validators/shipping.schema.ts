import { z } from "zod";
import { ShippingCalculationType, ShippingZoneType } from "@prisma/client";

export const CreateShippingZoneSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    type: z.nativeEnum(ShippingZoneType).default(ShippingZoneType.COUNTRY),
    countries: z.array(z.string().length(2)).default([]),
    regions: z.array(z.string().trim()).default([]),
    cities: z.array(z.string().trim()).default([]),
    isActive: z.boolean().default(true),
  })
  .strict();

export type CreateShippingZoneInput = z.infer<typeof CreateShippingZoneSchema>;

export const UpdateShippingZoneSchema = CreateShippingZoneSchema.partial();

export type UpdateShippingZoneInput = z.infer<typeof UpdateShippingZoneSchema>;

export const CreateShippingMethodSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    code: z.string().trim().min(1).max(50).toUpperCase(),
    zoneId: z.string().min(1),
    type: z.nativeEnum(ShippingCalculationType).default(ShippingCalculationType.FLAT),
    baseRate: z.coerce.number().min(0).default(0),
    freeAbove: z.coerce.number().min(0).optional(),
    minWeight: z.coerce.number().min(0).optional(),
    maxWeight: z.coerce.number().min(0).optional(),
    ratePerKg: z.coerce.number().min(0).optional(),
    estimatedDaysMin: z.coerce.number().int().min(0).optional(),
    estimatedDaysMax: z.coerce.number().int().min(0).optional(),
    isActive: z.boolean().default(true),
    isPickup: z.boolean().default(false),
    sortOrder: z.number().int().min(0).default(0),
  })
  .strict();

export type CreateShippingMethodInput = z.infer<typeof CreateShippingMethodSchema>;

export const UpdateShippingMethodSchema = CreateShippingMethodSchema.partial();

export type UpdateShippingMethodInput = z.infer<typeof UpdateShippingMethodSchema>;

export const CreateShippingRuleSchema = z
  .object({
    zoneId: z.string().min(1),
    name: z.string().trim().min(1).max(100),
    priority: z.number().int().min(0).default(0),
    minSubtotal: z.coerce.number().min(0).optional(),
    maxSubtotal: z.coerce.number().min(0).optional(),
    minWeight: z.coerce.number().min(0).optional(),
    maxWeight: z.coerce.number().min(0).optional(),
    charge: z.coerce.number().min(0),
    isActive: z.boolean().default(true),
  })
  .strict();

export type CreateShippingRuleInput = z.infer<typeof CreateShippingRuleSchema>;

export const EstimateShippingSchema = z
  .object({
    country: z.string().length(2),
    region: z.string().trim().max(100).optional(),
    city: z.string().trim().max(100).optional(),
    subtotal: z.coerce.number().min(0),
    weightKg: z.coerce.number().min(0).default(0),
    preferredMethodId: z.string().optional(),
  })
  .strict();

export type EstimateShippingInput = z.infer<typeof EstimateShippingSchema>;

export interface ShippingEstimateResult {
  methods: Array<{
    id: string;
    name: string;
    code: string;
    rate: string | number;
    estimatedDaysMin: number | null;
    estimatedDaysMax: number | null;
    isPickup: boolean;
  }>;
  selected: { id: string; name: string; rate: string | number; estimatedDaysMin: number | null; estimatedDaysMax: number | null } | null;
  cheapest: { id: string; name: string; rate: string | number; estimatedDaysMin: number | null; estimatedDaysMax: number | null } | null;
  freeShipping: boolean;
}
