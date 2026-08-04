import { Hono } from "hono";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { env } from "@/config";
import { requestLogger } from "@/middleware/requestLogger";
import { errorHandler } from "@/middleware/errorHandler";
import { secureHeaders } from "@/middleware/security";

import { authRoutes } from "@/modules/auth/routes/auth.routes";
import { adminRoutes } from "@/modules/users/routes/admin.routes";
import { meRoutes } from "@/modules/me/routes/me.routes";
import { productRoutes } from "@/modules/products/routes/product.routes";
import { categoryRoutes } from "@/modules/categories/routes/category.routes";
import { collectionRoutes } from "@/modules/collections/routes/collection.routes";
import { inventoryRoutes } from "@/modules/inventory/routes/inventory.routes";
import { cartRoutes } from "@/modules/cart/routes/cart.routes";
import { couponRoutes } from "@/modules/coupons/routes/coupon.routes";
import { shippingRoutes } from "@/modules/shipping/routes/shipping.routes";
import { orderRoutes } from "@/modules/orders/routes/order.routes";
import { paymentRoutes } from "@/modules/payments/routes/payment.routes";
import { checkoutRoutes } from "@/modules/checkout/routes/checkout.routes";
import { reviewRoutes } from "@/modules/reviews/routes/review.routes";
import { mediaRoutes } from "@/modules/media/routes/media.routes";
import { searchRoutes } from "@/modules/search/routes/search.routes";
import { analyticsRoutes } from "@/modules/analytics/routes/analytics.routes";
import { dashboardRoutes } from "@/modules/dashboard/routes/dashboard.routes";
import { cmsRoutes } from "@/modules/cms/routes/cms.routes";
import { notificationRoutes } from "@/modules/notifications/routes/notification.routes";

import { swaggerUI } from "@hono/swagger-ui";

/**
 * Assemble the Hono application. All feature routes mount under the
 * configured API prefix with a consistent error/logging/security stack.
 */
export function buildApp(): Hono {
  const app = new Hono();

  app.use(requestId());
  app.use(secureHeaders);
  app.use(requestLogger);
  app.use(logger());

  app.onError(errorHandler);

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      name: env.APP_NAME,
      version: "1.0.0",
      time: new Date().toISOString(),
    }),
  );

  const api = new Hono();
  api.route("/auth", authRoutes());
  api.route("/me", meRoutes());
  api.route("/admin", adminRoutes());
  api.route("/products", productRoutes());
  api.route("/categories", categoryRoutes());
  api.route("/collections", collectionRoutes());
  api.route("/inventory", inventoryRoutes());
  api.route("/cart", cartRoutes());
  api.route("/coupons", couponRoutes());
  api.route("/shipping", shippingRoutes());
  api.route("/orders", orderRoutes());
  api.route("/payments", paymentRoutes());
  api.route("/checkout", checkoutRoutes());
  api.route("/reviews", reviewRoutes());
  api.route("/media", mediaRoutes());
  api.route("/search", searchRoutes());
  api.route("/analytics", analyticsRoutes());
  api.route("/dashboard", dashboardRoutes());
  api.route("/cms", cmsRoutes());
  api.route("/notifications", notificationRoutes());

  app.route(env.API_PREFIX, api);

  // Swagger UI (docs generated from src/swagger/registry.ts).
  app.get("/docs", swaggerUI({ url: "/api/v1/openapi.json" }));
  app.get("/api/v1/openapi.json", async (c) => {
    const { OpenApiGeneratorV3 } = await import("@asteasolutions/zod-to-openapi");
    const { registry } = await import("@/swagger/registry");
    const generator = new OpenApiGeneratorV3(registry.definitions);
    return c.json(
      generator.generateDocument({
        openapi: "3.1.0",
        info: {
          title: `${env.APP_NAME} API`,
          version: "1.0.0",
          description: "REST API for the ATELIER luxury streetwear storefront.",
        },
        servers: [{ url: `${env.APP_URL}${env.API_PREFIX}` }],
      }),
    );
  });

  // Global 404 for unregistered routes.
  app.notFound((c) =>
    c.json(
      {
        success: false,
        message: `Route ${c.req.method} ${c.req.path} not found`,
        error: { code: "NOT_FOUND" },
      },
      404,
    ),
  );

  return app;
}

export type App = ReturnType<typeof buildApp>;
