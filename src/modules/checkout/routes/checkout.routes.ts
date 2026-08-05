import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { checkoutController } from "../controllers/checkout.controller";
import { optionalAuth, requireAuth } from "@/middleware/auth";
import { CreateOrderSchema } from "../validators/checkout.schema";

export function checkoutRoutes(): Hono {
  const router = new Hono();
  router.use(optionalAuth);

  // Checkout requires an account: anonymous users must sign in / create an account
  // (with their cart preserved) before they can preview or place an order.
  router.post("/preview", requireAuth, zValidator("json", CreateOrderSchema), checkoutController.preview);
  router.post("/shipping-options", checkoutController.shippingOptions);
  router.post("/place-order", requireAuth, zValidator("json", CreateOrderSchema), checkoutController.placeOrder);

  return router;
}
