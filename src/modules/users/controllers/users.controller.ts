import type { Context } from "hono";
import { userService } from "../services/users.service";
import { getAuth } from "@/middleware/auth";
import { success } from "@/shared/apiResponse";
import { AuditAction } from "@prisma/client";
import { recordAudit } from "@/middleware/audit";
import type {
  ChangePasswordInput,
  CreateAddressInput,
  UpdateEmailInput,
  UpdateProfileInput,
} from "../types";

export class UserController {
  getProfile = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const profile = await userService.getProfile(user.id);
    return c.json(success(profile, "Profile"));
  };

  updateProfile = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const body = (await c.req.json()) as UpdateProfileInput;
    const profile = await userService.updateProfile(user.id, body);
    await recordAudit({ actorId: user.id, action: AuditAction.UPDATE, entity: "User", entityId: user.id, c });
    return c.json(success(profile, "Profile updated"));
  };

  changePassword = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const body = (await c.req.json()) as ChangePasswordInput;
    await userService.changePassword(user.id, body);
    await recordAudit({ actorId: user.id, action: AuditAction.UPDATE, entity: "User", entityId: user.id, metadata: { change: "password" }, c });
    return c.json(success(null, "Password changed"));
  };

  updateEmail = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const body = (await c.req.json()) as UpdateEmailInput;
    const result = await userService.updateEmail(user.id, body);
    return c.json(success(result, "Email updated — please verify the new address"));
  };

  // Addresses
  listAddresses = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const addresses = await userService.listAddresses(user.id);
    return c.json(success(addresses, "Addresses"));
  };

  createAddress = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const body = (await c.req.json()) as CreateAddressInput;
    const address = await userService.createAddress(user.id, body);
    await recordAudit({ actorId: user.id, action: AuditAction.CREATE, entity: "Address", entityId: address.id, c });
    return c.json(success(address, "Address created"), 201);
  };

  updateAddress = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const addressId = c.req.param("id") ?? "";
    const body = (await c.req.json()) as CreateAddressInput;
    const address = await userService.updateAddress(user.id, addressId, body);
    await recordAudit({ actorId: user.id, action: AuditAction.UPDATE, entity: "Address", entityId: addressId, c });
    return c.json(success(address, "Address updated"));
  };

  deleteAddress = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const addressId = c.req.param("id") ?? "";
    await userService.deleteAddress(user.id, addressId);
    await recordAudit({ actorId: user.id, action: AuditAction.DELETE, entity: "Address", entityId: addressId, c });
    return c.json(success(null, "Address deleted"));
  };

  // Sessions
  listSessions = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const sessions = await userService.listSessions(user.id);
    return c.json(success(sessions, "Sessions"));
  };

  revokeSession = async (c: Context): Promise<Response> => {
    const { user, session } = getAuth(c);
    const sessionId = c.req.param("id") ?? "";
    if (session?.sessionId === sessionId) {
      return c.json({ success: false, message: "Cannot revoke the current session" }, 400);
    }
    await userService.revokeSession(user.id, sessionId);
    return c.json(success(null, "Session revoked"));
  };

  revokeAllSessions = async (c: Context): Promise<Response> => {
    const { user, session } = getAuth(c);
    await userService.revokeAllSessions(user.id, session?.sessionId);
    return c.json(success(null, "Other sessions revoked"));
  };
}

export const userController = new UserController();
