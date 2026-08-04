import { Prisma } from "@prisma/client";
import { prisma } from "@/database/prisma";
import type { CategoryQuery } from "../validators";

export class CategoryRepository {
  async findAll(query: CategoryQuery = {}) {
    const where: Prisma.CategoryWhereInput = {
      ...(query.parentId !== undefined
        ? query.parentId === "null"
          ? { parentId: null }
          : { parentId: query.parentId }
        : {}),
      ...(query.isActive === "true" ? { isActive: true } : {}),
      ...(query.isActive === "false" ? { isActive: false } : {}),
      ...(query.isFeatured === "true" ? { isFeatured: true } : {}),
    };
    const categories = await prisma.category.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { products: true } } },
    });
    return categories;
  }

  findById(id: string) {
    return prisma.category.findUnique({ where: { id } });
  }

  findBySlug(slug: string) {
    return prisma.category.findUnique({ where: { slug } });
  }

  create(data: Prisma.CategoryUncheckedCreateInput) {
    return prisma.category.create({ data });
  }

  update(id: string, data: Prisma.CategoryUncheckedUpdateInput) {
    return prisma.category.update({ where: { id }, data });
  }

  delete(id: string) {
    return prisma.category.delete({ where: { id } });
  }

  async countDirectChildren(parentId: string): Promise<number> {
    return prisma.category.count({ where: { parentId } });
  }
}

export const categoryRepository = new CategoryRepository();
