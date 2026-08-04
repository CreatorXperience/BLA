import { env } from "@/config";
import { formatMoney, toNumber } from "@/utils/money";
import type { OrderWithRelations } from "../repositories/order.repository";

/** Generate a print-ready HTML invoice for an order. */
export function renderInvoice(order: OrderWithRelations): string {
  const currency = order.currency;
  const money = (n: number | string | { toNumber(): number }) => formatMoney(toNumber(n), currency);

  const itemsHtml = order.items
    .map(
      (item) => `
      <tr>
        <td>
          <div style="font-weight:600;">${escapeHtml(item.productName)}</div>
          <div style="color:#71717a;font-size:12px;">${escapeHtml(item.variantLabel ?? item.sku)}${item.size ? ` / ${escapeHtml(item.size)}` : ""}${item.color ? ` / ${escapeHtml(item.color)}` : ""}</div>
        </td>
        <td>${money(item.unitPrice)}</td>
        <td>${item.quantity}</td>
        <td style="text-align:right;font-weight:600;">${money(item.totalPrice)}</td>
      </tr>`,
    )
    .join("");

  const shippingName =
    order.shippingAddressSnapshot && typeof order.shippingAddressSnapshot === "object"
      ? [
          (order.shippingAddressSnapshot as Record<string, string>).firstName,
          (order.shippingAddressSnapshot as Record<string, string>).lastName,
          (order.shippingAddressSnapshot as Record<string, string>).line1,
          (order.shippingAddressSnapshot as Record<string, string>).city,
          (order.shippingAddressSnapshot as Record<string, string>).state,
          (order.shippingAddressSnapshot as Record<string, string>).country,
        ]
          .filter((v): v is string => Boolean(v))
          .map(escapeHtml)
          .join("<br/>")
      : escapeHtml(order.email);

  const storeName = env.APP_NAME;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Invoice ${escapeHtml(order.orderNumber)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #18181b; margin: 0; padding: 40px; }
  .header { display: flex; justify-content: space-between; border-bottom: 2px solid #18181b; padding-bottom: 16px; }
  .brand { font-size: 24px; font-weight: 800; letter-spacing: 4px; }
  .meta { text-align: right; font-size: 13px; color: #52525b; }
  .grid { display: flex; justify-content: space-between; margin-top: 24px; font-size: 13px; }
  .card { background: #fafafa; border: 1px solid #e4e4e7; padding: 12px 16px; border-radius: 8px; width: 48%; }
  .card h4 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #71717a; }
  table { width: 100%; border-collapse: collapse; margin-top: 24px; font-size: 13px; }
  th { text-align: left; border-bottom: 1px solid #d4d4d8; padding: 8px; color: #52525b; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
  td { padding: 10px 8px; border-bottom: 1px solid #f4f4f5; }
  .totals { width: 280px; margin-left: auto; margin-top: 20px; font-size: 13px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .grand { border-top: 2px solid #18181b; margin-top: 6px; padding-top: 8px; font-weight: 700; font-size: 15px; }
  .footer { margin-top: 48px; font-size: 11px; color: #a1a1aa; text-align: center; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">${storeName}</div>
    <div class="meta">
      <div><strong>INVOICE</strong> ${escapeHtml(order.orderNumber)}</div>
      <div>${order.placedAt.toLocaleDateString("en-GB")}</div>
      <div>Status: ${order.status}</div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <h4>Billed To</h4>
      <div>${shippingName}</div>
      <div>${escapeHtml(order.email)}</div>
    </div>
    <div class="card">
      <h4>Shipping</h4>
      <div>${escapeHtml(order.shippingMethod?.name ?? "Standard")}</div>
      ${order.trackingNumber ? `<div>Tracking: ${escapeHtml(order.trackingNumber)}</div>` : ""}
    </div>
  </div>

  <table>
    <thead><tr><th>Item</th><th>Unit Price</th><th>Qty</th><th style="text-align:right;">Total</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <div class="totals">
    <div><span>Subtotal</span><span>${money(order.subtotal)}</span></div>
    ${Number(order.discountTotal) > 0 ? `<div><span>Discount</span><span>-${money(order.discountTotal)}</span></div>` : ""}
    <div><span>Shipping</span><span>${money(order.shippingTotal)}</span></div>
    <div><span>Tax</span><span>${money(order.taxTotal)}</span></div>
    <div class="grand"><span>Total</span><span>${money(order.grandTotal)}</span></div>
    ${Number(order.amountPaid) > 0 ? `<div><span>Paid</span><span>${money(order.amountPaid)}</span></div>` : ""}
  </div>

  <div class="footer">Thank you for shopping with ${storeName}.</div>
</body>
</html>`;
}

/** Generate a print-ready HTML packing slip for an order. */
export function renderPackingSlip(order: OrderWithRelations): string {
  const itemsHtml = order.items
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.productName)}</td>
        <td>${escapeHtml(item.sku)}</td>
        <td>${escapeHtml(item.size ?? "-")}</td>
        <td>${escapeHtml(item.color ?? "-")}</td>
        <td>${item.quantity}</td>
      </tr>`,
    )
    .join("");

  const storeName = env.APP_NAME;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Packing Slip ${escapeHtml(order.orderNumber)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 32px; color: #18181b; }
  h1 { font-size: 18px; letter-spacing: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
  th { text-align: left; border-bottom: 2px solid #18181b; padding: 8px; text-transform: uppercase; font-size: 11px; letter-spacing: 1px; }
  td { padding: 8px; border-bottom: 1px solid #e4e4e7; }
</style>
</head>
<body>
  <h1>${storeName} — PACKING SLIP</h1>
  <p><strong>${escapeHtml(order.orderNumber)}</strong> &nbsp; ${order.placedAt.toLocaleDateString("en-GB")}</p>
  <table>
    <thead><tr><th>Item</th><th>SKU</th><th>Size</th><th>Color</th><th>Qty</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
