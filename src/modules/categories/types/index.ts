export type { CreateCategoryInput, UpdateCategoryInput, CategoryQuery } from "../validators/category.schema";

export interface CategoryTreeNode {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  isFeatured: boolean;
  parentId: string | null;
  productCount: number;
  children: CategoryTreeNode[];
}
