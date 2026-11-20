import assert from "node:assert/strict";
import { test } from "node:test";
import { isUuid } from "./uuid.ts";

test("accepts canonical UUIDs", () => {
  assert.equal(isUuid("00000000-0000-4000-8000-000000000001"), true);
  assert.equal(isUuid("3F2504E0-4F89-11D3-9A0C-0305E82C3301"), true);
});

test("rejects slugs, partial and malformed ids", () => {
  for (const v of ["plantillas", "no-es-uuid", "", "00000000-0000-4000-8000-00000000000", "00000000000040008000000000000001", "{00000000-0000-4000-8000-000000000001}", "00000000-0000-4000-8000-000000000001 "]) {
    assert.equal(isUuid(v), false, `rejects ${JSON.stringify(v)}`);
  }
});
