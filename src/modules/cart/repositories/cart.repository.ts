import { CartStatus, Prisma } from "@prisma/client";
import { prisma } from "@/database/prisma";

const cartInclude = {
  items: {
    include: {
      variant: {
        include: {
          product: { include: { images: { orderBy: { sortOrder: "asc" as const }, take: 1 } } },
          inventory: true,
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

export class CartRepository {
  findByToken(token: string) {
    return prisma.cart.findUnique({
      where: { token },
      include: cartInclude,
    });
  }

  findByUserId(userId: string) {
    return prisma.cart.findUnique({
      where: { userId },
      include: cartInclude,
    });
  }

  createGuest(token: string) {
    return prisma.cart.create({
      data: { token, status: CartStatus.ACTIVE },
      include: cartInclude,
    });
  }

  async createForUser(userId: string) {
    const token = `user-${userId}-${Date.now().toString(36)}`;
    return prisma.cart.create({
      data: { userId, token, status: CartStatus.ACTIVE },
      include: cartInclude,
    });
  }

  async attachUser(cartId: string, userId: string) {
    await prisma.cart.update({ where: { id: cartId }, data: { userId, guestId: null } });
  }

  async upsertItem(params: { cartId: string; variantId: string; productId: string; quantity: number; price: number }) {
    return prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: params.cartId, variantId: params.variantId } },
      update: { quantity: { increment: params.quantity }, price: params.price },
      create: {
        cartId: params.cartId,
        variantId: params.variantId,
        productId: params.productId,
        quantity: params.quantity,
        price: params.price,
      },
    });
  }

  async setItemQuantity(cartId: string, itemId: string, quantity: number) {
    return prisma.cartItem.updateMany({ where: { id: itemId, cartId }, data: { quantity } });
  }

  async removeItem(cartId: string, itemId: string) {
    return prisma.cartItem.deleteMany({ where: { id: itemId, cartId } });
  }

  async clear(cartId: string) {
    return prisma.cartItem.deleteMany({ where: { cartId } });
  }

  async mergeInto(targetCartId: string, sourceCartId: string) {
    const sourceItems = await prisma.cartItem.findMany({ where: { cartId: sourceCartId } });
    for (const item of sourceItems) {
      await prisma.cartItem.upsert({
        where: { cartId_variantId: { cartId: targetCartId, variantId: item.variantId } },
        update: { quantity: { increment: item.quantity }, price: item.price },
        create: {
          cartId: targetCartId,
          variantId: item.variantId,
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
        },
      });
    }
    await prisma.cart.update({
      where: { id: sourceCartId },
      data: { status: CartStatus.MERGED },
    });
  }

  async markCheckedOut(cartId: string) {
    return prisma.cart.update({ where: { id: cartId }, data: { status: CartStatus.CHECKED_OUT } });
  }

  /** Reuse the user's single cart row after a checkout: reset to active, clear items. */
  async reactivate(cartId: string) {
    await prisma.cartItem.deleteMany({ where: { cartId } });
    return prisma.cart.update({
      where: { id: cartId },
      data: { status: CartStatus.ACTIVE, couponCode: null, shippingCountry: null, shippingRegion: null, shippingMethodId: null },
      include: cartInclude,
    });
  }

  /** Persist checkout-time data on the cart (coupon code, shipping details). */
  async saveCheckoutSnapshot(cartId: string, data: Prisma.CartUpdateInput) {
    return prisma.cart.update({ where: { id: cartId }, data });
  }
}

export const cartRepository = new CartRepository();
