import { ShippingCalculationType } from "@prisma/client";
import { shippingRepository } from "../repositories/shipping.repository";
import { NotFoundError, ConflictError } from "@/shared/errors";
import { roundMoney, toNumber } from "@/utils/money";
import { cacheDelPattern } from "@/database/redis";
import { env } from "@/config";
import type {
  CreateShippingMethodInput,
  CreateShippingRuleInput,
  CreateShippingZoneInput,
  EstimateShippingInput,
  ShippingEstimateResult,
  UpdateShippingMethodInput,
  UpdateShippingZoneInput,
} from "../validators";

export class ShippingService {
  listZones() {
    return shippingRepository.listZones();
  }

  async estimate(input: EstimateShippingInput): Promise<ShippingEstimateResult> {
    const zone = await shippingRepository.findZoneForDestination({
      country: input.country,
      region: input.region,
      city: input.city,
    });

    const methods = (zone?.methods ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      code: m.code,
      rate: this.calculateMethodRate(m, input),
      estimatedDaysMin: m.estimatedDaysMin,
      estimatedDaysMax: m.estimatedDaysMax,
      isPickup: m.isPickup,
    }));

    // Apply zone rules (location/weight based adjustments)
    const rules = zone?.rules ?? [];
    let ruleCharge: number | null = null;
    if (rules.length > 0) {
      const applicable = rules.find(
        (r) =>
          (r.minSubtotal === null || input.subtotal >= Number(r.minSubtotal)) &&
          (r.maxSubtotal === null || input.subtotal <= Number(r.maxSubtotal)) &&
          (r.minWeight === null || input.weightKg >= Number(r.minWeight)) &&
          (r.maxWeight === null || input.weightKg <= Number(r.maxWeight)),
      );
      if (applicable) ruleCharge = toNumber(applicable.charge);
    }

    let finalMethods = methods;
    if (ruleCharge !== null) {
      finalMethods = finalMethods.map((m) => ({
        ...m,
        rate: m.isPickup ? m.rate : roundMoney(ruleCharge!),
      }));
    }

    const freeShipping =
      input.subtotal > 0 && env.FREE_SHIPPING_THRESHOLD > 0 && input.subtotal >= env.FREE_SHIPPING_THRESHOLD;

    let selected = null;
    if (input.preferredMethodId) {
      selected = finalMethods.find((m) => m.id === input.preferredMethodId) ?? null;
    }
    if (!selected && finalMethods.length > 0) {
      const first = finalMethods[0]!;
      selected = { id: first.id, name: first.name, rate: first.rate, estimatedDaysMin: first.estimatedDaysMin, estimatedDaysMax: first.estimatedDaysMax };
    }
    const cheapest = finalMethods.length
      ? finalMethods.reduce((acc, m) => (m.isPickup || toNumber(m.rate) <= toNumber(acc.rate) ? m : acc))
      : null;

    if (freeShipping && finalMethods.length) {
      const nonPickup = finalMethods.filter((m) => !m.isPickup);
      if (nonPickup.length) {
        const first = nonPickup[0]!;
        selected = { id: first.id, name: first.name, rate: 0, estimatedDaysMin: first.estimatedDaysMin, estimatedDaysMax: first.estimatedDaysMax };
      }
    }

    return {
      methods: finalMethods,
      selected: selected ? { id: selected.id, name: selected.name, rate: selected.rate, estimatedDaysMin: selected.estimatedDaysMin, estimatedDaysMax: selected.estimatedDaysMax } : null,
      cheapest: cheapest ? { id: cheapest.id, name: cheapest.name, rate: cheapest.rate, estimatedDaysMin: cheapest.estimatedDaysMin, estimatedDaysMax: cheapest.estimatedDaysMax } : null,
      freeShipping,
    };
  }

  private calculateMethodRate(
    m: {
      type: ShippingCalculationType;
      baseRate: unknown;
      ratePerKg: unknown;
      freeAbove: unknown;
      minWeight: unknown;
      maxWeight: unknown;
      isPickup: boolean;
    },
    input: EstimateShippingInput,
  ): number {
    if (m.isPickup) return 0;

    if (m.freeAbove !== null && input.subtotal >= toNumber(m.freeAbove)) return 0;

    if (m.minWeight !== null && input.weightKg < toNumber(m.minWeight)) return Infinity;
    if (m.maxWeight !== null && input.weightKg > toNumber(m.maxWeight)) return Infinity;

    switch (m.type) {
      case ShippingCalculationType.WEIGHT_BASED: {
        const ratePerKg = toNumber(m.ratePerKg);
        return roundMoney(toNumber(m.baseRate) + input.weightKg * ratePerKg);
      }
      case ShippingCalculationType.FREE:
        return 0;
      default:
        return roundMoney(toNumber(m.baseRate));
    }
  }

  // --- admin ----------------------------------------------------------------

  async createZone(input: CreateShippingZoneInput) {
    const zone = await shippingRepository.createZone(input);
    await this.evict();
    return zone;
  }

  async updateZone(id: string, input: UpdateShippingZoneInput) {
    await this.ensureZone(id);
    const zone = await shippingRepository.updateZone(id, input);
    await this.evict();
    return zone;
  }

  async removeZone(id: string) {
    await this.ensureZone(id);
    await shippingRepository.deleteZone(id);
    await this.evict();
    return { id };
  }

  async createMethod(input: CreateShippingMethodInput) {
    await this.ensureZone(input.zoneId);
    const existing = await shippingRepository.listMethods();
    if (existing.some((m) => m.code === input.code)) {
      throw new ConflictError("A shipping method with this code already exists");
    }
    const method = await shippingRepository.createMethod(input);
    await this.evict();
    return method;
  }

  async updateMethod(id: string, input: UpdateShippingMethodInput) {
    const method = await shippingRepository.updateMethod(id, input);
    await this.evict();
    return method;
  }

  async removeMethod(id: string) {
    await shippingRepository.deleteMethod(id);
    await this.evict();
    return { id };
  }

  async createRule(input: CreateShippingRuleInput) {
    await this.ensureZone(input.zoneId);
    const rule = await shippingRepository.createRule(input);
    await this.evict();
    return rule;
  }

  async removeRule(id: string) {
    await shippingRepository.deleteRule(id);
    await this.evict();
    return { id };
  }

  private async ensureZone(id: string) {
    const zone = await shippingRepository.findZone(id);
    if (!zone) throw new NotFoundError("Shipping zone not found");
  }

  private evict() {
    return cacheDelPattern("cache:shipping*");
  }
}

export const shippingService = new ShippingService();
