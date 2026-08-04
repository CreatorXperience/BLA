import { describe, it, expect, beforeAll } from "vitest";
import { buildApp, type App } from "@/app";

let app: App;

beforeAll(() => {
  app = buildApp();
});

interface HealthBody {
  status: string;
  name: string;
  version: string;
}

interface OpenApiBody {
  openapi: string;
  paths: Record<string, unknown>;
}

interface ErrorBody {
  success: boolean;
  message: string;
  error: { code: string };
}

describe("GET /health", () => {
  it("returns 200 with service metadata", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthBody;
    expect(body.status).toBe("ok");
    expect(body.name).toBeDefined();
    expect(body.version).toBe("1.0.0");
  });
});

describe("GET /api/v1/openapi.json", () => {
  it("returns a valid OpenAPI document", async () => {
    const res = await app.request("/api/v1/openapi.json");
    expect(res.status).toBe(200);
    const body = (await res.json()) as OpenApiBody;
    expect(body.openapi).toBe("3.1.0");
    expect(body.paths).toBeDefined();
    expect(Object.keys(body.paths).length).toBeGreaterThan(0);
  });
});

describe("GET /docs", () => {
  it("serves the Swagger UI", async () => {
    const res = await app.request("/docs");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});

describe("unknown routes", () => {
  it("returns a structured 404", async () => {
    const res = await app.request("/api/v1/does-not-exist");
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
