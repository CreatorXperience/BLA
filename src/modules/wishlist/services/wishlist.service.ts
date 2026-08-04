import { prisma } from "@/database/prisma";
import { wishlistRepository } from "../repositories/wishlist.repository";
import { NotFoundError, ConflictError } from "@/shared/errors";
import { cartService } from "@/modules/cart/services/cart.service";
import { cacheDelPattern } from "@/database/redis";
import type { AddToWishlistInput, MoveToCartInput } from "../validators";

export class WishlistService {
  async list(userId: string) {
    const items = await wishlistRepository.list(userId);
    return items.map((item) => ({
      id: item.id,
      productId: item.product.id,
      createdAt: item.createdAt,
      product: {
        id: item.product.id,
        name: item.product.name,
        slug: item.product.slug,
        brand: item.product.brand,
        basePrice: item.product.basePrice.toString(),
        compareAtPrice: item.product.compareAtPrice?.toString() ?? null,
        currency: item.product.currency,
        rating: item.product.rating.toString(),
        reviewCount: item.product.reviewCount,
        status: item.product.status,
        images: item.product.images.map((img) => ({
          id: img.id,
          url: img.url,
          thumbUrl: img.thumbUrl,
          altText: img.altText,
          isThumbnail: img.isThumbnail,
          sortOrder: img.sortOrder,
        })),
        variants: item.product.variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          color: v.color,
          size: v.size,
          price: v.price.toString(),
          isActive: v.isActive,
          isDefault: v.isDefault,
          inventory: v.inventory
            ? {
                quantity: v.inventory.quantity,
                reserved: v.inventory.reserved,
                status: v.inventory.status,
              }
            : null,
        })),
      },
    }));
  }

  async add(userId: string, input: AddToWishlistInput) {
    const product = await prisma.product.findUnique({ where: { id: input.productId } });
    if (!product || product.deletedAt) throw new NotFoundError("Product not found");
    const item = await wishlistRepository.add(userId, input.productId);
    await cacheDelPattern(`cache:wishlist:${userId}`);
    return item;
  }

  async remove(userId: string, productId: string) {
    const result = await wishlistRepository.remove(userId, productId);
    if (result.count === 0) throw new NotFoundError("Item not in wishlist");
    await cacheDelPattern(`cache:wishlist:${userId}`);
    return { productId };
  }

  /** Move a wishlist item into the user's cart. */
  async moveToCart(userId: string, productId: string, input: MoveToCartInput, guestToken?: string) {
    const wishlisted = await wishlistRepository.isWishlisted(userId, productId);
    if (!wishlisted) throw new NotFoundError("Item not in wishlist");

    const cart = await cartService.addItem({
      userId,
      guestToken,
      input: { variantId: input.variantId, quantity: input.quantity },
    });
    await wishlistRepository.remove(userId, productId);
    await cacheDelPattern(`cache:wishlist:${userId}`);
    return cart;
  }
}

export const wishlistService = new WishlistService();
