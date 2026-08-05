import { OrderStatus, PaymentProvider, PaymentStatus } from "@prisma/client";
import { prisma } from "@/database/prisma";
import { paymentRepository } from "../repositories/payment.repository";
import { resolveProvider } from "../providers";
import { orderService } from "@/modules/orders/services/order.service";
import { generateReference } from "@/utils/id";
import { NotFoundError, PaymentError, ConflictError } from "@/shared/errors";
import { paymentVerificationQueue, safeAdd } from "@/queues";
import { logger } from "@/shared/logger";
import { roundMoney, toNumber } from "@/utils/money";
import type { InitializePaymentInput, RefundPaymentInput } from "../validators";
import type { VerifyPaymentResult } from "../types";

const AMOUNT_TOLERANCE = 1; // ±1 in major units

export class PaymentService {
  /**
   * Initialize a payment for an order against a provider.
   * Never trusts the frontend: amount/currency come from the order row.
   */
  async initializeForOrder(input: InitializePaymentInput, ctx?: { ip?: string }) {
    const order = await prisma.order.findUnique({ where: { id: input.orderId } });
    if (!order) throw new NotFoundError("Order not found");
    if (([] as OrderStatus[]).concat(OrderStatus.CANCELLED, OrderStatus.REFUNDED).includes(order.status)) {
      throw new ConflictError("Order cannot accept payment in its current state");
    }
    if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.PAID) {
      throw new ConflictError("Order is already in a final state");
    }

    // Reuse an existing pending payment ONLY if it is already on the requested
    // provider (dedupe + avoid duplicate references). If the shopper explicitly
    // picks a different provider — e.g. the order was auto-initialized on Paystack
    // but they select Flutterwave — abandon the stale pending payment so it can't
    // redirect to the wrong gateway, then initialize the provider they actually chose.
    const existing = await paymentRepository.findPendingByOrder(order.id);
    if (existing && existing.provider === input.provider) {
      const existingMeta = (existing.meta ?? {}) as { authorizationUrl?: string; accessCode?: string } | null;
      if (existingMeta?.authorizationUrl) {
        return {
          paymentId: existing.id,
          reference: existing.reference,
          authorizationUrl: existingMeta.authorizationUrl,
          accessCode: existingMeta.accessCode ?? null,
          provider: existing.provider,
          amount: toNumber(order.grandTotal),
        };
      }
      const providerClient = resolveProvider(existing.provider);
      const init = await providerClient.initialize({
        reference: existing.reference,
        amount: toNumber(order.grandTotal),
        currency: order.currency,
        email: order.email,
        metadata: { orderId: order.id, orderNumber: order.orderNumber },
        method: input.method,
        callbackUrl: input.callbackUrl,
      });
      await paymentRepository.update(existing.id, {
        externalRef: init.externalRef,
        meta: { authorizationUrl: init.authorizationUrl, accessCode: init.accessCode } as never,
      });
      return {
        paymentId: existing.id,
        reference: existing.reference,
        authorizationUrl: init.authorizationUrl,
        accessCode: init.accessCode,
        provider: existing.provider,
        amount: toNumber(order.grandTotal),
      };
    }
    if (existing && existing.provider !== input.provider) {
      await paymentRepository.update(existing.id, {
        status: PaymentStatus.FAILED,
        failureReason: `Provider changed to ${input.provider}`,
      });
    }

    const reference = generateReference(input.provider === PaymentProvider.FLUTTERWAVE ? "FLW" : "PSK");
    const payment = await paymentRepository.create({
      orderId: order.id,
      provider: input.provider,
      method: input.method,
      reference,
      amount: toNumber(order.grandTotal),
      currency: order.currency,
    });

    await paymentRepository.log({
      paymentId: payment.id,
      event: "INITIALIZED",
      message: "Payment initialization requested",
      ipAddress: ctx?.ip,
    });

