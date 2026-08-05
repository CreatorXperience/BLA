import { OrderStatus, AddressType } from "@prisma/client";
import { prisma } from "@/database/prisma";
import { cartService } from "@/modules/cart/services/cart.service";
import { cartRepository } from "@/modules/cart/repositories/cart.repository";
import { couponService } from "@/modules/coupons/services/coupon.service";
import { shippingService } from "@/modules/shipping/services/shipping.service";
import { orderRepository } from "@/modules/orders/repositories/order.repository";
import { inventoryService } from "@/modules/inventory/services/inventory.service";
import { paymentService } from "@/modules/payments/services/payment.service";
import { NotFoundError, ValidationError, InsufficientStockError, CouponError } from "@/shared/errors";
import { roundMoney, toNumber } from "@/utils/money";
import { env } from "@/config";
import { logger } from "@/shared/logger";
import { analyticsSyncQueue, safeAdd } from "@/queues";
import type { CheckoutAddressInput, CheckoutSummary, CreateOrderInput } from "../validators";

interface Identity {
  userId?: string;
  guestToken?: string;
  ip?: string;
  userAgent?: string;
}

interface CartLike {
  id: string;
  token: string;
  userId: string | null;
  currency: string;
  couponCode: string | null;
  shippingCountry: string | null;
  shippingRegion: string | null;
  shippingMethodId: string | null;
  items: Array<{
    id: string;
    variantId: string;
    productId: string;
    quantity: number;
    variant: {
      sku: string;
      color: string | null;
      size: string | null;
      price: number | string;
      weightKg: number | string;
      imageUrl: string | null;
      product: {
        id: string;
        name: string;
        slug: string;
        status: string;
        deletedAt: Date | null;
        images: Array<{ url: string }>;
      };
      inventory: { quantity: number; reserved: number; allowBackorder: boolean; lowStockThreshold: number } | null;
    };
  }>;
}

export class CheckoutService {
  /** Build a full order summary. Every value is recomputed server-side. */
  async preview(input: CreateOrderInput, identity: Identity): Promise<CheckoutSummary> {
    const cart = await this.loadCart(identity);
    if (cart.items.length === 0) throw new ValidationError("Your cart is empty");

    const totals = await this.computeTotals(cart, input);
    return this.summary(cart, totals);
  }

