import type { Context } from "hono";
import { couponService } from "../services/coupon.service";
import { success, paginationMeta } from "@/shared/apiResponse";
import { getAuth } from "@/middleware/auth";
import { AuditAction } from "@prisma/client";
import { recordAudit } from "@/middleware/audit";
import type { CreateCouponInput, UpdateCouponInput, CouponQuery } from "../validators";

export class CouponController {
  list = async (c: Context): Promise<Response> => {
    const query = c.req.query();
    const result = await couponService.list(query as unknown as CouponQuery);
    return c.json(success(result.data, "Coupons", { pagination: paginationMeta(result.page, result.perPage, result.total) }));
  };

  get = async (c: Context): Promise<Response> => {
    const id = c.req.param("id") ?? "";
    return c.json(success(await couponService.get(id), "Coupon"));
  };

  create = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const body = (await c.req.json()) as CreateCouponInput;
    const coupon = await couponService.create(body);
    await recordAudit({ actorId: user.id, action: AuditAction.CREATE, entity: "Coupon", entityId: coupon.id, metadata: { code: coupon.code }, c });
    return c.json(success(coupon, "Coupon created"), 201);
  };

  update = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const body = (await c.req.json()) as UpdateCouponInput;
    const coupon = await couponService.update(id, body);
    await recordAudit({ actorId: user.id, action: AuditAction.UPDATE, entity: "Coupon", entityId: id, c });
    return c.json(success(coupon, "Coupon updated"));
  };

  remove = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const result = await couponService.remove(id);
    await recordAudit({ actorId: user.id, action: AuditAction.DELETE, entity: "Coupon", entityId: id, c });
    return c.json(success(result, "Coupon deleted"));
  };
}

export const couponController = new CouponController();
