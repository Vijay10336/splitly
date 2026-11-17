import { Capacitor } from "@capacitor/core";
let token = null;
export function setToken(value) {
  token = value;
}
export function signedIn() {
  return Boolean(token);
}
export const apiBase = import.meta.env.VITE_API_URL || "";
export async function api(path, body) {
  if (Capacitor.isNativePlatform() && !apiBase)
    throw new Error(
      "This build needs a server address. Please ask for an updated app build.",
    );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${apiBase}/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      signal: controller.signal,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(
        data.error || "Something went wrong. Please try again.",
      );
      error.status = response.status;
      if (response.status === 401) token = null;
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === "AbortError")
      throw new Error(
        "Connection timed out. Your saved changes will retry when you sync.",
      );
    if (error instanceof TypeError)
      throw new Error(
        "Could not connect. Changes saved on this device can sync later.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
