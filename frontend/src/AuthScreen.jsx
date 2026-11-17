import React, { useState } from "react";
import { Check, Cloud } from "lucide-react";
import { Brand, Form } from "./components";
import { api } from "./api";
import { startGoogle } from "./google";

export function AuthScreen({ link, user, onLogin, onClose, onMessage }) {
  const [mode, setMode] = useState(
    link.reset ? "reset" : link.verify ? "verify" : "login",
  );
  const [message, setMessage] = useState("");
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const titles = {
    login: "A little less owing.",
    signup: "Good company starts here.",
    forgot: "Let’s get you back in.",
    reset: "A fresh start.",
    verify: "Make it official.",
  };
  async function submit(f) {
    if (mode === "login" || mode === "signup") {
      const result = await api(`/auth/${mode}`, {
        name: f.get("name"),
        email: f.get("email"),
        password: f.get("password"),
      });
      await onLogin(result);
      if (mode === "signup")
        onMessage("Account created. Check your inbox to verify your email.");
    } else if (mode === "forgot")
      setMessage(
        (await api("/auth/forgot", { email: f.get("email") })).message,
      );
    else if (mode === "reset") {
      const result = await api("/auth/reset", {
        token: link.reset,
        password: f.get("password"),
      });
      setMessage(result.message);
      setMode("login");
      history.replaceState({}, "", location.pathname);
    } else {
      const result = await api("/auth/verify", { token: link.verify });
      setMessage(result.message);
      setMode("login");
      history.replaceState({}, "", location.pathname);
    }
  }
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Brand />
        <div className="story-copy">
          <p className="eyebrow">FOR THE THINGS YOU SHARE</p>
          <h1>
            More memories.
            <br />
            Less maths.
          </h1>
          <p>
            The weekend away. The everyday shop.
            <br />
            Keep the good stuff. Split the rest.
          </p>
          <div className="story-receipt">
            <span>THE GOA WEEKEND</span>
            <div>
              <span>Dinner with everyone</span>
              <strong>₹2,400.00</strong>
            </div>
            <div>
              <span>Shared between 4 friends</span>
              <strong>₹600 each</strong>
            </div>
            <hr />
            <p>
              <Check size={18} />A fair share. A clear head.
            </p>
          </div>
        </div>
        <small>Simple expenses. Better together.</small>
      </aside>
      <main className="auth-main">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        {onClose && (
          <button className="text-button auth-back" onClick={onClose}>
            ← Back to saved expenses
          </button>
        )}
        <div className="auth-card">
          <p className="eyebrow">
            {mode === "signup" ? "JOIN THE CIRCLE" : "WELCOME TO SPLITLY"}
          </p>
          <h1>{titles[mode]}</h1>
          <p>
            {mode === "login"
              ? "Sign in to bring your expenses together."
              : mode === "signup"
                ? "Create an account and make room for your people."
                : mode === "verify"
                  ? "Confirm your email to access shared groups and backups."
                  : "We’ll help you securely access your account."}
          </p>
          {message && (
            <p className="success-message" role="status">
              {message}
            </p>
          )}
          {(mode === "login" || mode === "signup") && (
            <>
              <button
                className="button google-button full"
                disabled={googleBusy}
                onClick={async () => {
                  setGoogleBusy(true);
                  setGoogleError("");
                  try {
                    await startGoogle();
                  } catch (e) {
                    setGoogleError(e.message);
                  } finally {
                    setGoogleBusy(false);
                  }
                }}
              >
                <span className="google-g">G</span>
                {googleBusy ? "Opening Google…" : "Continue with Google"}
              </button>
              {googleError && (
                <p className="form-error" role="alert">
                  {googleError}
                </p>
              )}
              <div className="divider">
                <span>or with email</span>
              </div>
            </>
          )}
          <Form
            key={mode}
            label={
              mode === "login"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : mode === "forgot"
                    ? "Send reset link"
                    : mode === "verify"
                      ? "Verify my email"
                      : "Save new password"
            }
            onSubmit={submit}
          >
            {mode === "signup" && (
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={80}
                  placeholder="Vijay Kaushik"
                />
              </label>
            )}
            {["login", "signup", "forgot"].includes(mode) && (
              <label>
                Email address
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  placeholder="you@example.com"
                  defaultValue={user?.email}
                />
              </label>
            )}
            {["login", "signup", "reset"].includes(mode) && (
              <label>
                Password
                <input
                  type="password"
                  name="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  required
                  minLength={mode === "login" ? 1 : 10}
                  maxLength={72}
                  placeholder={
                    mode === "login"
                      ? "Your password"
                      : "At least 10 characters"
                  }
                />
              </label>
            )}
            {mode === "login" && (
              <button
                className="text-button forgot"
                type="button"
                onClick={() => {
                  setMode("forgot");
                  setMessage("");
                }}
              >
                Forgot password?
              </button>
            )}
          </Form>
          <p className="auth-switch">
            {mode === "login"
              ? "New around here? "
              : mode === "signup"
                ? "Already have an account? "
                : ""}
            <button
              className="text-button"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setMessage("");
              }}
            >
              {mode === "login"
                ? "Create an account"
                : mode === "signup"
                  ? "Sign in"
                  : "Back to sign in"}
            </button>
          </p>
          <div className="auth-footnote">
            <Cloud size={15} />
            On your device. Synced to your account.
          </div>
        </div>
      </main>
    </div>
  );
}
