import type { Context } from "hono";
import { checkoutService } from "../services/checkout.service";
import { success } from "@/shared/apiResponse";
import { getAuthUser } from "@/middleware/auth";
import { AuditAction } from "@prisma/client";
import { recordAudit } from "@/middleware/audit";
import type { CreateOrderInput } from "../validators";

function identity(c: Context) {
  const user = getAuthUser(c);
  return {
    userId: user?.id,
    guestToken: c.req.header("x-cart-token") || undefined,
    ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: c.req.header("user-agent"),
  };
}

export class CheckoutController {
  /** Step: preview order summary before placing. */
  preview = async (c: Context): Promise<Response> => {
    const body = (await c.req.json()) as CreateOrderInput;
    const summary = await checkoutService.preview(body, identity(c));
    return c.json(success(summary, "Order summary"));
  };

  /** Final: create order + payment intent. */
  placeOrder = async (c: Context): Promise<Response> => {
    const id = identity(c);
    const body = (await c.req.json()) as CreateOrderInput;
    const result = await checkoutService.placeOrder(body, id);
    await recordAudit({
      actorId: id.userId,
      action: AuditAction.CREATE,
      entity: "Order",
      entityId: result.order.id,
      metadata: { orderNumber: result.order.orderNumber, total: result.order.grandTotal, guest: !id.userId },
      c,
    });
    return c.json(success(result, "Order placed"), 201);
  };

  /** Shipping options for a destination (pre-checkout). */
  shippingOptions = async (c: Context): Promise<Response> => {
    const { shippingService } = await import("@/modules/shipping/services/shipping.service");
    const body = (await c.req.json()) as { country: string; region?: string; subtotal?: number; weightKg?: number };
    const result = await shippingService.estimate({
      country: body.country,
      region: body.region,
      subtotal: body.subtotal ?? 0,
      weightKg: body.weightKg ?? 0,
    });
    return c.json(success(result, "Shipping options"));
  };
}

export const checkoutController = new CheckoutController();
