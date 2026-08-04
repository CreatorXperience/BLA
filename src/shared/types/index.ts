export type { AuthenticatedContext, AuthUser, SessionInfo, RequestContext, Variables } from "./context";
export type { Role } from "@prisma/client";

export interface OrderStatusResponse {
  status: string;
  label: string;
  color: string;
}
