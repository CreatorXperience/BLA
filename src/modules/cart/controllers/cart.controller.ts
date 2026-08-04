import type { Context } from "hono";
import { cartService } from "../services/cart.service";
import { success } from "@/shared/apiResponse";
import { getAuthUser } from "@/middleware/auth";
import type { AddToCartInput, ApplyCouponInput, CartShippingInput, UpdateCartItemInput } from "../types";

function cartToken(c: Context): string | undefined {
  return c.req.header("x-cart-token") || undefined;
}

export class CartController {
  get = async (c: Context): Promise<Response> => {
    const user = getAuthUser(c);
    const cart = await cartService.getCart({
      userId: user?.id,
      guestToken: cartToken(c),
      country: c.req.query("country"),
      region: c.req.query("region"),
    });
    return c.json(success(cart, "Cart"));
  };

  addItem = async (c: Context): Promise<Response> => {
    const user = getAuthUser(c);
    const body = (await c.req.json()) as AddToCartInput;
    const cart = await cartService.addItem({ userId: user?.id, guestToken: cartToken(c), input: body });
    return c.json(success(cart, "Item added to cart"));
  };

  updateItem = async (c: Context): Promise<Response> => {
    const user = getAuthUser(c);
    const itemId = c.req.param("itemId") ?? "";
    const body = (await c.req.json()) as UpdateCartItemInput;
    const cart = await cartService.updateItemQuantity({ userId: user?.id, guestToken: cartToken(c), itemId, input: body });
    return c.json(success(cart, "Cart updated"));
  };

  removeItem = async (c: Context): Promise<Response> => {
    const user = getAuthUser(c);
    const itemId = c.req.param("itemId") ?? "";
    const cart = await cartService.removeItem({ userId: user?.id, guestToken: cartToken(c), itemId });
    return c.json(success(cart, "Item removed from cart"));
  };

  clear = async (c: Context): Promise<Response> => {
    const user = getAuthUser(c);
    const cart = await cartService.clear({ userId: user?.id, guestToken: cartToken(c) });
    return c.json(success(cart, "Cart cleared"));
  };

  applyCoupon = async (c: Context): Promise<Response> => {
    const user = getAuthUser(c);
    const body = (await c.req.json()) as ApplyCouponInput;
    const cart = await cartService.applyCoupon({ userId: user?.id, guestToken: cartToken(c), input: body });
    return c.json(success(cart, "Coupon applied"));
  };

  removeCoupon = async (c: Context): Promise<Response> => {
    const user = getAuthUser(c);
    const cart = await cartService.removeCoupon({ userId: user?.id, guestToken: cartToken(c) });
    return c.json(success(cart, "Coupon removed"));
  };

  setShipping = async (c: Context): Promise<Response> => {
    const user = getAuthUser(c);
    const body = (await c.req.json()) as CartShippingInput;
    const cart = await cartService.setShipping({ userId: user?.id, guestToken: cartToken(c), input: body });
    return c.json(success(cart, "Shipping updated"));
  };

  count = async (c: Context): Promise<Response> => {
    const user = getAuthUser(c);
    const count = await cartService.countItems({ userId: user?.id, guestToken: cartToken(c) });
    return c.json(success({ count }, "Cart count"));
  };
}

export const cartController = new CartController();
