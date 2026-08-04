import { PaymentProvider } from "@prisma/client";
import { createPaystackProvider } from "./paystack.provider";
import { createFlutterwaveProvider } from "./flutterwave.provider";
import type { PaymentProviderClient } from "../types/payment.types";

/** Registry so the payment service can resolve providers by name. */
export function resolveProvider(provider: PaymentProvider): PaymentProviderClient {
  switch (provider) {
    case PaymentProvider.PAYSTACK:
      return createPaystackProvider();
    case PaymentProvider.FLUTTERWAVE:
      return createFlutterwaveProvider();
    default:
      throw new Error(`Unsupported payment provider: ${provider}`);
  }
}
