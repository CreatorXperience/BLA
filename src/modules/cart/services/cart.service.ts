import { CartStatus } from "@prisma/client";
import { prisma } from "@/database/prisma";
import { cartRepository } from "../repositories/cart.repository";
import { NotFoundError, InsufficientStockError, UnauthorizedError } from "@/shared/errors";
import { roundMoney, toNumber } from "@/utils/money";
import { cacheDelPattern } from "@/database/redis";
import type { CartItemDTO, CartResponse, CartTotals, AddToCartInput, UpdateCartItemInput, CartShippingInput, ApplyCouponInput } from "../types";
import { couponService } from "@/modules/coupons/services/coupon.service";
import { shippingService } from "@/modules/shipping/services/shipping.service";
import { env } from "@/config";

type CartWithItems = NonNullable<Awaited<ReturnType<typeof cartRepository.findByToken>>>;

export class CartService {
  /**
   * Resolve the active cart for a request.
   * - Logged-in users always use their persistent cart (created if missing).
   * - Guests use a token-based cart created on first add-to-cart.
   * - If a guest token is provided alongside a logged-in user, merge on read.
   */
  async resolveCart(params: { userId?: string; guestToken?: string }) {
    let cart: CartWithItems | null = null;

    if (params.userId) {
      cart = await cartRepository.findByUserId(params.userId);
      if (!cart) {
        cart = await cartRepository.createForUser(params.userId);
      }
    } else if (params.guestToken) {
      cart = await cartRepository.findByToken(params.guestToken);
    }

    return cart;
  }

  async getCart(params: { userId?: string; guestToken?: string; country?: string; region?: string; shippingMethodId?: string }) {
    let cart = await this.resolveCart({ userId: params.userId, guestToken: params.guestToken });

    // Guest cart + logged-in user => merge guest into user cart
    if (params.userId && params.guestToken) {
      const guestCart = await cartRepository.findByToken(params.guestToken);
      if (guestCart && guestCart.id !== cart!.id && guestCart.items.length > 0) {
        await cartRepository.mergeInto(cart!.id, guestCart.id);
        cart = await cartRepository.findByUserId(params.userId);
      }
    }

    if (!cart) {
      // Return an empty cart shape so the client always gets a valid payload
      return this.buildEmptyCart(params.userId ? { userId: params.userId } : { guestToken: params.guestToken });
    }

    // A cart left in a non-active state (e.g. CHECKED_OUT residue after a cancelled
    // payment, or a MERGED guest cart) must never be handed back to the client. Reset
    // it to ACTIVE (clearing any stale leftovers) so reads always yield a usable cart.
    if (cart.status !== CartStatus.ACTIVE) {
      cart = await cartRepository.reactivate(cart.id);
    }

    return this.composeCart(cart, { country: params.country, region: params.region, shippingMethodId: params.shippingMethodId });
  }

