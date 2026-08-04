import { renderEmailShell } from "./email.service";
import { env } from "@/config";

export function verificationEmail(name: string, verifyUrl: string): string {
  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;">Verify your email</h2>
    <p style="margin:0 0 20px;">Hi ${name}, welcome to ${env.APP_NAME}. Please verify your email address to activate your account.</p>
    <p style="margin:0 0 20px;"><a href="${verifyUrl}" style="display:inline-block;background-color:#111111;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;">Verify Email Address</a></p>
    <p style="margin:0;color:#71717a;font-size:13px;">Or paste this link into your browser:<br/>${verifyUrl}</p>
    <p style="margin:16px 0 0;color:#71717a;font-size:13px;">This link expires in 24 hours.</p>`;
  return renderEmailShell("Verify your email", body);
}

export function welcomeEmail(name: string): string {
  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;">Welcome to ${env.APP_NAME}</h2>
    <p style="margin:0 0 20px;">Hi ${name}, your account is now active. Explore our latest drops and build your wishlist.</p>
    <p style="margin:0;"><a href="${env.CLIENT_URL}/shop" style="display:inline-block;background-color:#111111;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;">Start Shopping</a></p>`;
  return renderEmailShell("Welcome", body);
}

export function passwordResetEmail(name: string, resetUrl: string): string {
  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;">Reset your password</h2>
    <p style="margin:0 0 20px;">Hi ${name}, we received a request to reset your password. Click below to choose a new one.</p>
    <p style="margin:0 0 20px;"><a href="${resetUrl}" style="display:inline-block;background-color:#111111;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;">Reset Password</a></p>
    <p style="margin:0;color:#71717a;font-size:13px;">If you didn't request this, you can safely ignore this email. This link expires in 1 hour.</p>`;
  return renderEmailShell("Reset your password", body);
}

export function passwordChangedEmail(name: string): string {
  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;">Password changed</h2>
    <p style="margin:0;">Hi ${name}, your password was successfully changed. If you didn't do this, contact support immediately.</p>`;
  return renderEmailShell("Password changed", body);
}

export function orderConfirmationEmail(orderNumber: string, customerName: string): string {
  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;">Order confirmed</h2>
    <p style="margin:0 0 20px;">Hi ${customerName}, thank you for your order. We've received your order <strong>${orderNumber}</strong> and are preparing it for dispatch.</p>
    <p style="margin:0;"><a href="${env.CLIENT_URL}/account/orders" style="display:inline-block;background-color:#111111;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;">View Order</a></p>`;
  return renderEmailShell("Order confirmed", body);
}

export function shipmentNotificationEmail(orderNumber: string, trackingNumber: string, courier: string): string {
  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;">Your order is on its way</h2>
    <p style="margin:0 0 20px;">Good news — order <strong>${orderNumber}</strong> has shipped via <strong>${courier}</strong>.</p>
    <p style="margin:0 0 20px;">Tracking number: <strong>${trackingNumber}</strong></p>`;
  return renderEmailShell("Order shipped", body);
}

const TEMPLATE_REGISTRY: Record<string, (data: Record<string, unknown>) => string> = {
  "email-verification": (d) => verificationEmail(String(d.name ?? "there"), String(d.verifyUrl ?? "#")),
  welcome: (d) => welcomeEmail(String(d.name ?? "there")),
  "password-reset": (d) => passwordResetEmail(String(d.name ?? "there"), String(d.resetUrl ?? "#")),
  "password-changed": (d) => passwordChangedEmail(String(d.name ?? "there")),
  "order-confirmation": (d) => orderConfirmationEmail(String(d.orderNumber ?? ""), String(d.customerName ?? "there")),
  "order-shipped": (d) => shipmentNotificationEmail(String(d.orderNumber ?? ""), String(d.trackingNumber ?? ""), String(d.courier ?? "")),
  broadcast: (d) => renderEmailShell(String(d.subject ?? env.APP_NAME), String(d.body ?? "")),
};

/**
 * Render an HTML email body from a registered template name. Falls back to a
 * generic shell so unknown templates never break the queue worker.
 */
export function renderTemplate(template: string, data: Record<string, unknown>): string {
  const render = TEMPLATE_REGISTRY[template];
  if (render) return render(data);
  return renderEmailShell(String(data.subject ?? env.APP_NAME), String(data.body ?? ""));
}
