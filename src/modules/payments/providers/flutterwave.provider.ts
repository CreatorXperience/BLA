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

const FLUTTERWAVE_BASE = "https://api.flutterwave.com/v3";

async function flutterwaveRequest(path: string, options: RequestInit = {}, method = "GET") {
  const res = await fetch(`${FLUTTERWAVE_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    body: options.body,
    signal: options.signal ?? AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => ({}))) as { status?: string; message?: string; data?: unknown };
  if (!res.ok || json.status === "error") {
    throw new PaymentError(json.message ?? `Flutterwave request failed (${res.status})`, {
      status: res.status,
      data: json.data,
    });
  }
  return json.data;
}

export class FlutterwaveProvider implements PaymentProviderClient {
  readonly provider = PaymentProvider.FLUTTERWAVE;

  async initialize(params: InitializePaymentParams): Promise<InitializePaymentResult> {
    const data = (await flutterwaveRequest(
      "/payments",
      {
        body: JSON.stringify({
          tx_ref: params.reference,
          amount: params.amount,
          currency: params.currency,
          redirect_url: params.callbackUrl,
          customer: { email: params.email },
          payment_options: params.method ? params.method.toLowerCase() : undefined,
          meta: params.metadata,
        }),
      },
      "POST",
    )) as { link: string; tx_ref: string };

    return {
      authorizationUrl: data.link,
      externalRef: data.tx_ref,
    };
  }

  async verify(reference: string): Promise<VerifyPaymentResult> {
    // Flutterwave stores tx_ref; query by transaction reference via the v3 verify-by-ref endpoint.
    const data = (await flutterwaveRequest(
      `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
    )) as {
      status?: string;
      amount?: number;
      currency?: string;
      paid_at?: string | null;
      id?: number;
      processor_response?: string;
    };

    const statusMap: VerifyPaymentResult["status"] =
      data.status === "successful" ? "success" : data.status === "failed" ? "failed" : data.status === "cancelled" ? "abandoned" : "pending";

    return {
      status: statusMap,
      amount: data.amount ?? 0,
      currency: data.currency,
      paidAt: data.paid_at ? new Date(data.paid_at) : null,
      externalRef: data.id ? String(data.id) : undefined,
      failureReason: data.processor_response,
      raw: data,
    };
  }

  async refund(params: { reference: string; amount: number; reason?: string }): Promise<RefundResult> {
    const data = (await flutterwaveRequest(
      "/refunds",
      { body: JSON.stringify({ id: params.reference, amount: params.amount, reason: params.reason }) },
      "POST",
    )) as { id: number; status: string };

    return { externalRef: String(data.id), status: data.status };
  }

  verifyWebhookSignature(_payload: string, signature?: string): boolean {
    // Flutterwave uses a static secret hash header (x-verif-hash).
    if (!env.FLUTTERWAVE_WEBHOOK_SECRET) {
      logger.warn("Flutterwave webhook secret not configured");
    }
    return signature === env.FLUTTERWAVE_WEBHOOK_SECRET && !!signature;
  }
}

export function createFlutterwaveProvider(): PaymentProviderClient {
  return new FlutterwaveProvider();
}
