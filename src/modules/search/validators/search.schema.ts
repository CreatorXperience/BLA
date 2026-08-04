import { z } from "zod";

export const SearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type SearchQueryInput = z.infer<typeof SearchQuerySchema>;

export const AutocompleteQuerySchema = z.object({
  q: z.string().trim().min(1).max(50),
  limit: z.coerce.number().int().min(1).max(10).default(8),
});

export type AutocompleteQueryInput = z.infer<typeof AutocompleteQuerySchema>;

export interface SearchResult {
  products: Array<{
    id: string;
    name: string;
    slug: string;
    brand: string | null;
    thumbnail: string | null;
    basePrice: string;
    compareAtPrice: string | null;
    currency: string;
    inStock: boolean;
  }>;
  categories: Array<{ id: string; name: string; slug: string }>;
  collections: Array<{ id: string; name: string; slug: string }>;
  total: number;
}

export interface AutocompleteResult {
  suggestions: Array<{ type: "product" | "category" | "collection" | "tag"; label: string; slug?: string; id?: string }>;
}
