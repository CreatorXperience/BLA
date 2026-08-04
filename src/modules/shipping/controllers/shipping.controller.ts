import type { Context } from "hono";
import { shippingService } from "../services/shipping.service";
import { success } from "@/shared/apiResponse";
import { getAuth } from "@/middleware/auth";
import { AuditAction } from "@prisma/client";
import { recordAudit } from "@/middleware/audit";
import type {
  CreateShippingMethodInput,
  CreateShippingRuleInput,
  CreateShippingZoneInput,
  EstimateShippingInput,
  UpdateShippingMethodInput,
  UpdateShippingZoneInput,
} from "../validators";

export class ShippingController {
  // Public estimate
  estimate = async (c: Context): Promise<Response> => {
    const body = (await c.req.json()) as EstimateShippingInput;
    const result = await shippingService.estimate(body);
    return c.json(success(result, "Shipping estimate"));
  };

  // Zones
  listZones = async (c: Context): Promise<Response> => {
    return c.json(success(await shippingService.listZones(), "Shipping zones"));
  };

  createZone = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const body = (await c.req.json()) as CreateShippingZoneInput;
    const zone = await shippingService.createZone(body);
    await recordAudit({ actorId: user.id, action: AuditAction.CREATE, entity: "ShippingZone", entityId: zone.id, c });
    return c.json(success(zone, "Shipping zone created"), 201);
  };

  updateZone = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const body = (await c.req.json()) as UpdateShippingZoneInput;
    const zone = await shippingService.updateZone(id, body);
    await recordAudit({ actorId: user.id, action: AuditAction.UPDATE, entity: "ShippingZone", entityId: id, c });
    return c.json(success(zone, "Shipping zone updated"));
  };

  removeZone = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const result = await shippingService.removeZone(id);
    await recordAudit({ actorId: user.id, action: AuditAction.DELETE, entity: "ShippingZone", entityId: id, c });
    return c.json(success(result, "Shipping zone deleted"));
  };

  // Methods
  createMethod = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const body = (await c.req.json()) as CreateShippingMethodInput;
    const method = await shippingService.createMethod(body);
    await recordAudit({ actorId: user.id, action: AuditAction.CREATE, entity: "ShippingMethod", entityId: method.id, c });
    return c.json(success(method, "Shipping method created"), 201);
  };

  updateMethod = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const body = (await c.req.json()) as UpdateShippingMethodInput;
    const method = await shippingService.updateMethod(id, body);
    await recordAudit({ actorId: user.id, action: AuditAction.UPDATE, entity: "ShippingMethod", entityId: id, c });
    return c.json(success(method, "Shipping method updated"));
  };

  removeMethod = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const result = await shippingService.removeMethod(id);
    await recordAudit({ actorId: user.id, action: AuditAction.DELETE, entity: "ShippingMethod", entityId: id, c });
    return c.json(success(result, "Shipping method deleted"));
  };

  // Rules
  createRule = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const body = (await c.req.json()) as CreateShippingRuleInput;
    const rule = await shippingService.createRule(body);
    await recordAudit({ actorId: user.id, action: AuditAction.CREATE, entity: "ShippingRule", entityId: rule.id, c });
    return c.json(success(rule, "Shipping rule created"), 201);
  };

  removeRule = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const result = await shippingService.removeRule(id);
    await recordAudit({ actorId: user.id, action: AuditAction.DELETE, entity: "ShippingRule", entityId: id, c });
    return c.json(success(result, "Shipping rule deleted"));
  };
}

export const shippingController = new ShippingController();
