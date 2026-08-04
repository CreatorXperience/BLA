import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { wishlistController } from "../controllers/wishlist.controller";
import { requireAuth } from "@/middleware/auth";
import { AddToWishlistSchema, MoveToCartSchema } from "../validators/wishlist.schema";

export function wishlistRoutes(): Hono {
  const router = new Hono();
  router.use(requireAuth);

  router.get("/", wishlistController.list);
  router.post("/", zValidator("json", AddToWishlistSchema), wishlistController.add);
  router.delete("/:productId", wishlistController.remove);
  router.post("/:productId/move-to-cart", zValidator("json", MoveToCartSchema), wishlistController.moveToCart);

  return router;
}
