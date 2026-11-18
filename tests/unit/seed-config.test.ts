import test from "node:test";
import assert from "node:assert/strict";
import { seedConfiguration } from "../../scripts/database/seed-config";

test("seed de produção exige autorização explícita e senha definida pelo operador", () => {
  assert.throws(
    () => seedConfiguration({ NODE_ENV: "production", SEED_PASSWORD: "TestingPassword!" }),
    /ALLOW_SEED_IN_PRODUCTION/,
  );
  assert.throws(
    () => seedConfiguration({ NODE_ENV: "production", ALLOW_SEED_IN_PRODUCTION: "true" }),
    /SEED_PASSWORD/,
  );
  assert.throws(
    () => seedConfiguration({ NODE_ENV: "development", SEED_PASSWORD: "123" }),
    /SEED_PASSWORD/,
  );
  assert.deepEqual(
    seedConfiguration({
      NODE_ENV: "production",
      ALLOW_SEED_IN_PRODUCTION: "true",
      SEED_PASSWORD: "TestingPassword!",
    }),
    { password: "TestingPassword!" },
  );
});
