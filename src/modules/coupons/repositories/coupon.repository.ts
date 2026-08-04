import { Prisma } from "@prisma/client";
import { prisma } from "@/database/prisma";
import type { CouponQuery } from "../validators";

export class CouponRepository {
  findByCode(code: string) {
    return prisma.coupon.findUnique({ where: { code } });
  }

  findById(id: string) {
    return prisma.coupon.findUnique({ where: { id } });
  }

  create(data: Prisma.CouponCreateInput) {
    return prisma.coupon.create({ data });
  }

  update(id: string, data: Prisma.CouponUpdateInput) {
    return prisma.coupon.update({ where: { id }, data });
  }

  delete(id: string) {
    return prisma.coupon.delete({ where: { id } });
  }

  async list(query: CouponQuery) {
    const where: Prisma.CouponWhereInput = {
      ...(query.q ? { code: { contains: query.q, mode: "insensitive" as const } } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.isActive === "true" ? { isActive: true } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.coupon.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      prisma.coupon.count({ where }),
    ]);
    return { data, total, page: query.page, perPage: query.perPage };
  }

  async countUserRedemptions(couponId: string, userId: string): Promise<number> {
    return prisma.couponRedemption.count({ where: { couponId, userId } });
  }

  async recordRedemption(params: { couponId: string; orderId: string; userId?: string; discountApplied: number }) {
    await prisma.$transaction([
      prisma.couponRedemption.create({
        data: {
          couponId: params.couponId,
          orderId: params.orderId,
          userId: params.userId,
          discountApplied: params.discountApplied,
        },
      }),
      prisma.coupon.update({ where: { id: params.couponId }, data: { usedCount: { increment: 1 } } }),
    ]);
  }
}

export const couponRepository = new CouponRepository();
