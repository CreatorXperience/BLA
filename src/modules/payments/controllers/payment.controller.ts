import type { Context } from "hono";
import { paymentService } from "../services/payment.service";
import { success, paginationMeta } from "@/shared/apiResponse";
import { getAuth } from "@/middleware/auth";
import { AuditAction, PaymentProvider } from "@prisma/client";
import { recordAudit } from "@/middleware/audit";
import { logger } from "@/shared/logger";
import type { InitializePaymentInput, RefundPaymentInput, VerifyPaymentInput } from "../validators";
import { InitializePaymentSchema, RefundPaymentSchema, VerifyPaymentSchema } from "../validators";

export class PaymentController {
  /** Initialize a payment for an order (customer or checkout). */
  initialize = async (c: Context): Promise<Response> => {
    const body = InitializePaymentSchema.parse(await c.req.json()) as InitializePaymentInput;
    const result = await paymentService.initializeForOrder(body, {
      ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
    });
    return c.json(success(result, "Payment initialized"));
  };

  /** Client callback verification. */
  verify = async (c: Context): Promise<Response> => {
    const body = VerifyPaymentSchema.parse(await c.req.json()) as VerifyPaymentInput;
    const payment = await paymentService.verify(body.reference);
    return c.json(success(payment, "Payment verification result"));
  };

  /** Verify status by reference (used by frontend polling). */
  status = async (c: Context): Promise<Response> => {
    const reference = c.req.param("reference") ?? "";
    const payment = await paymentService.verify(reference);
    if (!payment) {
      return c.json({ success: false, message: "Payment not found" }, 404);
    }
    return c.json(
      success(
        { reference: payment.reference, status: payment.status, orderId: payment.orderId },
        "Payment status",
      ),
    );
  };

  /**
   * Webhook handlers. Raw body required for signature verification — Hono's
   * req.text() gives us the raw payload.
   */
  paystackWebhook = async (c: Context): Promise<Response> => {
    const payload = await c.req.text();
    const signature = c.req.header("x-paystack-signature");
    const parsed = JSON.parse(payload) as { event?: string; data?: { reference?: string; trxref?: string } };
    const reference = parsed.data?.reference ?? parsed.data?.trxref ?? "";

    logger.info({ event: parsed.event, reference }, "paystack webhook received");
    const result = await paymentService.handleWebhook({
      provider: PaymentProvider.PAYSTACK,
      payload,
      signature,
      reference,
    });
    return c.json({ success: true, data: result });
  };

  flutterwaveWebhook = async (c: Context): Promise<Response> => {
    const payload = await c.req.text();
    const signature = c.req.header("x-verif-hash");
    const parsed = JSON.parse(payload) as { data?: { tx_ref?: string; id?: number } };
    const reference = parsed.data?.tx_ref ?? parsed.data?.id?.toString() ?? "";

    logger.info({ reference }, "flutterwave webhook received");
    const result = await paymentService.handleWebhook({
      provider: PaymentProvider.FLUTTERWAVE,
      payload,
      signature,
      reference,
    });
    return c.json({ success: true, data: result });
  };

  refund = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const body = RefundPaymentSchema.parse(await c.req.json()) as RefundPaymentInput;
    const refund = await paymentService.refund(body, user.id);
    await recordAudit({ actorId: user.id, action: AuditAction.UPDATE, entity: "Refund", entityId: refund.id, metadata: { amount: refund.amount }, c });
    return c.json(success(refund, "Refund processed"));
  };

  listForOrder = async (c: Context): Promise<Response> => {
    const orderId = c.req.param("orderId") ?? "";
    return c.json(success(await paymentService.listForOrder(orderId), "Transactions"));
  };

  list = async (c: Context): Promise<Response> => {
    const page = Number(c.req.query("page") ?? 1);
    const perPage = Number(c.req.query("perPage") ?? 20);
    const result = await paymentService.listTransactions({
      page,
      perPage,
      status: c.req.query("status"),
      provider: c.req.query("provider"),
    });
    return c.json(success(result.data, "Transactions", { pagination: paginationMeta(result.page, result.perPage, result.total) }));
  };

  stats = async (c: Context): Promise<Response> => {
    return c.json(success(await paymentService.stats(), "Payment stats"));
  };
}

export const paymentController = new PaymentController();
