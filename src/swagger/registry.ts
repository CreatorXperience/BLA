import { OpenAPIRegistry, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

/**
 * Central OpenAPI registry. Route modules can register schemas here to extend
 * the generated spec without coupling route code to Swagger.
 */
export const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});

registry.registerComponent("securitySchemes", "cartToken", {
  type: "apiKey",
  in: "header",
  name: "x-cart-token",
});

export const ErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  error: z.object({
    code: z.string().optional(),
    details: z.unknown().optional(),
  }).optional(),
});

export const SuccessSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    success: z.literal(true),
    message: z.string(),
    data,
    meta: z.object({ requestId: z.string().optional(), cache: z.boolean().optional() }).optional(),
  });

registry.register("Error", ErrorSchema);

// Core paths (paths are relative to the configured API prefix).
registry.registerPath({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "Service health check",
  responses: {
    200: {
      description: "Service is healthy",
      content: {
        "application/json": {
          schema: z.object({
            status: z.string(),
            name: z.string(),
            version: z.string(),
            time: z.string(),
          }),
        },
      },
    },
  },
});

const AuthResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    user: z.object({
      id: z.string(),
      email: z.string().email(),
      role: z.string(),
    }),
  }),
});

registry.registerPath({
  method: "post",
  path: "/auth/register",
  tags: ["Auth"],
  summary: "Register a new customer account",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            email: z.string().email(),
            password: z.string().min(8),
            firstName: z.string().optional(),
            lastName: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: { description: "Account created", content: { "application/json": { schema: AuthResponseSchema } } },
    409: { description: "Email already registered", content: { "application/json": { schema: ErrorSchema } } },
    400: { description: "Validation error", content: { "application/json": { schema: ErrorSchema } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/login",
  tags: ["Auth"],
  summary: "Login with email and password",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({ email: z.string().email(), password: z.string() }),
        },
      },
    },
  },
  responses: {
    200: { description: "Authenticated", content: { "application/json": { schema: AuthResponseSchema } } },
    401: { description: "Invalid credentials", content: { "application/json": { schema: ErrorSchema } } },
  },
});

const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  brand: z.string().optional(),
  basePrice: z.number(),
  currency: z.string(),
  status: z.string(),
  images: z.array(z.object({ url: z.string(), altText: z.string().optional() })).optional(),
});

registry.registerPath({
  method: "get",
  path: "/products",
  tags: ["Products"],
  summary: "List published products with filters and pagination",
  responses: {
    200: {
      description: "Paginated product list",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(true),
            data: z.array(ProductSchema),
            pagination: z.object({ page: z.number(), limit: z.number(), total: z.number(), pages: z.number() }),
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/products/{id}",
  tags: ["Products"],
  summary: "Fetch a single product by id or slug",
  request: {
    params: z.object({ id: z.string().describe("Product id or slug") }),
  },
  responses: {
    200: { description: "Product found", content: { "application/json": { schema: ProductSchema } } },
    404: { description: "Product not found", content: { "application/json": { schema: ErrorSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/cms/homepage",
  tags: ["CMS"],
  summary: "Fetch the storefront homepage sections",
  responses: {
    200: {
      description: "Homepage sections",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(true),
            data: z.object({ hero: z.unknown().optional(), sections: z.array(z.unknown()) }),
          }),
        },
      },
    },
  },
});

export const registryComponents = {
  registry,
  ErrorSchema,
  SuccessSchema,
};
