import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { Preferences } from "@capacitor/preferences";
import { apiBase, api } from "./api";
const encode = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
export async function startGoogle() {
  const config = await api("/auth/google/config");
  if (!config.enabled)
    throw new Error(
      "Google sign-in is not available yet. Please use email to continue.",
    );
  const verifier = encode(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = encode(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
  );
  await Preferences.set({ key: "splitly.oauth", value: verifier });
  const native = Capacitor.isNativePlatform();
  const url = `${apiBase || location.origin}/api/auth/google/start?challenge=${challenge}&platform=${native ? "native" : "web"}`;
  if (native) await Browser.open({ url });
  else location.assign(url);
}
export async function finishGoogle(url) {
  const params = new URL(url).searchParams;
  if (params.has("authError")) throw new Error(params.get("authError"));
  const code = params.get("code");
  if (!code) return null;
  const { value: verifier } = await Preferences.get({ key: "splitly.oauth" });
  if (!verifier) throw new Error("Start Google sign-in on this device again.");
  const result = await api("/auth/google/exchange", { code, verifier });
  await Preferences.remove({ key: "splitly.oauth" });
  if (Capacitor.isNativePlatform()) await Browser.close().catch(() => {});
  return result;
}
