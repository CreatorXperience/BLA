import { ConflictError, NotFoundError } from "@/shared/errors";
import { cacheDelPattern } from "@/database/redis";
import { generateUniqueSlug } from "@/utils/id";
import { categoryRepository } from "../repositories/category.repository";
import type { CategoryQuery, CreateCategoryInput, UpdateCategoryInput } from "../validators";
import type { CategoryTreeNode } from "../types";

export class CategoryService {
  async list(query: CategoryQuery) {
    const categories = await categoryRepository.findAll(query);
    if (query.includeChildren === "false" || query.includeChildren === undefined) {
      return categories.map((c) => this.mapWithCount(c));
    }
    return this.buildTree(categories);
  }

  async get(id: string) {
    const category = await categoryRepository.findById(id);
    if (!category) throw new NotFoundError("Category not found");
    const count = await categoryRepository.countDirectChildren(id);
    return { ...category, productCount: count };
  }

  async getBySlug(slug: string) {
    const category = await categoryRepository.findBySlug(slug);
    if (!category) throw new NotFoundError("Category not found");
    return category;
  }

  async create(input: CreateCategoryInput) {
    const slug = input.slug ?? generateUniqueSlug(input.name);
    if (await categoryRepository.findBySlug(slug)) {
      throw new ConflictError("A category with this slug already exists");
    }
    if (input.parentId) {
      const parent = await categoryRepository.findById(input.parentId);
      if (!parent) throw new NotFoundError("Parent category not found");
    }
    const category = await categoryRepository.create({
      name: input.name,
      slug,
      parentId: input.parentId ?? null,
      description: input.description,
      imageUrl: input.imageUrl,
      bannerUrl: input.bannerUrl,
      iconUrl: input.iconUrl,
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      isFeatured: input.isFeatured,
    });
    await this.evict();
    return category;
  }

  async update(id: string, input: UpdateCategoryInput) {
    const existing = await categoryRepository.findById(id);
    if (!existing) throw new NotFoundError("Category not found");

    if (input.slug && input.slug !== existing.slug) {
      const dup = await categoryRepository.findBySlug(input.slug);
      if (dup) throw new ConflictError("A category with this slug already exists");
    }
    if (input.parentId === id) {
      throw new ConflictError("A category cannot be its own parent");
    }

    const category = await categoryRepository.update(id, {
      name: input.name,
      slug: input.slug,
      parentId: input.parentId !== undefined ? (input.parentId ?? null) : undefined,
      description: input.description,
      imageUrl: input.imageUrl,
      bannerUrl: input.bannerUrl,
      iconUrl: input.iconUrl,
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      isFeatured: input.isFeatured,
    });
    await this.evict();
    return category;
  }

  async remove(id: string) {
    const existing = await categoryRepository.findById(id);
    if (!existing) throw new NotFoundError("Category not found");
    const children = await categoryRepository.countDirectChildren(id);
    if (children > 0) {
      throw new ConflictError("Cannot delete a category that has child categories");
    }
    await categoryRepository.delete(id);
    await this.evict();
    return { id };
  }

  private mapWithCount(c: { id: string; name: string; slug: string; description: string | null; imageUrl: string | null; sortOrder: number; isActive: boolean; isFeatured: boolean; parentId: string | null; _count: { products: number } }) {
    const { _count, ...rest } = c;
    return { ...rest, productCount: _count.products };
  }

  private buildTree(
    rows: Array<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      imageUrl: string | null;
      sortOrder: number;
      isActive: boolean;
      isFeatured: boolean;
      parentId: string | null;
      _count: { products: number };
    }>,
  ): CategoryTreeNode[] {
    const nodes = new Map<string, CategoryTreeNode>();
    for (const row of rows) {
      nodes.set(row.id, {
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        imageUrl: row.imageUrl,
        sortOrder: row.sortOrder,
        isActive: row.isActive,
        isFeatured: row.isFeatured,
        parentId: row.parentId,
        productCount: row._count.products,
        children: [],
      });
    }
    const roots: CategoryTreeNode[] = [];
    for (const node of nodes.values()) {
      if (node.parentId && nodes.has(node.parentId)) {
        nodes.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  private evict() {
    return cacheDelPattern("cache:category*");
  }
}

export const categoryService = new CategoryService();
