import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { cartController } from "../controllers/cart.controller";
import { AddToCartSchema, ApplyCouponSchema, CartShippingSchema, UpdateCartItemSchema } from "../dto/cart.dto";
import { optionalAuth } from "@/middleware/auth";

export function cartRoutes(): Hono {
  const router = new Hono();
  router.use(optionalAuth);

  router.get("/", cartController.get);
  router.post("/items", zValidator("json", AddToCartSchema), cartController.addItem);
  router.patch("/items/:itemId", zValidator("json", UpdateCartItemSchema), cartController.updateItem);
  router.delete("/items/:itemId", cartController.removeItem);
  router.delete("/", cartController.clear);
  router.post("/coupon", zValidator("json", ApplyCouponSchema), cartController.applyCoupon);
  router.delete("/coupon", cartController.removeCoupon);
  router.post("/shipping", zValidator("json", CartShippingSchema), cartController.setShipping);
  router.get("/count", cartController.count);

  return router;
}
