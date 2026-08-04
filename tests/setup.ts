import "dotenv/config";

process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-with-32-characters-minimum";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-with-32-characters-minimum";
process.env.PASSWORD_PEPPER ??= "test-pepper";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/atelier_test";
process.env.REDIS_URL ??= "redis://localhost:6379";
