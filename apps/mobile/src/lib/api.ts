import { ENV } from "./env";

export interface ApiError {
  message: string;
  code?: string;
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${ENV.API_BASE_URL}/api${endpoint}`;
  
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      message: "Network error",
    }));
    throw error;
  }

  return response.json();
}

export async function getPlayUrl(videoId: string): Promise<{
  embedUrl: string;
  minutes: number;
  watermark: string;
}> {
  return apiRequest(`/play`, {
    method: "POST",
    body: JSON.stringify({ videoId }),
  });
}

export async function registerSession(): Promise<{
  sessionId: string;
  expiresAt: string;
}> {
  return apiRequest(`/session-register`, {
    method: "POST",
  });
}

export async function getDriveMinutes(fileId: string): Promise<number> {
  return apiRequest(`/drive-minutes`, {
    method: "POST",
    body: JSON.stringify({ fileId }),
  });
}