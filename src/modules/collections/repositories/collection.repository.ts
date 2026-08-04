import { Prisma } from "@prisma/client";
import { prisma } from "@/database/prisma";
import type { CollectionQuery } from "../validators";

export class CollectionRepository {
  async findAll(query: Partial<CollectionQuery> = {}) {
    const where: Prisma.CollectionWhereInput = {
      ...(query.isActive === "true" ? { isActive: true } : {}),
      ...(query.isFeatured === "true" ? { isFeatured: true } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.collection.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        include: { _count: { select: { products: true } } },
        take: query.limit ?? 50,
      }),
      prisma.collection.count({ where }),
    ]);
    return { data, total };
  }

  findById(id: string) {
    return prisma.collection.findUnique({
      where: { id },
      include: { products: { include: { product: { include: { images: { orderBy: { sortOrder: "asc" } } } } }, orderBy: { sortOrder: "asc" } } },
    });
  }

  findBySlug(slug: string) {
    return prisma.collection.findUnique({
      where: { slug },
      include: {
        products: {
          include: { product: { include: { images: { orderBy: { sortOrder: "asc" } }, variants: { include: { inventory: true } } } } },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
  }

  create(data: Prisma.CollectionUncheckedCreateInput) {
    return prisma.collection.create({ data });
  }

  update(id: string, data: Prisma.CollectionUncheckedUpdateInput) {
    return prisma.collection.update({ where: { id }, data });
  }

  delete(id: string) {
    return prisma.collection.delete({ where: { id } });
  }

  async addProducts(collectionId: string, productIds: string[]) {
    await prisma.$transaction(
      productIds.map((productId, idx) =>
        prisma.collectionProduct.upsert({
          where: { collectionId_productId: { collectionId, productId } },
          update: { sortOrder: idx },
          create: { collectionId, productId, sortOrder: idx },
        }),
      ),
    );
  }

  async removeProduct(collectionId: string, productId: string) {
    return prisma.collectionProduct.deleteMany({
      where: { collectionId, productId },
    });
  }
}

export const collectionRepository = new CollectionRepository();
