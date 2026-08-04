import { CouponType } from "@prisma/client";
import { couponRepository } from "../repositories/coupon.repository";
import { ConflictError, CouponError, NotFoundError } from "@/shared/errors";
import { roundMoney } from "@/utils/money";
import { cacheDelPattern } from "@/database/redis";
import type {
  CouponValidationContext,
  CouponValidationResult,
  CreateCouponInput,
  UpdateCouponInput,
  CouponQuery,
} from "../validators";

export class CouponService {
  async validate(code: string, ctx: CouponValidationContext): Promise<CouponValidationResult> {
    const result = await this.validateSilent(code, ctx);
    if (!result.valid || !result.coupon) {
      throw new CouponError(result.message ?? "Coupon is not valid");
    }
    return result;
  }

  async validateSilent(code: string, ctx: CouponValidationContext): Promise<CouponValidationResult> {
    const coupon = await couponRepository.findByCode(code);
    if (!coupon) return { valid: false, discount: 0, message: "Coupon not found" };

    const now = new Date();
    if (!coupon.isActive) return { valid: false, discount: 0, message: "Coupon is inactive" };
    if (coupon.startsAt && coupon.startsAt > now) return { valid: false, discount: 0, message: "Coupon is not active yet" };
    if (coupon.expiresAt && coupon.expiresAt < now) return { valid: false, discount: 0, message: "Coupon has expired" };
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return { valid: false, discount: 0, message: "Coupon usage limit reached" };
    }
    if (ctx.subtotal <= 0) return { valid: false, discount: 0, message: "Cart is empty" };
    if (coupon.minPurchaseAmount && ctx.subtotal < Number(coupon.minPurchaseAmount)) {
      return { valid: false, discount: 0, message: `Minimum purchase of ${coupon.minPurchaseAmount} required` };
    }

    // Customer-specific coupons
    if (coupon.customerEmails.length > 0) {
      if (!ctx.email && !ctx.userId) {
        return { valid: false, discount: 0, message: "Coupon requires an account" };
      }
      if (ctx.email && !coupon.customerEmails.includes(ctx.email)) {
        return { valid: false, discount: 0, message: "Coupon not valid for this customer" };
      }
    }

    // Per-user limit
    if (ctx.userId && coupon.perUserLimit) {
      const redemptions = await couponRepository.countUserRedemptions(coupon.id, ctx.userId);
      if (redemptions >= coupon.perUserLimit) {
        return { valid: false, discount: 0, message: "You have already used this coupon" };
      }
    }

    // Restriction scope (ALL | CATEGORY | COLLECTION | PRODUCT)
    if (coupon.appliesTo !== "ALL") {
      const matches = this.scopeMatches(coupon.appliesTo, coupon.applicableIds, ctx);
      if (!matches) {
        return { valid: false, discount: 0, message: "Coupon does not apply to items in your cart" };
      }
    }

    // Compute discount
    let discount = 0;
    const base = roundMoney(ctx.subtotal);
    switch (coupon.type) {
      case CouponType.PERCENTAGE:
        discount = roundMoney((base * Number(coupon.value)) / 100);
        if (coupon.maxDiscountAmount) {
          discount = Math.min(discount, Number(coupon.maxDiscountAmount));
        }
        break;
      case CouponType.FIXED:
        discount = Math.min(Number(coupon.value), base);
        break;
      case CouponType.FREE_SHIPPING:
        discount = 0; // handled by shipping calculation
        break;
      case CouponType.BUY_X_GET_Y: {
        const buy = coupon.buyXGetYBuy ?? 1;
        const get = coupon.buyXGetYGet ?? 0;
        if (get > 0 && buy > 0 && ctx.itemCount) {
          const freeItems = Math.floor(ctx.itemCount / (buy + get)) * get;
          const unit = base / ctx.itemCount;
          discount = roundMoney(freeItems * unit);
        }
        break;
      }
    }

    discount = roundMoney(Math.min(discount, base));

    return {
      valid: true,
      coupon: { id: coupon.id, code: coupon.code, type: coupon.type, value: Number(coupon.value) },
      discount,
    };
  }

  private scopeMatches(
    appliesTo: string,
    applicableIds: string[],
    ctx: CouponValidationContext,
  ): boolean {
    const ids = new Set(applicableIds);
    if (appliesTo === "PRODUCT" && ctx.productIds) {
      return ctx.productIds.some((id) => ids.has(id));
    }
    if (appliesTo === "CATEGORY" && ctx.categoryIds) {
      return ctx.categoryIds.some((id) => ids.has(id));
    }
    if (appliesTo === "COLLECTION" && ctx.collectionIds) {
      return ctx.collectionIds.some((id) => ids.has(id));
    }
    return false;
  }

  // --- admin ----------------------------------------------------------------

  list(query: CouponQuery) {
    return couponRepository.list(query);
  }

  get(id: string) {
    return couponRepository.findById(id);
  }

  async create(input: CreateCouponInput) {
    const existing = await couponRepository.findByCode(input.code);
    if (existing) throw new ConflictError("A coupon with this code already exists");
    return couponRepository.create({
      code: input.code,
      type: input.type,
      value: input.value,
      maxDiscountAmount: input.maxDiscountAmount,
      minPurchaseAmount: input.minPurchaseAmount,
      freeShippingOnly: input.freeShippingOnly,
      buyXGetYBuy: input.buyXGetYBuy,
      buyXGetYGet: input.buyXGetYGet,
      isActive: input.isActive,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      usageLimit: input.usageLimit,
      perUserLimit: input.perUserLimit,
      appliesTo: input.appliesTo,
      applicableIds: input.applicableIds,
      isSingleUse: input.isSingleUse,
      isStackable: input.isStackable,
      customerEmails: input.customerEmails,
    });
  }

  async update(id: string, input: UpdateCouponInput) {
    const existing = await couponRepository.findById(id);
    if (!existing) throw new NotFoundError("Coupon not found");
    if (input.code && input.code !== existing.code) {
      const dup = await couponRepository.findByCode(input.code);
      if (dup) throw new ConflictError("A coupon with this code already exists");
    }
    return couponRepository.update(id, {
      code: input.code,
      type: input.type,
      value: input.value,
      maxDiscountAmount: input.maxDiscountAmount,
      minPurchaseAmount: input.minPurchaseAmount,
      freeShippingOnly: input.freeShippingOnly,
      buyXGetYBuy: input.buyXGetYBuy,
      buyXGetYGet: input.buyXGetYGet,
      isActive: input.isActive,
      startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      usageLimit: input.usageLimit,
      perUserLimit: input.perUserLimit,
      appliesTo: input.appliesTo,
      applicableIds: input.applicableIds,
      isSingleUse: input.isSingleUse,
      isStackable: input.isStackable,
      customerEmails: input.customerEmails,
    });
  }

  async remove(id: string) {
    const existing = await couponRepository.findById(id);
    if (!existing) throw new NotFoundError("Coupon not found");
    await couponRepository.delete(id);
    await cacheDelPattern("cache:coupon*");
    return { id };
  }

  /** Record a successful redemption (after order creation). */
  async recordRedemption(params: { couponId: string; orderId: string; userId?: string; discountApplied: number }) {
    await couponRepository.recordRedemption(params);
  }
}

export const couponService = new CouponService();
