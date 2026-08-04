import { OrderEventType, OrderStatus } from "@prisma/client";
import { prisma } from "@/database/prisma";
import { orderRepository } from "../repositories/order.repository";
import { NotFoundError, ForbiddenError } from "@/shared/errors";
import { notificationService } from "@/modules/notifications/services/notification.service";
import { orderConfirmationEmail, shipmentNotificationEmail } from "@/modules/notifications/services/templates";
import { invoiceGenerationQueue } from "@/queues";
import { logger } from "@/shared/logger";
import { cacheDelPattern } from "@/database/redis";
import type { UpdateOrderStatusInput } from "../validators";
import type { AdminOrderQuery, UserOrderQuery } from "../validators";
import type { CreateOrderData } from "../repositories/order.repository";

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  PROCESSING: "Processing",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

// Allowed transitions per status (guards the lifecycle).
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PAID", "CANCELLED", "REFUNDED"],
  PAID: ["PROCESSING", "CANCELLED", "REFUNDED"],
  PROCESSING: ["PACKED", "CANCELLED", "REFUNDED"],
  PACKED: ["SHIPPED", "CANCELLED", "REFUNDED"],
  SHIPPED: ["DELIVERED", "REFUNDED"],
  DELIVERED: ["REFUNDED"],
  CANCELLED: ["REFUNDED"],
  REFUNDED: [],
};

export class OrderService {
  getById(id: string) {
    return orderRepository.findById(id);
  }

  async getByOrderNumber(orderNumber: string, userId?: string) {
    const order = await orderRepository.findByOrderNumber(orderNumber);
    if (!order) throw new NotFoundError("Order not found");
    if (userId && order.userId && order.userId !== userId) {
      throw new ForbiddenError("You do not have access to this order");
    }
    return order;
  }

  async getForUser(id: string, userId: string) {
    const order = await orderRepository.findByIdForUser(id, userId);
    if (!order) throw new NotFoundError("Order not found");
    return order;
  }

  async listForUser(userId: string, query: UserOrderQuery) {
    return orderRepository.listForUser(userId, query);
  }

  async listAdmin(query: AdminOrderQuery) {
    return orderRepository.listAdmin(query);
  }

  /**
   * Create an order with items + timeline in one transaction.
   * Called by the checkout flow. Returns the order with relations.
   */
  async createOrder(data: CreateOrderData & { items: Array<{
    productId: string;
    variantId?: string;
    productName: string;
    variantLabel?: string;
    sku: string;
    imageUrl?: string;
    unitPrice: number;
    quantity: number;
    discount?: number;
    totalPrice: number;
    color?: string;
    size?: string;
  }> }, actorId?: string) {
    const order = await prisma.$transaction(async (tx) => {
      const created = await orderRepository.create(data, tx);
      await orderRepository.addItems(created.id, data.items, tx);
      await orderRepository.addTimeline(
        {
          orderId: created.id,
          eventType: OrderEventType.STATUS_CHANGE,
          toStatus: created.status,
          description: "Order placed",
        },
        tx,
      );
      return created;
    });

    if (!data.isGuest && data.userId) {
      await notificationService.notifyUser({
        userId: data.userId,
        type: "ORDER_PLACED",
        title: "Order confirmed",
        body: `Your order ${order.orderNumber} has been placed.`,
        data: { orderNumber: order.orderNumber, grandTotal: order.grandTotal.toString() },
      });
    }
    await notificationService.sendEmailNow({
      to: data.email,
      subject: `Order confirmed — ${order.orderNumber}`,
      html: orderConfirmationEmail(order.orderNumber, data.userId ? "there" : data.email),
    });
    await invoiceGenerationQueue.add("generate-invoice", { orderId: order.id, kind: "invoice" });
    await this.evict();

    return orderRepository.findById(order.id);
  }

  async updateStatus(id: string, input: UpdateOrderStatusInput, actorId?: string) {
    const order = await orderRepository.findById(id);
    if (!order) throw new NotFoundError("Order not found");

    if (order.status === input.status) {
      return order;
    }

    const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(input.status)) {
      throw new ForbiddenError(
        `Cannot move order from ${order.status} to ${input.status}. Allowed: ${allowed.join(", ") || "none"}`,
      );
    }

