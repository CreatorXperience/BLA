import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { checkoutController } from "../controllers/checkout.controller";
import { optionalAuth } from "@/middleware/auth";
import { CreateOrderSchema } from "../validators/checkout.schema";

export function checkoutRoutes(): Hono {
  const router = new Hono();
  router.use(optionalAuth);

  router.post("/preview", zValidator("json", CreateOrderSchema), checkoutController.preview);
  router.post("/shipping-options", checkoutController.shippingOptions);
  router.post("/place-order", zValidator("json", CreateOrderSchema), checkoutController.placeOrder);

  return router;
}
