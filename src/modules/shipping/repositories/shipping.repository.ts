import { Prisma } from "@prisma/client";
import { prisma } from "@/database/prisma";
import { cached, cacheKey } from "@/database/redis";
export class ShippingRepository {
  async listZones() {
    return prisma.shippingZone.findMany({
      orderBy: { name: "asc" },
      include: { methods: { where: { isActive: true }, orderBy: { sortOrder: "asc" } }, rules: true },
    });
  }

  findZone(id: string) {
    return prisma.shippingZone.findUnique({ where: { id }, include: { methods: true, rules: true } });
  }

  async findZoneForDestination(params: { country: string; region?: string; city?: string }) {
    return cached(
      cacheKey("shipping-zone", params.country, params.region ?? ""),
      async () => {
        const zones = await prisma.shippingZone.findMany({
          where: { isActive: true, countries: { has: params.country } },
          include: { methods: { where: { isActive: true }, orderBy: { sortOrder: "asc" } }, rules: { where: { isActive: true }, orderBy: { priority: "desc" } } },
        });
        if (zones.length === 0) return null;

        // Prefer the most specific zone (region/city match), else first match.
        const withRegion = params.region
          ? zones.find((z) => z.regions.includes(params.region!))
          : undefined;
        const withCity = params.city ? zones.find((z) => z.cities.includes(params.city!)) : undefined;
        return withCity ?? withRegion ?? zones[0]!;
      },
      600,
    );
  }

  createZone(data: Prisma.ShippingZoneCreateInput) {
    return prisma.shippingZone.create({ data });
  }

  updateZone(id: string, data: Prisma.ShippingZoneUpdateInput) {
    return prisma.shippingZone.update({ where: { id }, data });
  }

  deleteZone(id: string) {
    return prisma.shippingZone.delete({ where: { id } });
  }

  createMethod(data: Prisma.ShippingMethodUncheckedCreateInput) {
    return prisma.shippingMethod.create({ data });
  }

  updateMethod(id: string, data: Prisma.ShippingMethodUncheckedUpdateInput) {
    return prisma.shippingMethod.update({ where: { id }, data });
  }

  deleteMethod(id: string) {
    return prisma.shippingMethod.delete({ where: { id } });
  }

  createRule(data: Prisma.ShippingRuleUncheckedCreateInput) {
    return prisma.shippingRule.create({ data });
  }

  deleteRule(id: string) {
    return prisma.shippingRule.delete({ where: { id } });
  }

  listMethods() {
    return prisma.shippingMethod.findMany({
      where: { isActive: true },
      include: { zone: true },
      orderBy: { sortOrder: "asc" },
    });
  }
}

export const shippingRepository = new ShippingRepository();
