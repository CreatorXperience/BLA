import { createHmac } from "node:crypto";
import { PaymentProvider } from "@prisma/client";
import { env } from "@/config";
import { PaymentError } from "@/shared/errors";
import { logger } from "@/shared/logger";
import type {
  InitializePaymentParams,
  InitializePaymentResult,
  PaymentProviderClient,
  RefundResult,
  VerifyPaymentResult,
} from "../types/payment.types";

const PAYSTACK_BASE = "https://api.paystack.co";

async function paystackRequest(path: string, options: RequestInit = {}, method = "GET") {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    body: options.body,
    signal: options.signal ?? AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: unknown };
  if (!res.ok || json.status === false) {
    throw new PaymentError(json.message ?? `Paystack request failed (${res.status})`, {
      status: res.status,
      data: json.data,
    });
  }
  return json.data;
}

export class PaystackProvider implements PaymentProviderClient {
  readonly provider = PaymentProvider.PAYSTACK;

  async initialize(params: InitializePaymentParams): Promise<InitializePaymentResult> {
    const amountMinor = Math.round(params.amount * 100); // Paystack uses minor units
    const data = (await paystackRequest(
      "/transaction/initialize",
      {
        body: JSON.stringify({
          reference: params.reference,
          amount: amountMinor,
          currency: params.currency,
          email: params.email,
          callback_url: params.callbackUrl,
          metadata: params.metadata,
        }),
      },
      "POST",
    )) as { authorization_url: string; access_code?: string };

    return {
      authorizationUrl: data.authorization_url,
      accessCode: data.access_code,
    };
  }

  async verify(reference: string): Promise<VerifyPaymentResult> {
    let data;
    try {
      data = (await paystackRequest(
        `/transaction/verify/${encodeURIComponent(reference)}`,
      )) as {
        status?: string;
        amount?: number;
        currency?: string;
        paid_at?: string | null;
        gateway_response?: string;
        authorization?: unknown;
      };
    } catch (error) {
      // A reference that was initialized but never paid can come back as unknown at
      // verification. That is an abandoned attempt, not a gateway outage, so surface
      // it as abandoned rather than throwing (which callers would read as pending).
      const message = error instanceof Error ? error.message : "";
      if (/(not found|unknown transaction|does not exist|no transaction)/i.test(message)) {
        return { status: "abandoned", amount: 0, failureReason: "Transaction was not completed at the gateway" };
      }
      throw error;
    }

    const statusMap: VerifyPaymentResult["status"] =
      data.status === "success" ? "success" : data.status === "abandoned" ? "abandoned" : data.status === "failed" ? "failed" : "pending";

    return {
      status: statusMap,
      amount: (data.amount ?? 0) / 100,
      currency: data.currency,
      paidAt: data.paid_at ? new Date(data.paid_at) : null,
      authorization: data.authorization,
      failureReason: data.gateway_response,
      raw: data,
    };
  }

  async refund(params: { reference: string; amount: number; reason?: string }): Promise<RefundResult> {
    const data = (await paystackRequest(
      "/refund",
      { body: JSON.stringify({ transaction: params.reference, amount: Math.round(params.amount * 100), reason: params.reason }) },
      "POST",
    )) as { id: number; status: string };

    return { externalRef: String(data.id), status: data.status };
  }

  verifyWebhookSignature(payload: string, signature?: string): boolean {
    if (!signature) return false;
    const hash = createHmac("sha512", env.PAYSTACK_WEBHOOK_SECRET || env.PAYSTACK_SECRET_KEY)
      .update(payload)
      .digest("hex");
    return hash === signature;
  }
}

export function createPaystackProvider(): PaymentProviderClient {
  return new PaystackProvider();
}
