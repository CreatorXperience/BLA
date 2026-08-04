import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { paymentController } from "../controllers/payment.controller";
import { requireAuth, requireRole } from "@/middleware/auth";
import { InitializePaymentSchema, RefundPaymentSchema, VerifyPaymentSchema } from "../validators/payment.schema";

export function paymentRoutes(): Hono {
  const router = new Hono();

  // Webhooks — NO auth middleware, signature checked inside service.
  router.post("/webhooks/paystack", paymentController.paystackWebhook);
  router.post("/webhooks/flutterwave", paymentController.flutterwaveWebhook);

  // Customer / checkout
  router.post("/initialize", zValidator("json", InitializePaymentSchema), paymentController.initialize);
  router.post("/verify", zValidator("json", VerifyPaymentSchema), paymentController.verify);
  router.get("/status/:reference", paymentController.status);

  // Admin CMS
  const admin = new Hono();
  admin.use(requireAuth, requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"));
  admin.get("/", paymentController.list);
  admin.get("/stats", paymentController.stats);
  admin.get("/orders/:orderId", paymentController.listForOrder);
  admin.post("/refund", requireRole("ADMIN", "SUPER_ADMIN"), zValidator("json", RefundPaymentSchema), paymentController.refund);

  router.route("/admin", admin);

  return router;
}
