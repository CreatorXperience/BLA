import { Prisma } from "@prisma/client";
import { prisma } from "@/database/prisma";

export class WishlistRepository {
  list(userId: string) {
    return prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        product: {
          include: {
            images: { orderBy: { sortOrder: "asc" } },
            variants: { include: { inventory: true } },
          },
        },
      },
    });
  }

  add(userId: string, productId: string) {
    return prisma.wishlistItem.upsert({
      where: { userId_productId: { userId, productId } },
      update: {},
      create: { userId, productId },
    });
  }

  remove(userId: string, productId: string) {
    return prisma.wishlistItem.deleteMany({ where: { userId, productId } });
  }

  async isWishlisted(userId: string, productId: string): Promise<boolean> {
    const item = await prisma.wishlistItem.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    return !!item;
  }
}

export const wishlistRepository = new WishlistRepository();