  /**
   * Place the order. All validation happens here — the preview is advisory only.
   * Returns the order and a ready-to-use payment intent.
   */
  async placeOrder(input: CreateOrderInput, identity: Identity) {
    const cart = await this.loadCart(identity);
    if (cart.items.length === 0) throw new ValidationError("Your cart is empty");

    // 1. Re-validate stock
    for (const item of cart.items) {
      if (item.variant.product.status !== "PUBLISHED" || item.variant.product.deletedAt) {
        throw new ValidationError(`"${item.variant.product.name}" is no longer available`);
      }
      const available = (item.variant.inventory?.quantity ?? 0) - (item.variant.inventory?.reserved ?? 0);
      if (available < item.quantity && !item.variant.inventory?.allowBackorder) {
        throw new InsufficientStockError(`Insufficient stock for ${item.variant.product.name}`, {
          variantId: item.variantId,
          available,
          requested: item.quantity,
        });
      }
    }

    // 2. Totals (coupon + shipping + tax)
    const totals = await this.computeTotals(cart, input);

    // 3. Addresses
    const shippingAddress = await this.resolveAddress(input.shippingAddress, identity, "shipping");
    const billingAddress =
      input.billingSameAsShipping || !input.billingAddress
        ? shippingAddress
        : await this.resolveAddress(input.billingAddress, identity, "billing");

    const currency = cart.currency || env.DEFAULT_CURRENCY;
    const coupon = input.couponCode
      ? { id: totals.coupon?.id, code: input.couponCode, discount: totals.coupon?.discount ?? 0 }
      : null;

    // 4. Create order + deduct stock atomically
    const created = await prisma.$transaction(
      async (tx) => {
      const order = await orderRepository.create(
        {
          userId: identity.userId,
          email: input.email,
          status: OrderStatus.PENDING,
          currency,
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          shippingTotal: totals.shippingTotal,
          taxTotal: totals.taxTotal,
          grandTotal: totals.grandTotal,
          shippingAddressId: shippingAddress.id ?? undefined,
          billingAddressId: billingAddress.id ?? undefined,
          shippingAddressSnapshot: shippingAddress.snapshot,
          billingAddressSnapshot: billingAddress.snapshot,
          couponId: coupon?.id,
          couponCode: coupon?.code,
          couponDiscount: coupon?.discount,
          shippingMethodId: input.shippingMethodId,
          customerNote: input.customerNote,
          ipAddress: identity.ip,
          userAgent: identity.userAgent,
          isGuest: !identity.userId,
        },
        tx,
      );

      const items = cart.items.map((item) => {
        const unitPrice = toNumber(item.variant.price);
        return {
          productId: item.productId,
          variantId: item.variantId,
          productName: item.variant.product.name,
          variantLabel: [item.variant.color, item.variant.size].filter(Boolean).join(" / "),
          sku: item.variant.sku,
          imageUrl: item.variant.imageUrl ?? item.variant.product.images[0]?.url ?? undefined,
          unitPrice,
          quantity: item.quantity,
          totalPrice: roundMoney(unitPrice * item.quantity),
          color: item.variant.color ?? undefined,
          size: item.variant.size ?? undefined,
        };
      });
      await orderRepository.addItems(order.id, items, tx);
      await orderRepository.addTimeline(
        { orderId: order.id, eventType: "STATUS_CHANGE", toStatus: OrderStatus.PENDING, description: "Order placed" },
        tx,
      );
      await inventoryService.deductForOrderTx(
        tx as never,
        cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      );

      return order;
      },
      { timeout: 15000 },
    );

    // 5. Record coupon redemption
    if (coupon?.id && coupon.discount > 0) {
      await couponService.recordRedemption?.({
        couponId: coupon.id,
        orderId: created.id,
        userId: identity.userId,
        discountApplied: coupon.discount,
      });
    }

    // 6. Mark cart checked out
    await cartService.markCheckedOut(cart as never);

    // 7. Fire-and-forget analytics + notification
    await safeAdd(analyticsSyncQueue, "sync", {
      event: "PURCHASE",
      payload: { orderId: created.id, userId: identity.userId, value: totals.grandTotal, currency },
    });

    // 8. Payment intent (best-effort: order is still placed if the provider is down)
    let payment = null;
    try {
      payment = await paymentService.initializeForOrder(
        {
          orderId: created.id,
          provider: input.payment.provider,
          method: input.payment.method,
          callbackUrl: input.payment.callbackUrl,
        },
        { ip: identity.ip },
      );
    } catch (error) {
      logger.warn({ error, orderId: created.id }, "payment initialization failed; order placed without payment link");
    }

    return {
      order: {
        id: created.id,
        orderNumber: created.orderNumber,
        status: created.status,
        grandTotal: created.grandTotal.toString(),
        currency,
      },
      payment,
      summary: totals,
    };
  }

  // --- internals ------------------------------------------------------------

