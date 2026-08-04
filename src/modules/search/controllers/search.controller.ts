import type { Context } from "hono";
import { searchService } from "../services/search.service";
import { success } from "@/shared/apiResponse";
import { getAuthUser } from "@/middleware/auth";
import type { AutocompleteQueryInput, SearchQueryInput } from "../validators";

export class SearchController {
  search = async (c: Context): Promise<Response> => {
    const q = c.req.query("q") ?? "";
    const limit = Number(c.req.query("limit") ?? 20);
    const user = getAuthUser(c);
    const result = await searchService.search(
      { q, limit } as SearchQueryInput,
      {
        userId: user?.id,
        ipAddress: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
      },
    );
    return c.json(success(result, "Search results"));
  };

  autocomplete = async (c: Context): Promise<Response> => {
    const q = c.req.query("q") ?? "";
    const limit = Number(c.req.query("limit") ?? 8);
    const result = await searchService.autocomplete({ q, limit } as AutocompleteQueryInput);
    return c.json(success(result, "Suggestions"));
  };

  trending = async (c: Context): Promise<Response> => {
    const limit = Number(c.req.query("limit") ?? 10);
    return c.json(success(await searchService.trending(limit), "Trending searches"));
  };

  recent = async (c: Context): Promise<Response> => {
    const user = getAuthUser(c);
    if (!user) return c.json(success([], "Recent searches"));
    return c.json(success(await searchService.recent(user.id), "Recent searches"));
  };

  clearRecent = async (c: Context): Promise<Response> => {
    const user = getAuthUser(c);
    if (user) await searchService.clearRecent(user.id);
    return c.json(success(null, "Recent searches cleared"));
  };
}

export const searchController = new SearchController();
