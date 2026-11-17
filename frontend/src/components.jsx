import React, { useRef, useEffect, useState } from "react";
import { X, ArrowRight } from "lucide-react";

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-symbol">s</span>
      <span>
        splitly<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
export function Avatar({ name }) {
  return (
    <span className="avatar" title={name}>
      {name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()}
    </span>
  );
}
export function Modal({ title, close, children }) {
  const dialog = useRef();
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  return (
    <dialog ref={dialog} onCancel={close} className="modal">
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" onClick={close} aria-label="Close">
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Form({ children, onSubmit, label = "Save", icon = true }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          await onSubmit(new FormData(e.currentTarget));
        } catch (e) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button full" disabled={busy}>
        {busy ? "Saving…" : label}
        {icon && <ArrowRight size={17} />}
      </button>
    </form>
  );
}
