import { ConflictError, NotFoundError } from "@/shared/errors";
import { cacheDelPattern } from "@/database/redis";
import { generateUniqueSlug } from "@/utils/id";
import { collectionRepository } from "../repositories/collection.repository";
import type { AddProductsInput, CollectionQuery, CreateCollectionInput, UpdateCollectionInput } from "../validators";

export class CollectionService {
  async list(query: CollectionQuery) {
    return collectionRepository.findAll(query);
  }

  async get(id: string) {
    const collection = await collectionRepository.findById(id);
    if (!collection) throw new NotFoundError("Collection not found");
    return collection;
  }

  async getBySlug(slug: string) {
    const collection = await collectionRepository.findBySlug(slug);
    if (!collection) throw new NotFoundError("Collection not found");
    return collection;
  }

  async create(input: CreateCollectionInput) {
    const slug = input.slug ?? generateUniqueSlug(input.name);
    if (await collectionRepository.findBySlug(slug)) {
      throw new ConflictError("A collection with this slug already exists");
    }
    const collection = await collectionRepository.create({
      name: input.name,
      slug,
      description: input.description,
      bannerUrl: input.bannerUrl,
      categoryId: input.categoryId ?? null,
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      isFeatured: input.isFeatured,
      badge: input.badge,
      publishAt: input.publishAt ? new Date(input.publishAt) : null,
      unpublishAt: input.unpublishAt ? new Date(input.unpublishAt) : null,
      products: input.productIds?.length
        ? { create: input.productIds.map((productId, idx) => ({ productId, sortOrder: idx })) }
        : undefined,
    });
    await this.evict();
    return this.get(collection.id);
  }

  async update(id: string, input: UpdateCollectionInput) {
    const existing = await collectionRepository.findById(id);
    if (!existing) throw new NotFoundError("Collection not found");
    if (input.slug && input.slug !== existing.slug) {
      const dup = await collectionRepository.findBySlug(input.slug);
      if (dup) throw new ConflictError("A collection with this slug already exists");
    }

    await collectionRepository.update(id, {
      name: input.name,
      slug: input.slug,
      description: input.description,
      bannerUrl: input.bannerUrl,
      categoryId: input.categoryId !== undefined ? (input.categoryId ?? null) : undefined,
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      isFeatured: input.isFeatured,
      badge: input.badge,
      publishAt: input.publishAt ? new Date(input.publishAt) : undefined,
      unpublishAt: input.unpublishAt ? new Date(input.unpublishAt) : undefined,
    });

    if (input.productIds !== undefined) {
      await collectionRepository.addProducts(id, input.productIds);
    }

    await this.evict();
    return this.get(id);
  }

  async addProducts(id: string, input: AddProductsInput) {
    const existing = await collectionRepository.findById(id);
    if (!existing) throw new NotFoundError("Collection not found");
    await collectionRepository.addProducts(id, input.productIds);
    await this.evict();
    return this.get(id);
  }

  async removeProduct(id: string, productId: string) {
    const existing = await collectionRepository.findById(id);
    if (!existing) throw new NotFoundError("Collection not found");
    await collectionRepository.removeProduct(id, productId);
    await this.evict();
    return { id, productId };
  }

  async remove(id: string) {
    const existing = await collectionRepository.findById(id);
    if (!existing) throw new NotFoundError("Collection not found");
    await collectionRepository.delete(id);
    await this.evict();
    return { id };
  }

  private evict() {
    return cacheDelPattern("cache:collection*");
  }
}

export const collectionService = new CollectionService();
