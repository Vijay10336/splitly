import { ThemeProvider, StyledEngineProvider } from "@mui/material/styles";
import { theme } from "./theme";
import "@fontsource-variable/inter";
import { ActionButton } from "./ActionButton";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { App as NativeApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Cloud,
  Download,
  Home,
  LogOut,
  Mail,
  Plus,
  RefreshCw,
  Settings,
  Users,
  Wallet,
  X,
  WifiOff,
} from "lucide-react";
import { api, setToken, signedIn } from "./api";
import * as storage from "./storage";
import { applyCommand, money, visibleGroups } from "./ledger";
import { finishGoogle } from "./google";
import { Brand, Avatar, Modal } from "./components";
import { AuthScreen } from "./AuthScreen";
import { GroupScreen } from "./GroupScreen";
import { GroupForm, ExpenseForm, SettlementForm } from "./forms";
import "./style.css";
import "./design.css";

function App() {
  const [bundle, setBundle] = useState(null);
  const current = useRef(null);
  const writes = useRef(Promise.resolve());
  const syncing = useRef(false);
  const [ready, setReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [tab, setTab] = useState("home");
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [syncBusy, setSyncBusy] = useState(false);
  const [link, setLink] = useState(() =>
    Object.fromEntries(new URL(location.href).searchParams),
  );

  function update(change) {
    const operation = writes.current.then(async () => {
      const next = change(current.current);
      await storage.save(next);
      current.current = next;
      setBundle(next);
      return next;
    });
    writes.current = operation.catch(() => {});
    return operation;
  }
  async function acceptLogin(result) {
    if (
      current.current &&
      current.current.user.id !== result.user.id &&
      current.current.pending.length
    )
      throw new Error(
        "Sync or discard the saved changes in the current account before switching accounts.",
      );
    setToken(result.token);
    const cached = await storage.forUser(result.user);
    await update(() => cached);
    setAuthOpen(false);
    setLink({});
    setSelected(null);
    history.replaceState({}, "", location.pathname);
    await sync();
  }
  async function sync() {
    if (syncing.current || !current.current) return;
    if (!signedIn()) {
      setAuthOpen(true);
      return;
    }
    syncing.current = true;
    setSyncBusy(true);
    setError("");
    try {
      await writes.current;
      while (current.current.pending.length) {
        const command = current.current.pending[0];
        await api("/commands", command);
        await update((previous) => ({
          ...previous,
          base: {
            ...previous.base,
            groups: applyCommand(previous.base.groups, command),
          },
          pending: previous.pending.filter((c) => c.id !== command.id),
        }));
      }
      const state = await api("/state");
      await update((previous) => ({
        ...previous,
        user: state.user,
        base: state,
      }));
    } catch (e) {
      setError(e.message);
    } finally {
      syncing.current = false;
      setSyncBusy(false);
    }
  }
  async function enqueue(type, groupId, payload) {
    const command = {
      id: crypto.randomUUID(),
      type,
      groupId,
      payload,
      createdAt: Date.now(),
    };
    await update((previous) => ({
      ...previous,
      pending: [...previous.pending, command],
    }));
    setModal(null);
    if (type === "createGroup") setSelected(groupId);
    setNotice(
      navigator.onLine && signedIn()
        ? "Saved. Syncing your changes…"
        : "Saved on this device. Sign in and sync when connected.",
    );
    if (navigator.onLine && signedIn()) await sync();
  }
  useEffect(() => {
    let disposed = false;
    let listener;
    async function boot() {
      try {
        const saved = await storage.load();
        if (disposed) return;
        current.current = saved;
        setBundle(saved);
        if (new URL(location.href).searchParams.has("code"))
          await acceptLogin(await finishGoogle(location.href));
        if (new URL(location.href).searchParams.has("authError"))
          await finishGoogle(location.href);
        if (Capacitor.isNativePlatform()) {
          const handle = async ({ url }) => {
            if (!url.startsWith("dev.vijay.splitly://auth")) return;
            try {
              const result = await finishGoogle(url);
              if (result) await acceptLogin(result);
            } catch (e) {
              setError(e.message);
            }
          };
          listener = await NativeApp.addListener("appUrlOpen", handle);
          const launch = await NativeApp.getLaunchUrl();
          if (launch) await handle(launch);
        }
      } catch (e) {
        setError(e.message);
      } finally {
        if (!disposed) setReady(true);
      }
    }
    boot();
    const onOnline = () => {
      setOnline(true);
      if (signedIn()) sync();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      disposed = true;
      listener?.remove();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function run(action) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    await writes.current;
    if (syncing.current) throw new Error("Wait for sync to finish.");
    if (
      current.current.pending.length &&
      !confirm(
        "There are changes saved only on this device. Signing out will delete them. Continue?",
      )
    )
      return;
    if (signedIn()) await api("/auth/logout", {});
    await writes.current;
    await storage.forget(current.current);
    setToken(null);
    current.current = null;
    setBundle(null);
    setSelected(null);
    setTab("home");
  }
  async function emailBackup() {
    if (!signedIn()) {
      setAuthOpen(true);
      return;
    }
    await sync();
    if (current.current.pending.length)
      throw new Error("Sync your saved changes before emailing a backup.");
    const result = await api("/backup/email", {});
    setNotice(result.message);
  }
  async function download() {
    const data = {
      version: 1,
      user: bundle.user,
      groups: visibleGroups(bundle),
      savedAt: Date.now(),
      pending: bundle.pending,
    };
    if (Capacitor.isNativePlatform()) {
      const file = await Filesystem.writeFile({
        path: "splitly-backup.json",
        data: JSON.stringify(data, null, 2),
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({ title: "Splitly backup", files: [file.uri] });
      return;
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "splitly-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  const groups = bundle ? visibleGroups(bundle) : [];
  const group = groups.find((g) => g.id === selected);
  const user = bundle?.user;
  const pending = bundle?.pending.length || 0;
  const totals = {};
  for (const g of groups) {
    const balance = g.members.find((m) => m.email === user.email)?.balance || 0;
    totals[g.currency] ||= { owed: 0, owe: 0 };
    if (balance > 0) totals[g.currency].owed += balance;
    else totals[g.currency].owe -= balance;
  }
  if (!ready)
    return (
      <div className="loading">
        <Brand />
        <p>Opening your expenses…</p>
      </div>
    );
  const showAuth = !bundle || authOpen || link.reset || link.verify;
  if (showAuth)
    return (
      <>
        <AuthScreen
          link={link}
          user={user}
          onLogin={acceptLogin}
          onClose={
            bundle
              ? () => {
                  setAuthOpen(false);
                  setLink({});
                  history.replaceState({}, "", location.pathname);
                }
              : null
          }
          onMessage={setNotice}
        />
        {error && (
          <div className="toast error" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss">
              <X size={18} />
            </button>
          </div>
        )}
        {notice && (
          <div className="toast" role="status">
            {notice}
          </div>
        )}
      </>
    );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <span className="workspace-label">YOUR SPACE</span>
        <nav>
          {[
            ["home", Home, "Overview"],
            ["groups", Users, "Your groups"],
            ["settings", Settings, "Storage & account"],
          ].map(([id, Icon, label]) => (
            <button
              className={tab === id ? "active" : ""}
              key={id}
              onClick={() => {
                setTab(id);
                setSelected(null);
              }}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="small-mark">↗</span>
          <p>
            Good times.
            <br />
            Clear balances.
          </p>
          <small>
            Less keeping score.
            <br />
            More making plans.
          </small>
        </div>
        <button
          className="profile"
          onClick={() => {
            setTab("settings");
            setSelected(null);
          }}
        >
          <Avatar name={user.name} />
          <span>
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </span>
          <ChevronRight size={16} />
        </button>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <span className="mobile-brand">
            <Brand />
          </span>
          <span className="desktop-breadcrumb">
            Your space <span>/</span>{" "}
            {group?.name ||
              (tab === "settings"
                ? "Storage & account"
                : tab === "groups"
                  ? "Your groups"
                  : "Overview")}
          </span>
          <button
            className={`sync-status ${!online ? "offline" : ""}`}
            onClick={() => (signedIn() ? sync() : setAuthOpen(true))}
            disabled={syncBusy}
          >
            {!online ? (
              <WifiOff size={15} />
            ) : syncBusy ? (
              <RefreshCw size={15} className="spin" />
            ) : (
              <Cloud size={15} />
            )}
            <span>
              {!online
                ? "Offline"
                : syncBusy
                  ? "Syncing"
                  : !signedIn()
                    ? "Sign in to sync"
                    : pending
                      ? `${pending} to sync`
                      : "Sync now"}
            </span>
          </button>
        </header>
        <main>
          {group ? (
            <GroupScreen
              group={group}
              user={user}
              back={() => setSelected(null)}
              add={() => setModal("expense")}
              settle={(transfer) => setModal({ type: "settle", ...transfer })}
            />
          ) : tab === "settings" ? (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">MAKE YOURSELF AT HOME</p>
                  <h1>Storage & account</h1>
                  <p>Your expenses, wherever you need them.</p>
                </div>
              </div>
              <section className="settings-grid">
                <article className="panel">
                  <div className="panel-icon">
                    <Wallet />
                  </div>
                  <h2>Saved on your phone</h2>
                  <p>
                    A copy of your expenses stays on this device. Add expenses
                    offline and sync them later.
                  </p>
                  <div className="detail-row">
                    <span>Changes waiting to sync</span>
                    <strong>{pending}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Last synced</span>
                    <strong>
                      {bundle.base.savedAt
                        ? new Date(bundle.base.savedAt).toLocaleString()
                        : "Not yet"}
                    </strong>
                  </div>
                  <ActionButton
                    className="button secondary"
                    onClick={() => run(download)}
                  >
                    <Download size={17} />
                    Download JSON backup
                  </ActionButton>
                  {pending > 0 && (
                    <button
                      className="text-button danger"
                      disabled={busy || syncBusy}
                      onClick={() =>
                        run(async () => {
                          if (
                            confirm(
                              "Discard all unsynced changes from this device?",
                            )
                          )
                            await update((p) => ({ ...p, pending: [] }));
                        })
                      }
                    >
                      Discard unsynced changes
                    </button>
                  )}
                </article>
                <article className="panel">
                  <div className="panel-icon">
                    <Mail />
                  </div>
                  <h2>A copy in your inbox</h2>
                  <p>
                    Send a JSON backup of your synced groups and expenses to{" "}
                    {user.email}.
                  </p>
                  <ActionButton
                    className="button secondary"
                    disabled={busy || syncBusy}
                    onClick={() => run(emailBackup)}
                  >
                    <Mail size={17} />
                    Email my backup
                  </ActionButton>
                  <small>Backups are sent when you request them.</small>
                </article>
                <article className="panel">
                  <div className="panel-icon">
                    <Cloud />
                  </div>
                  <h2>Connected to your account</h2>
                  <p>{user.email}</p>
                  <span className={`pill ${user.verified ? "" : "peach"}`}>
                    {user.verified ? "Email verified" : "Verification needed"}
                  </span>
                  {!user.verified && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          if (!signedIn()) {
                            setAuthOpen(true);
                            return;
                          }
                          setNotice(
                            (await api("/auth/resend-verification", {}))
                              .message,
                          );
                        })
                      }
                    >
                      Resend verification email
                    </button>
                  )}
                  <ActionButton
                    className="button secondary"
                    disabled={syncBusy}
                    onClick={() => (signedIn() ? sync() : setAuthOpen(true))}
                  >
                    <RefreshCw size={17} />
                    {signedIn() ? "Sync now" : "Sign in to sync"}
                  </ActionButton>
                  <button
                    className="text-button danger"
                    disabled={busy || syncBusy}
                    onClick={() => run(logout)}
                  >
                    <LogOut size={16} />
                    Sign out & clear device copy
                  </button>
                </article>
              </section>
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">SHARED EXPENSES</p>
                  <h1>
                    {tab === "groups"
                      ? "Your groups"
                      : `Hey, ${user.name.split(" ")[0]}.`}
                  </h1>
                  <p>
                    {tab === "groups"
                      ? "Trips, flatmates, and everything in between."
                      : "Track shared expenses and see who owes what."}
                  </p>
                </div>
                <ActionButton
                  className="button"
                  onClick={() => setModal("group")}
                >
                  <Plus size={18} />
                  New group
                </ActionButton>
              </div>
              {tab === "home" && (
                <section className="summary-grid">
                  <article className="summary-card green">
                    <span>
                      <ArrowDownLeft size={18} />
                      You’re owed
                    </span>
                    <div className="total-stack">
                      {Object.keys(totals).length ? (
                        Object.entries(totals).map(([currency, total]) => (
                          <strong key={currency}>
                            {money(total.owed, currency)}
                          </strong>
                        ))
                      ) : (
                        <strong>{money(0)}</strong>
                      )}
                    </div>
                    <small>Outstanding balances from your groups</small>
                  </article>
                  <article className="summary-card peach">
                    <span>
                      <ArrowUpRight size={18} />
                      You owe
                    </span>
                    <div className="total-stack">
                      {Object.keys(totals).length ? (
                        Object.entries(totals).map(([currency, total]) => (
                          <strong key={currency}>
                            {money(total.owe, currency)}
                          </strong>
                        ))
                      ) : (
                        <strong>{money(0)}</strong>
                      )}
                    </div>
                    <small>A little settling up goes a long way</small>
                  </article>
                  <article className="summary-card neutral">
                    <span>
                      <Users size={18} />
                      Your circles
                    </span>
                    <strong>
                      {groups.length}
                      <em>{groups.length === 1 ? "group" : "groups"}</em>
                    </strong>
                    <small>Shared moments, all in one place</small>
                  </article>
                </section>
              )}
              <div className="section-heading">
                <h2>
                  Your groups <span>{groups.length}</span>
                </h2>
                <button
                  className="text-button"
                  onClick={() => setModal("group")}
                >
                  Create a group <Plus size={16} />
                </button>
              </div>
              {groups.length === 0 ? (
                <section className="empty-state">
                  <div className="empty-circles">
                    <Avatar name={user.name} />
                    <span>+</span>
                    <Avatar name="Friends" />
                  </div>
                  <h2>Everything starts with a group.</h2>
                  <p>
                    Add your people, then your first shared expense.
                    <br />
                    We’ll take care of the splitting.
                  </p>
                  <ActionButton
                    className="button"
                    onClick={() => setModal("group")}
                  >
                    <Plus size={18} />
                    Create your first group
                  </ActionButton>
                </section>
              ) : (
                <div className="group-grid">
                  {groups.map((g, index) => {
                    const me = g.members.find((m) => m.email === user.email);
                    return (
                      <button
                        className="group-card"
                        key={g.id}
                        onClick={() => setSelected(g.id)}
                      >
                        <div className={`group-art art-${index % 3}`}>
                          <span>{g.name.slice(0, 1).toUpperCase()}</span>
                          <div className="art-circle" />
                          <div className="art-stripe" />
                        </div>
                        <div className="group-card-body">
                          <div className="group-title">
                            <h3>{g.name}</h3>
                            <ArrowUpRight size={19} />
                          </div>
                          <p>
                            {g.members.length} people · {g.expenses.length}{" "}
                            expenses
                          </p>
                          <div className="group-bottom">
                            <div className="avatar-stack">
                              {g.members.slice(0, 4).map((m) => (
                                <Avatar name={m.name} key={m.id} />
                              ))}
                            </div>
                            <span
                              className={
                                me?.balance < 0 ? "negative" : "positive"
                              }
                            >
                              {me?.balance > 0
                                ? `You’re owed ${money(me.balance, g.currency)}`
                                : me?.balance < 0
                                  ? `You owe ${money(-me.balance, g.currency)}`
                                  : "All settled up"}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="quiet-footer">
                <Check size={15} />
                Saved on this device. Ready for your next plan.
              </div>
            </>
          )}
        </main>
        <nav className="mobile-nav">
          {[
            ["home", Home, "Home"],
            ["groups", Users, "Groups"],
            ["settings", Settings, "Account"],
          ].map(([id, Icon, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setSelected(null);
              }}
            >
              <Icon size={21} />
              {label}
            </button>
          ))}
        </nav>
      </div>
      {(error || notice) && (
        <div
          className={`toast ${error ? "error" : ""}`}
          role={error ? "alert" : "status"}
        >
          {error || notice}
          <button
            aria-label="Dismiss"
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal === "group"
              ? "A new circle"
              : modal === "expense"
                ? "Add an expense"
                : "Record a payment"
          }
          close={() => setModal(null)}
        >
          {modal === "group" ? (
            <GroupForm
              user={user}
              submit={(p) => enqueue("createGroup", crypto.randomUUID(), p)}
            />
          ) : modal === "expense" ? (
            <ExpenseForm
              group={group}
              user={user}
              submit={(p) => enqueue("addExpense", group.id, p)}
            />
          ) : (
            <SettlementForm
              group={group}
              transfer={modal}
              submit={(p) => enqueue("settle", group.id, p)}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(
  <StyledEngineProvider injectFirst>
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>
  </StyledEngineProvider>,
);