  private async loadCart(identity: Identity): Promise<CartLike> {
    const cart = await cartService.getCart({
      userId: identity.userId,
      guestToken: identity.guestToken,
      country: undefined,
    });
    if (!cart || cart.items.length === 0) throw new ValidationError("Your cart is empty");

    const raw = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } } },
                inventory: true,
              },
            },
          },
        },
      },
    });
    if (!raw || raw.status !== "ACTIVE") {
      // Recover a cart that landed in a non-active state (CHECKED_OUT residue, a
      // concurrently-checked-out cart, or a stale MERGED guest cart) instead of
      // failing checkout. reactivate clears any leftover items and resets to ACTIVE.
      if (!raw) throw new ValidationError("Your cart is empty");
      await cartRepository.reactivate(raw.id);
      return (await prisma.cart.findUnique({
        where: { id: raw.id },
        include: {
          items: {
            include: {
              variant: {
                include: {
                  product: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } } },
                  inventory: true,
                },
              },
            },
          },
        },
      })) as unknown as CartLike;
    }

    return raw as unknown as CartLike;
  }

  private async computeTotals(cart: CartLike, input: CreateOrderInput) {
    const currency = cart.currency || env.DEFAULT_CURRENCY;
    const subtotal = roundMoney(
      cart.items.reduce((acc, i) => acc + toNumber(i.variant.price) * i.quantity, 0),
    );

    // Coupon
    let coupon: { id: string; discount: number; code: string; type: string } | null = null;
    let discountTotal = 0;
    if (input.couponCode) {
      const result = await couponService.validate(input.couponCode, {
        subtotal,
        userId: cart.userId ?? undefined,
        itemCount: cart.items.length,
        productIds: cart.items.map((i) => i.productId),
        email: input.email,
      });
      if (result.valid && result.coupon) {
        coupon = { id: result.coupon.id, discount: result.discount, code: result.coupon.code, type: result.coupon.type };
        discountTotal = result.discount;
      }
    }

    // Shipping
    const country = cart.shippingCountry ?? input.shippingAddress.country ?? env.DEFAULT_COUNTRY;
    const region = cart.shippingRegion ?? input.shippingAddress.state;
    const weightKg = cart.items.reduce((acc, i) => acc + toNumber(i.variant.weightKg) * i.quantity, 0);
    const shippingEstimate = await shippingService.estimate({
      country,
      region,
      subtotal,
      weightKg,
      preferredMethodId: input.shippingMethodId,
    });

    if (!shippingEstimate.selected) {
      throw new ValidationError("Shipping is not available for the selected destination");
    }

    // Free shipping coupon overrides shipping charge
    let shippingTotal = toNumber(shippingEstimate.selected.rate);
    if (coupon?.type === "FREE_SHIPPING") {
      shippingTotal = 0;
      discountTotal = 0;
    }

    // Tax
    const taxRate = env.TAX_RATE_PERCENT / 100;
    const taxableBase = Math.max(0, subtotal - discountTotal);
    const taxTotal = roundMoney(taxableBase * taxRate);

    const grandTotal = roundMoney(subtotal - discountTotal + shippingTotal + taxTotal);

    return {
      subtotal,
      discountTotal,
      shippingTotal,
      taxTotal,
      grandTotal,
      currency,
      coupon,
      shipping: {
        methodId: shippingEstimate.selected.id,
        methodName: shippingEstimate.selected.name,
        estimatedDays:
          shippingEstimate.selected.estimatedDaysMin && shippingEstimate.selected.estimatedDaysMax
            ? `${shippingEstimate.selected.estimatedDaysMin}-${shippingEstimate.selected.estimatedDaysMax}`
            : "varies",
      },
    };
  }

  private async resolveAddress(
    input: CheckoutAddressInput,
    identity: Identity,
    type: "shipping" | "billing",
  ): Promise<{ id: string | null; snapshot: Record<string, string> }> {
    const snapshot: Record<string, string> = {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? "",
      line1: input.line1,
      line2: input.line2 ?? "",
      city: input.city,
      state: input.state,
      postalCode: input.postalCode ?? "",
      country: input.country,
      type,
    };

    if (!identity.userId) {
      return { id: null, snapshot };
    }

    // Reuse a saved address when the client selected one
    if (input.addressId) {
      const saved = await prisma.address.findFirst({ where: { id: input.addressId, userId: identity.userId } });
      if (saved) {
        return {
          id: saved.id,
          snapshot: {
            firstName: saved.firstName,
            lastName: saved.lastName,
            phone: saved.phone ?? "",
            line1: saved.line1,
            line2: saved.line2 ?? "",
            city: saved.city,
            state: saved.state,
            postalCode: saved.postalCode ?? "",
            country: saved.country,
            type,
          },
        };
      }
    }

    // Otherwise reuse an identical saved address, or save this one to the address book
    const match = await prisma.address.findFirst({
      where: {
        userId: identity.userId,
        line1: input.line1,
        city: input.city,
        state: input.state,
        country: input.country,
        lastName: input.lastName,
      },
    });
    if (match) {
      return {
        id: match.id,
        snapshot: {
          firstName: match.firstName,
          lastName: match.lastName,
          phone: match.phone ?? "",
          line1: match.line1,
          line2: match.line2 ?? "",
          city: match.city,
          state: match.state,
          postalCode: match.postalCode ?? "",
          country: match.country,
          type,
        },
      };
    }

    const addressCount = await prisma.address.count({ where: { userId: identity.userId } });
    const created = await prisma.address.create({
      data: {
        userId: identity.userId,
        type: type === "shipping" ? AddressType.SHIPPING : AddressType.BILLING,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone ?? null,
        line1: input.line1,
        line2: input.line2 ?? null,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode ?? null,
        country: input.country,
        isDefault: addressCount === 0,
      },
    });

    return { id: created.id, snapshot };
  }

  private summary(
    cart: CartLike,
    totals: Awaited<ReturnType<CheckoutService["computeTotals"]>>,
  ): CheckoutSummary {
    return {
      items: cart.items.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        name: i.variant.product.name,
        sku: i.variant.sku,
        color: i.variant.color,
        size: i.variant.size,
        imageUrl: i.variant.imageUrl ?? i.variant.product.images[0]?.url ?? null,
        quantity: i.quantity,
        unitPrice: toNumber(i.variant.price),
        lineTotal: roundMoney(toNumber(i.variant.price) * i.quantity),
      })),
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      shippingTotal: totals.shippingTotal,
      taxTotal: totals.taxTotal,
      grandTotal: totals.grandTotal,
      currency: totals.currency,
      itemCount: cart.items.reduce((acc, i) => acc + i.quantity, 0),
      coupon: totals.coupon ? { code: totals.coupon.code, discount: totals.coupon.discount } : null,
      shipping: totals.shipping,
    };
  }
}

export const checkoutService = new CheckoutService();