    const data: Record<string, unknown> = { status: input.status };
    if (input.status === OrderStatus.PAID && !order.paidAt) data.paidAt = new Date();
    if (input.status === OrderStatus.SHIPPED) data.shippedAt = new Date();
    if (input.status === OrderStatus.DELIVERED) data.deliveredAt = new Date();
    if (input.status === OrderStatus.CANCELLED) {
      data.cancelledAt = new Date();
      data.cancelledReason = input.reason;
    }
    if (input.status === OrderStatus.REFUNDED) data.refundedAt = new Date();
    if (input.trackingNumber) data.trackingNumber = input.trackingNumber;
    if (input.courier) data.courier = input.courier;

    const updated = await orderRepository.update(id, data as never);

    await orderRepository.addTimeline({
      orderId: id,
      eventType: OrderEventType.STATUS_CHANGE,
      fromStatus: order.status,
      toStatus: input.status,
      description: `${STATUS_LABELS[order.status]} → ${STATUS_LABELS[input.status]}`,
      metadata: { reason: input.reason },
      createdById: actorId,
    });

    // Restore stock for cancelled orders
    if (input.status === OrderStatus.CANCELLED || input.status === OrderStatus.REFUNDED) {
      const { inventoryService } = await import("@/modules/inventory/services/inventory.service");
      await inventoryService.restoreForCancelledOrder(
        order.items.map((i) => ({ variantId: i.variantId ?? "", quantity: i.quantity })),
        `order-${order.orderNumber}`,
      );
    }

    if (input.notifyCustomer && order.userId) {
      await this.sendStatusNotification(updated, input.status);
    }

    await this.evict();
    return orderRepository.findById(id);
  }

  async addNote(id: string, note: string, actorId?: string, publicNote = true) {
    const order = await orderRepository.findById(id);
    if (!order) throw new NotFoundError("Order not found");
    await orderRepository.addTimeline({
      orderId: id,
      eventType: OrderEventType.NOTE,
      description: note,
      metadata: { public: publicNote },
      createdById: actorId,
    });
    return orderRepository.findById(id);
  }

  async cancelOrder(id: string, reason: string, actorId?: string) {
    return this.updateStatus(id, { status: OrderStatus.CANCELLED, reason, notifyCustomer: true }, actorId);
  }

  /** Called by the payment service after webhook verification. */
  async markPaid(orderId: string, amountPaid: number, actorId?: string) {
    const order = await orderRepository.findById(orderId);
    if (!order) throw new NotFoundError("Order not found");

    const updated = await orderRepository.update(orderId, {
      status: OrderStatus.PAID,
      paidAt: order.paidAt ?? new Date(),
      amountPaid,
    });
    await orderRepository.addTimeline({
      orderId,
      eventType: OrderEventType.PAYMENT,
      fromStatus: order.status,
      toStatus: OrderStatus.PAID,
      description: "Payment confirmed",
      createdById: actorId,
    });
    if (order.userId) {
      await notificationService.notifyUser({
        userId: order.userId,
        type: "PAYMENT_CONFIRMED",
        title: "Payment confirmed",
        body: `Payment for ${order.orderNumber} confirmed.`,
        data: { orderNumber: order.orderNumber, amount: amountPaid.toString() },
      });
    }
    await this.evict();
    return updated;
  }

  async stats() {
    const [byStatus, paid] = await Promise.all([
      orderRepository.countByStatus(),
      orderRepository.sumRevenue(),
    ]);
    const map: Record<string, number> = {};
    for (const row of byStatus) map[row.status] = row._count._all;
    return { byStatus: map, total: byStatus.reduce((acc, r) => acc + r._count._all, 0), paid };
  }

  private async sendStatusNotification(order: { id: string; orderNumber: string; userId: string | null; email: string }, status: OrderStatus) {
    if (status === OrderStatus.SHIPPED && order.userId) {
      const full = await orderRepository.findById(order.id);
      const tracking = full?.trackingNumber ?? "";
      const courier = full?.courier ?? "our courier";
      await notificationService.sendEmailNow({
        to: order.email,
        subject: `Your order has shipped — ${order.orderNumber}`,
        html: shipmentNotificationEmail(order.orderNumber, tracking, courier),
      });
      await notificationService.notifyUser({
        userId: order.userId,
        type: "ORDER_SHIPPED",
        title: "Order shipped",
        body: `Your order ${order.orderNumber} is on its way.`,
        data: { orderNumber: order.orderNumber, trackingNumber: tracking },
      });
    }
  }

  private evict() {
    return cacheDelPattern("cache:analytics*");
  }
}

export const orderService = new OrderService();
export { STATUS_LABELS };
