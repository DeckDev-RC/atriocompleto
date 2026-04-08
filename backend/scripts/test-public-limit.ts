const API_URL = "http://localhost:3001/api";

async function performRequest(endpoint: string, method: "GET" | "POST") {
  const url = `${API_URL}${endpoint}`;
  const init: RequestInit =
    method === "POST"
      ? {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "test@example.com" }),
        }
      : { method };

  const response = await fetch(url, init);
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
}

async function testRateLimit(endpoint: string, limit: number, method: "GET" | "POST" = "GET") {
  console.log(`\n--- Testing ${endpoint} (${method}, limit: ${limit}) ---`);
  let successes = 0;
  let blocked = 0;

  for (let index = 1; index <= limit + 5; index++) {
    try {
      await performRequest(endpoint, method);
      successes++;
      process.stdout.write(".");
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      if (status === 429) {
        blocked++;
        process.stdout.write("X");
      } else {
        console.error(`\n[${index}] Error: ${error instanceof Error ? error.message : "unknown"}`);
      }
    }
  }

  console.log(`\nResults for ${endpoint}:`);
  console.log(`- Successes: ${successes}`);
  console.log(`- Blocked (429): ${blocked}`);
  console.log(successes === limit && blocked > 0 ? "OK Rate limit enforced correctly." : "FAIL Rate limit enforcement inconsistent.");
}

async function runTests() {
  try {
    await testRateLimit("/health", 20, "GET");
    await testRateLimit("/auth/forgot-password", 20, "POST");
  } catch (error) {
    console.error("Test suite failed:", error);
  }
}

void runTests();
