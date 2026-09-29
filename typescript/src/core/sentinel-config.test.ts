import { afterEach, describe, expect, it, vi } from "vitest";
import { Sentinel } from "./sentinel.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Sentinel API base URL", () => {
  it("permite staging/local y elimina la diagonal final", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const sentinel = new Sentinel({
      apiKey: "test-key",
      baseUrl: "http://localhost:8000/api/v1/",
    });
    await sentinel.initialize();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/hot-terms?pack=full",
      expect.objectContaining({ headers: { "X-API-Key": "test-key" } }),
    );
  });

  it("rechaza protocolos que no sean HTTP(S)", () => {
    expect(
      () => new Sentinel({ apiKey: "test-key", baseUrl: "file:///tmp/sentinel" }),
    ).toThrow("Sentinel baseUrl must use http or https");
  });
});
