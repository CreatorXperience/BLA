import { PaymentMethod, PaymentProvider } from "@prisma/client";

export interface InitializePaymentParams {
  reference: string;
  amount: number; // in major units
  currency: string;
  email: string;
  metadata?: Record<string, unknown>;
  method?: PaymentMethod | null;
  callbackUrl?: string;
}

export interface InitializePaymentResult {
  authorizationUrl: string;
  accessCode?: string;
  externalRef?: string;
}

export interface VerifyPaymentResult {
  status: "success" | "failed" | "pending" | "abandoned";
  amount: number; // major units
  currency?: string;
  paidAt?: Date | null;
  externalRef?: string;
  authorization?: unknown;
  raw?: unknown;
  failureReason?: string;
}

export interface RefundResult {
  externalRef: string;
  status: string;
}

export interface PaymentProviderClient {
  readonly provider: PaymentProvider;
  initialize(params: InitializePaymentParams): Promise<InitializePaymentResult>;
  verify(reference: string): Promise<VerifyPaymentResult>;
  refund(params: { reference: string; amount: number; reason?: string }): Promise<RefundResult>;
  verifyWebhookSignature(payload: string, signature?: string): boolean;
}
