import test from "node:test";
import assert from "node:assert/strict";
import { signToken, verifyToken } from "../server/auth.js";

const SECRET = "test-secret-string-16plus";

test("tokens round trip for each role", () => {
  for (const role of ["viewer", "scorer", "admin"]) {
    const token = signToken(role, SECRET, 1);
    assert.deepEqual(verifyToken(token, SECRET), { role });
  }
});

test("a tampered signature is rejected", () => {
  const token = signToken("viewer", SECRET, 1);
  assert.equal(verifyToken(`${token}x`, SECRET), null);
});

test("a wrong secret is rejected", () => {
  const token = signToken("admin", SECRET, 1);
  assert.equal(verifyToken(token, "different-secret-9999"), null);
});

test("an expired token is rejected", () => {
  const token = signToken("scorer", SECRET, -1);
  assert.equal(verifyToken(token, SECRET), null);
});

test("a malformed token is rejected", () => {
  assert.equal(verifyToken("not-a-token", SECRET), null);
  assert.equal(verifyToken("", SECRET), null);
});
