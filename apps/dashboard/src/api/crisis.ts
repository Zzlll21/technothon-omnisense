export type CrisisCommandRequest = {
  node_id: string;
  enabled: boolean;
  target_pmv_limit?: number;
  reason?: string;
};

export type CrisisCommandResponse =
  | {
      ok: true;
      duplicate: false;
      published: true;
      topic: string;
      payload: {
        command: "SET_CRISIS_MODE";
        enabled: boolean;
        target_pmv_limit: number;
        reason: string;
      };
    }
  | {
      ok: true;
      duplicate: true;
      published: false;
      message: string;
    }
  | {
      ok: false;
      error: string;
    };

export async function sendCrisisCommand(
  request: CrisisCommandRequest
): Promise<CrisisCommandResponse> {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

  if (!apiBaseUrl) {
    return {
      ok: false,
      error: "VITE_API_BASE_URL is not configured."
    };
  }

  try {
    const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/crisis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request)
    });

    const data = (await parseJsonResponse(response)) as CrisisCommandResponse;

    if (!response.ok && data.ok) {
      return {
        ok: false,
        error: `Control API returned HTTP ${response.status}.`
      };
    }

    return data;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to call control API."
    };
  }
}

async function parseJsonResponse(response: Response) {
  try {
    return await response.json();
  } catch {
    return {
      ok: false,
      error: `Control API returned HTTP ${response.status}.`
    };
  }
}