    const providerClient = resolveProvider(input.provider);
    let init;
    try {
      init = await providerClient.initialize({
        reference,
        amount: toNumber(order.grandTotal),
        currency: order.currency,
        email: order.email,
        metadata: { orderId: order.id, orderNumber: order.orderNumber },
        method: input.method,
        callbackUrl: input.callbackUrl,
      });
    } catch (error) {
      await paymentRepository.update(payment.id, { status: PaymentStatus.FAILED, failureReason: error instanceof Error ? error.message : "Provider error" });
      await paymentRepository.log({ paymentId: payment.id, event: "INITIALIZE_FAILED", message: error instanceof Error ? error.message : "Provider error" });
      throw error;
    }

    await paymentRepository.update(payment.id, {
      externalRef: init.externalRef,
      meta: { authorizationUrl: init.authorizationUrl, accessCode: init.accessCode } as never,
    });

    return {
      paymentId: payment.id,
      reference,
      authorizationUrl: init.authorizationUrl,
      accessCode: init.accessCode,
      provider: input.provider,
      amount: toNumber(order.grandTotal),
      currency: order.currency,
    };
  }

  /**
   * Explicit verification triggered by the client callback. The order is only
   * marked PAID after the provider confirms; we re-fetch from the provider.
   */
  async verify(reference: string) {
    const payment = await paymentRepository.findByReference(reference);
    if (!payment) throw new NotFoundError("Payment not found");
    if (payment.status === PaymentStatus.CAPTURED || payment.status === PaymentStatus.AUTHORIZED) {
      return payment;
    }

    const providerClient = resolveProvider(payment.provider);
    const result = await providerClient.verify(reference);
    await this.settleVerification(payment.id, result);
    return paymentRepository.findByReference(reference);
  }

  /**
   * Process a verified result: on success mark payment captured + order paid.
   */
  async settleVerification(paymentId: string, result: VerifyPaymentResult) {
    const payment = await paymentRepository.findById(paymentId);
    if (!payment) throw new NotFoundError("Payment not found");

    await paymentRepository.log({
      paymentId,
      event: "VERIFY",
      message: `Provider reported status: ${result.status}`,
      payload: { amount: result.amount, currency: result.currency, paidAt: result.paidAt, externalRef: result.externalRef, failureReason: result.failureReason } as never,
    });

    if (result.status === "success") {
      const orderAmount = toNumber(payment.order.grandTotal);
      const verifiedAmount = toNumber(result.amount);
      if (Math.abs(verifiedAmount - orderAmount) > AMOUNT_TOLERANCE) {
        logger.error({ paymentId, expected: orderAmount, received: verifiedAmount }, "payment amount mismatch");
        await paymentRepository.update(paymentId, {
          status: PaymentStatus.FAILED,
          failureReason: `Amount mismatch: expected ${orderAmount}, received ${verifiedAmount}`,
        });
        await paymentRepository.log({ paymentId, event: "AMOUNT_MISMATCH", message: `Expected ${orderAmount}, received ${verifiedAmount}` });
        throw new PaymentError("Payment amount did not match order total");
      }

      await paymentRepository.update(paymentId, {
        status: PaymentStatus.CAPTURED,
        externalRef: result.externalRef ?? payment.externalRef,
        authorization: result.authorization as never,
        paidAt: result.paidAt ?? new Date(),
        lastVerifiedAt: new Date(),
      });
      await paymentRepository.log({ paymentId, event: "CAPTURED", message: "Payment captured" });

      // Mark order paid (idempotent inside)
      await orderService.markPaid(payment.orderId, orderAmount);
    } else if (result.status === "failed" || result.status === "abandoned") {
      await paymentRepository.update(paymentId, {
        status: PaymentStatus.FAILED,
        failureReason: result.failureReason ?? `Provider returned ${result.status}`,
        lastVerifiedAt: new Date(),
      });
    } else {
      // pending: schedule async re-verification
      await paymentRepository.update(paymentId, { lastVerifiedAt: new Date() });
      await safeAdd(paymentVerificationQueue, "verify-payment", {
        paymentId,
        provider: payment.provider,
        reference: payment.reference,
      }, { delay: 60_000 });
    }
  }

  /**
   * Webhook entry point. Signature verified before any state change.
   * Never trusts the frontend.
   */
  async handleWebhook(params: {
    provider: PaymentProvider;
    payload: string;
    signature?: string;
    reference: string;
  }) {
    const providerClient = resolveProvider(params.provider);
    const valid = providerClient.verifyWebhookSignature(params.payload, params.signature);
    if (!valid) {
      logger.warn({ provider: params.provider }, "webhook signature verification failed");
      throw new PaymentError("Invalid webhook signature");
    }

    const payment = await paymentRepository.findByReference(params.reference);
    if (!payment) {
      logger.warn({ reference: params.reference, provider: params.provider }, "webhook for unknown payment");
      return null;
    }
    if (payment.status === PaymentStatus.CAPTURED) {
      return payment;
    }

    const result = await providerClient.verify(params.reference);
    await this.settleVerification(payment.id, result);
    await paymentRepository.log({
      paymentId: payment.id,
      event: "WEBHOOK",
      message: `Webhook processed for ${params.provider}`,
    });
    return paymentRepository.findByReference(params.reference);
  }

  async refund(input: RefundPaymentInput, actorId?: string) {
    const payment = await paymentRepository.findById(input.paymentId);
    if (!payment) throw new NotFoundError("Payment not found");
    if (payment.status !== PaymentStatus.CAPTURED) {
      throw new ConflictError("Only captured payments can be refunded");
    }

    const amount = input.amount ?? toNumber(payment.amount);
    const providerClient = resolveProvider(payment.provider);
    const refundRef = generateReference("REF");

    const refund = await paymentRepository.createRefund({
      paymentId: payment.id,
      orderId: payment.orderId,
      reference: refundRef,
      amount,
      reason: input.reason,
    });

    try {
      const result = await providerClient.refund({
        reference: payment.externalRef ?? payment.reference,
        amount,
        reason: input.reason,
      });
      await paymentRepository.updateRefund(refund.id, { status: "REFUNDED", externalRef: result.externalRef });
    } catch (error) {
      await paymentRepository.updateRefund(refund.id, { status: "FAILED" });
      await paymentRepository.log({
        paymentId: payment.id,
        event: "REFUND_FAILED",
        message: error instanceof Error ? error.message : "Refund failed",
      });
      throw error;
    }

    await paymentRepository.log({ paymentId: payment.id, event: "REFUND", message: `Refund of ${amount} processed` });

    // If fully refunded, flip order status.
    const totalRefunded = (await prisma.refund.aggregate({
      where: { paymentId: payment.id, status: "REFUNDED" },
      _sum: { amount: true },
    }))._sum.amount;

    if (toNumber(totalRefunded) >= toNumber(payment.amount) - AMOUNT_TOLERANCE) {
      await paymentRepository.update(payment.id, { status: PaymentStatus.REFUNDED });
      await orderService.updateStatus(payment.orderId, { status: OrderStatus.REFUNDED, notifyCustomer: true }, actorId);
    } else {
      await paymentRepository.update(payment.id, { status: PaymentStatus.PARTIALLY_REFUNDED });
    }

    return refund;
  }

  async listTransactions(query: { page: number; perPage: number; status?: string; provider?: string }) {
    return paymentRepository.list(query);
  }

  async listForOrder(orderId: string) {
    return paymentRepository.listForOrder(orderId);
  }

  async stats() {
    const [byStatus, byProvider, total, successful] = await Promise.all([
      prisma.payment.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.payment.groupBy({ by: ["provider"], _count: { _all: true } }),
      prisma.payment.count(),
      prisma.payment.aggregate({ where: { status: "CAPTURED" }, _sum: { amount: true }, _count: true }),
    ]);
    return {
      total,
      successful: { count: successful._count, amount: successful._sum.amount?.toString() ?? "0" },
      byStatus,
      byProvider,
    };
  }
}

export const paymentService = new PaymentService();
