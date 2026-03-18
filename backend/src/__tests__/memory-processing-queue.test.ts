import test from "node:test";
import assert from "node:assert/strict";
import { buildMemoryRefreshJobId } from "../services/memory-processing-utils";

test("buildMemoryRefreshJobId avoids reserved BullMQ separators", () => {
  const conversationId = "25b82613-b49f-449c-87ec-be825ffe88e6";
  const jobId = buildMemoryRefreshJobId(conversationId);

  assert.equal(jobId, `refresh-${conversationId}`);
  assert.equal(jobId.includes(":"), false);
});
