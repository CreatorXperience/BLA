import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "@/middleware/auth";
import { userController } from "@/modules/users/controllers/users.controller";
import { orderController } from "@/modules/orders/controllers/order.controller";
import { wishlistController } from "@/modules/wishlist/controllers/wishlist.controller";
import { ChangePasswordSchema, CreateAddressSchema, UpdateProfileSchema } from "@/modules/users/dto/users.dto";
import { AddToWishlistSchema, MoveToCartSchema } from "@/modules/wishlist/validators";
import { UserOrderQuerySchema } from "@/modules/orders/validators";
import { IdParamSchema } from "@/shared/dto";

const ProductIdParamSchema = z.object({ productId: z.string().min(1) });

/**
 * Lightweight customer account area. No dashboard — only the account
 * operations needed to shop: profile, passwords, orders, addresses and
 * wishlist.
 */
export function meRoutes(): Hono {
  const router = new Hono();
  router.use(requireAuth);

  // Profile
  router.get("/profile", userController.getProfile);
  router.patch("/profile", zValidator("json", UpdateProfileSchema), userController.updateProfile);
  router.post("/change-password", zValidator("json", ChangePasswordSchema), userController.changePassword);

  // Saved addresses (used at checkout)
  router.get("/addresses", userController.listAddresses);
  router.post("/addresses", zValidator("json", CreateAddressSchema), userController.createAddress);
  router.patch("/addresses/:id", zValidator("param", IdParamSchema), zValidator("json", CreateAddressSchema), userController.updateAddress);
  router.delete("/addresses/:id", zValidator("param", IdParamSchema), userController.deleteAddress);

  // Order history & tracking
  router.get("/orders", zValidator("query", UserOrderQuerySchema), orderController.listMine);
  router.get("/orders/:id", zValidator("param", IdParamSchema), orderController.getMine);

  // Wishlist
  router.get("/wishlist", wishlistController.list);
  router.post("/wishlist", zValidator("json", AddToWishlistSchema), wishlistController.add);
  router.delete("/wishlist/:productId", zValidator("param", ProductIdParamSchema), wishlistController.remove);
  router.post("/wishlist/:productId/move-to-cart", zValidator("param", ProductIdParamSchema), zValidator("json", MoveToCartSchema), wishlistController.moveToCart);

  return router;
}
