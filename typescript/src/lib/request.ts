import { ApiResponse } from "../types/SentinelAnalysisResult.js";
import { SentinelError } from "../errors/SentinelError.js";

async function throwApiError(res: Response): Promise<never> {
  // Try to read the server's error body for a better message
  let serverMessage: string | undefined;
  try {
    const body = await res.json();
    serverMessage = body?.details || body?.message || body?.error;
  } catch {
    // body wasn't JSON, ignore
  }

  const fallback = res.statusText || `HTTP ${res.status}`;
  throw new SentinelError(
    serverMessage || fallback,
    "API_ERROR",
    res.status,
    serverMessage,
  );
}

class Request {
  async get<T>(url: string): Promise<T> {
    const res = await fetch(url);

    if (!res.ok) await throwApiError(res);

    const data: ApiResponse<T> = await res.json();

    if (!data.success) {
      throw new SentinelError(
        data.details || "API request failed",
        "API_ERROR",
        data.status_code,
        data.details,
      );
    }

    return data.data;
  }

  async post<T>(url: string, body: any): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) await throwApiError(res);

    const data: ApiResponse<T> = await res.json();

    if (!data.success) {
      throw new SentinelError(
        data.details || "API request failed",
        "API_ERROR",
        data.status_code,
        data.details,
      );
    }

    return data.data;
  }
}

const request = new Request();

export default request;
