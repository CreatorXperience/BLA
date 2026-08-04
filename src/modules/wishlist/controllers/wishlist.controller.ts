import type { Context } from "hono";
import { wishlistService } from "../services/wishlist.service";
import { success } from "@/shared/apiResponse";
import { getAuth } from "@/middleware/auth";
import { AuditAction } from "@prisma/client";
import { recordAudit } from "@/middleware/audit";
import type { AddToWishlistInput, MoveToCartInput } from "../validators";

export class WishlistController {
  list = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    return c.json(success(await wishlistService.list(user.id), "Wishlist"));
  };

  add = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const body = (await c.req.json()) as AddToWishlistInput;
    const item = await wishlistService.add(user.id, body);
    await recordAudit({ actorId: user.id, action: AuditAction.CREATE, entity: "WishlistItem", entityId: item.id, c });
    return c.json(success(item, "Added to wishlist"), 201);
  };

  remove = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const productId = c.req.param("productId") ?? "";
    const result = await wishlistService.remove(user.id, productId);
    return c.json(success(result, "Removed from wishlist"));
  };

  moveToCart = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const productId = c.req.param("productId") ?? "";
    const body = (await c.req.json()) as MoveToCartInput;
    const cart = await wishlistService.moveToCart(user.id, productId, body, c.req.header("x-cart-token"));
    return c.json(success(cart, "Moved to cart"));
  };
}

export const wishlistController = new WishlistController();