  async addItem(params: {
    userId?: string;
    guestToken?: string;
    input: AddToCartInput;
  }) {
    const { input } = params;
    let cart = await this.resolveCart({ userId: params.userId, guestToken: params.guestToken });

    if (!cart) {
      if (params.userId) {
        cart = await cartRepository.createForUser(params.userId);
      } else {
        const token = params.guestToken ?? `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        cart = await cartRepository.createGuest(token);
      }
    } else if (cart.status !== CartStatus.ACTIVE) {
      // A previous checkout left this cart inactive — start a fresh active cart.
      cart = await cartRepository.reactivate(cart.id);
    }

    // Validate variant + stock before adding
    const variant = await prisma.productVariant.findUnique({
      where: { id: input.variantId },
      include: { product: { select: { id: true, status: true, deletedAt: true } }, inventory: true },
    });

    if (!variant || !variant.isActive) {
      throw new NotFoundError("Variant not found");
    }
    if (variant.product.status !== "PUBLISHED" || variant.product.deletedAt) {
      throw new NotFoundError("Product is not available");
    }

    const available = (variant.inventory?.quantity ?? 0) - (variant.inventory?.reserved ?? 0);
    const existingItem = cart.items.find((i) => i.variantId === input.variantId);
    const requestedTotal = (existingItem?.quantity ?? 0) + input.quantity;

    if (available < requestedTotal && !variant.inventory?.allowBackorder) {
      throw new InsufficientStockError("Not enough stock available", {
        variantId: input.variantId,
        available,
        requested: input.quantity,
      });
    }

    await cartRepository.upsertItem({
      cartId: cart.id,
      variantId: input.variantId,
      productId: variant.product.id,
      quantity: input.quantity,
      price: toNumber(variant.price),
    });

    const updated = await cartRepository.findByToken(cart.token);
    return this.composeCart(updated!);
  }

  async updateItemQuantity(params: {
    userId?: string;
    guestToken?: string;
    itemId: string;
    input: UpdateCartItemInput;
  }) {
    const cart = await this.getOwnedCart(params.userId, params.guestToken);
    const item = cart.items.find((i) => i.id === params.itemId);
    if (!item) throw new NotFoundError("Cart item not found");

    const available = (item.variant.inventory?.quantity ?? 0) - (item.variant.inventory?.reserved ?? 0);
    if (params.input.quantity > available && !item.variant.inventory?.allowBackorder) {
      throw new InsufficientStockError("Not enough stock available", {
        variantId: item.variantId,
        available,
        requested: params.input.quantity,
      });
    }

    await cartRepository.setItemQuantity(cart.id, params.itemId, params.input.quantity);
    const updated = await cartRepository.findByToken(cart.token);
    return this.composeCart(updated!);
  }

  async removeItem(params: { userId?: string; guestToken?: string; itemId: string }) {
    const cart = await this.getOwnedCart(params.userId, params.guestToken);
    await cartRepository.removeItem(cart.id, params.itemId);
    const updated = await cartRepository.findByToken(cart.token);
    return this.composeCart(updated!);
  }

  async clear(params: { userId?: string; guestToken?: string }) {
    const cart = await this.getOwnedCart(params.userId, params.guestToken);
    await cartRepository.clear(cart.id);
    const updated = await cartRepository.findByToken(cart.token);
    return this.composeCart(updated!);
  }

  async applyCoupon(params: { userId?: string; guestToken?: string; input: ApplyCouponInput }) {
    const cart = await this.getOwnedCart(params.userId, params.guestToken);
    const subtotal = cart.items.reduce((acc, i) => acc + toNumber(i.price) * i.quantity, 0);
    const userId = params.userId;

    await couponService.validate(params.input.code, {
      subtotal,
      userId,
      itemCount: cart.items.length,
    });

    await cartRepository.saveCheckoutSnapshot(cart.id, { couponCode: params.input.code });
    const updated = await cartRepository.findByToken(cart.token);
    return this.composeCart(updated!);
  }

  async removeCoupon(params: { userId?: string; guestToken?: string }) {
    const cart = await this.getOwnedCart(params.userId, params.guestToken);
    await cartRepository.saveCheckoutSnapshot(cart.id, { couponCode: null });
    const updated = await cartRepository.findByToken(cart.token);
    return this.composeCart(updated!);
  }

  async setShipping(params: { userId?: string; guestToken?: string; input: CartShippingInput }) {
    const cart = await this.getOwnedCart(params.userId, params.guestToken);
    await cartRepository.saveCheckoutSnapshot(cart.id, {
      shippingCountry: params.input.country,
      shippingRegion: params.input.region ?? null,
      shippingMethodId: params.input.shippingMethodId ?? null,
    });
    const updated = await cartRepository.findByToken(cart.token);
    return this.composeCart(updated!, {
      country: params.input.country,
      region: params.input.region,
      shippingMethodId: params.input.shippingMethodId,
    });
  }

  async markCheckedOut(cart: CartWithItems) {
    await cartRepository.markCheckedOut(cart.id);
  }

  async countItems(params: { userId?: string; guestToken?: string }) {
    const cart = await this.resolveCart({ userId: params.userId, guestToken: params.guestToken });
    if (!cart) return 0;
    return cart.items.reduce((acc, i) => acc + i.quantity, 0);
  }

  // --- internals ------------------------------------------------------------

  private async getOwnedCart(userId?: string, guestToken?: string) {
    const cart = await this.resolveCart({ userId, guestToken });
    if (!cart) {
      throw new NotFoundError("Cart not found. Add an item first.");
    }
    return cart;
  }

  private buildEmptyCart(identity: { userId?: string; guestToken?: string }) {
    const currency = env.DEFAULT_CURRENCY;
    return {
      id: "",
      token: identity.guestToken ?? "no-cart",
      status: CartStatus.ACTIVE,
      currency,
      items: [] as CartItemDTO[],
      totals: {
        subtotal: 0,
        discountTotal: 0,
        shippingTotal: 0,
        taxTotal: 0,
        grandTotal: 0,
        currency,
        itemCount: 0,
        totalQuantity: 0,
      },
      coupon: null,
      shipping: null,
    } satisfies CartResponse;
  }

  private async composeCart(
    cart: CartWithItems,
    shippingOpts?: { country?: string; region?: string; shippingMethodId?: string },
  ): Promise<CartResponse> {
    const currency = cart.currency;
    const items: CartItemDTO[] = cart.items.map((item) => {
      const unitPrice = toNumber(item.price);
      const stock = (item.variant.inventory?.quantity ?? 0) - (item.variant.inventory?.reserved ?? 0);
      return {
        id: item.id,
        variantId: item.variantId,
        productId: item.variant.productId,
        productName: item.variant.product.name,
        slug: item.variant.product.slug,
        sku: item.variant.sku,
        color: item.variant.color,
        size: item.variant.size,
        imageUrl: item.variant.imageUrl ?? item.variant.product.images[0]?.url ?? null,
        unitPrice: unitPrice.toFixed(2),
        compareAtPrice: item.variant.compareAtPrice?.toString() ?? null,
        quantity: item.quantity,
        lineTotal: roundMoney(unitPrice * item.quantity).toFixed(2),
        inStock: stock > 0 || !!item.variant.inventory?.allowBackorder,
      };
    });

    const subtotal = roundMoney(items.reduce((acc, i) => acc + toNumber(i.lineTotal), 0));

    // Coupon
    let coupon: CartResponse["coupon"] = null;
    let discountTotal = 0;
    if (cart.couponCode) {
      const validation = await couponService.validateSilent(cart.couponCode, {
        subtotal,
        userId: cart.userId ?? undefined,
        itemCount: items.length,
      });
      if (validation.valid) {
        coupon = { code: cart.couponCode, type: validation.coupon!.type, discount: validation.discount };
        discountTotal = validation.discount;
      }
    }

    // Shipping estimate
    const country = shippingOpts?.country ?? cart.shippingCountry ?? env.DEFAULT_COUNTRY;
    const region = shippingOpts?.region ?? cart.shippingRegion ?? undefined;
    const totalWeightKg = cart.items.reduce(
      (acc, i) => acc + toNumber(i.variant.weightKg) * i.quantity,
      0,
    );
    const preferredMethodId = (shippingOpts?.shippingMethodId ?? cart.shippingMethodId ?? undefined) as string | undefined;
    const shipping = await this.estimateShipping(totalWeightKg, country, region, subtotal, preferredMethodId);

    // Tax (VAT-style single rate from settings; expandable to per-product/region rules)
    const taxRate = env.TAX_RATE_PERCENT / 100;
    const taxableBase = Math.max(0, subtotal - discountTotal);
    const taxTotal = roundMoney(taxableBase * taxRate);

    const grandTotal = roundMoney(taxableBase + shipping.estimate + taxTotal);

    return {
      id: cart.id,
      token: cart.token,
      status: cart.status,
      currency,
      items,
      totals: {
        subtotal,
        discountTotal,
        shippingTotal: shipping.estimate,
        taxTotal,
        grandTotal,
        currency,
        itemCount: items.length,
        totalQuantity: items.reduce((acc, i) => acc + i.quantity, 0),
      },
      coupon,
      shipping,
    };
  }

  private async estimateShipping(
    weightKg: number,
    country: string,
    region: string | undefined,
    subtotal: number,
    preferredMethodId?: string,
  ): Promise<NonNullable<CartResponse["shipping"]>> {
    const result = await shippingService.estimate({
      country,
      region,
      subtotal,
      weightKg,
      preferredMethodId,
    });

    return {
      methodId: result.selected?.id ?? null,
      methodName: result.selected?.name ?? null,
      estimate: result.selected ? toNumber(result.selected.rate) : result.cheapest ? toNumber(result.cheapest.rate) : 0,
      available: result.methods.map((m) => ({
        id: m.id,
        name: m.name,
        rate: toNumber(m.rate),
        estimatedDays:
          m.estimatedDaysMin && m.estimatedDaysMax ? `${m.estimatedDaysMin}-${m.estimatedDaysMax}` : "varies",
      })),
    };
  }
}

export const cartService = new CartService();
