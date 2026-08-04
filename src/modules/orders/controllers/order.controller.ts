import type { Context } from "hono";
import { orderService } from "../services/order.service";
import { renderInvoice, renderPackingSlip } from "../services/invoice.service";
import { orderRepository } from "../repositories/order.repository";
import { success, paginationMeta } from "@/shared/apiResponse";
import { getAuth } from "@/middleware/auth";
import { AuditAction } from "@prisma/client";
import { recordAudit } from "@/middleware/audit";
import type { UpdateOrderStatusInput } from "../validators";
import type { AdminOrderQuery, UserOrderQuery } from "../validators";

export class OrderController {
  // --- customer -------------------------------------------------------------

  listMine = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const query = c.req.valid("query" as never) as UserOrderQuery;
    const result = await orderService.listForUser(user.id, query);
    return c.json(
      success(result.data, "Orders", { pagination: paginationMeta(result.page, result.perPage, result.total) }),
    );
  };

  getMine = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const order = await orderService.getForUser(id, user.id);
    return c.json(success(order, "Order"));
  };

  trackByNumber = async (c: Context): Promise<Response> => {
    const orderNumber = c.req.param("orderNumber") ?? "";
    const { user } = getAuth(c);
    const order = await orderService.getByOrderNumber(orderNumber, user?.id);
    return c.json(
      success({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        timeline: order.timeline,
        trackingNumber: order.trackingNumber,
        courier: order.courier,
        estimatedDays: order.shippingMethod?.estimatedDaysMin && order.shippingMethod?.estimatedDaysMax
          ? [order.shippingMethod.estimatedDaysMin, order.shippingMethod.estimatedDaysMax]
          : null,
      }, "Order tracking"),
    );
  };

  invoice = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const order = await orderService.getForUser(id, user.id);
    const html = renderInvoice(order);
    return this.htmlResponse(html, `invoice-${order.orderNumber}.html`);
  };

  packingSlip = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const order = await orderService.getForUser(id, user.id);
    const html = renderPackingSlip(order);
    return this.htmlResponse(html, `packing-slip-${order.orderNumber}.html`);
  };

  // --- admin ----------------------------------------------------------------

  listAdmin = async (c: Context): Promise<Response> => {
    const query = c.req.valid("query" as never) as AdminOrderQuery;
    const result = await orderService.listAdmin(query);
    return c.json(
      success(result.data, "Orders", { pagination: paginationMeta(result.page, result.perPage, result.total) }),
    );
  };

  getAdmin = async (c: Context): Promise<Response> => {
    const id = c.req.param("id") ?? "";
    return c.json(success(await orderService.getById(id), "Order"));
  };

  updateStatus = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const body = (await c.req.json()) as UpdateOrderStatusInput;
    const order = await orderService.updateStatus(id, body, user.id);
    await recordAudit({ actorId: user.id, action: AuditAction.STATUS_CHANGE, entity: "Order", entityId: id, metadata: { status: body.status, reason: body.reason }, c });
    return c.json(success(order, "Order status updated"));
  };

  addNote = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const body = (await c.req.json()) as { note: string };
    const order = await orderService.addNote(id, body.note, user.id);
    await recordAudit({ actorId: user.id, action: AuditAction.UPDATE, entity: "Order", entityId: id, metadata: { note: body.note }, c });
    return c.json(success(order, "Note added"));
  };

  adminInvoice = async (c: Context): Promise<Response> => {
    const id = c.req.param("id") ?? "";
    const order = await orderRepository.findById(id);
    if (!order) return c.json({ success: false, message: "Order not found" }, 404);
    return this.htmlResponse(renderInvoice(order), `invoice-${order.orderNumber}.html`);
  };

  adminPackingSlip = async (c: Context): Promise<Response> => {
    const id = c.req.param("id") ?? "";
    const order = await orderRepository.findById(id);
    if (!order) return c.json({ success: false, message: "Order not found" }, 404);
    return this.htmlResponse(renderPackingSlip(order), `packing-slip-${order.orderNumber}.html`);
  };

  stats = async (c: Context): Promise<Response> => {
    return c.json(success(await orderService.stats(), "Order stats"));
  };

  private htmlResponse(html: string, filename: string): Response {
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}

export const orderController = new OrderController();
