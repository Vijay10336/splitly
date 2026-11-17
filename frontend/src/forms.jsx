import React, { useState } from "react";
import { X, Plus } from "lucide-react";
import { Form, Avatar } from "./components";
import { minorUnits } from "./ledger";

export function GroupForm({ user, submit }) {
  const [people, setPeople] = useState([
    { id: crypto.randomUUID(), name: user.name, email: user.email },
    { id: crypto.randomUUID(), name: "", email: "" },
  ]);
  const change = (index, key, value) =>
    setPeople((p) =>
      p.map((m, i) => (i === index ? { ...m, [key]: value } : m)),
    );
  return (
    <Form
      label="Create group"
      onSubmit={async (f) => {
        if (people.some((p) => !p.name.trim()))
          throw new Error("Give everyone a name.");
        const emails = people
          .map((p) => p.email.trim().toLowerCase())
          .filter(Boolean);
        if (new Set(emails).size !== emails.length)
          throw new Error("Use a different email for each person.");
        await submit({
          name: f.get("name").trim(),
          currency: f.get("currency"),
          members: people.map((p) => ({
            ...p,
            name: p.name.trim(),
            email: p.email.trim().toLowerCase(),
          })),
          ownerId: user.id,
        });
      }}
    >
      <label>
        Group name
        <input
          name="name"
          placeholder="e.g. Goa weekend"
          maxLength={80}
          required
          autoFocus
        />
      </label>
      <label>
        Currency
        <select name="currency" defaultValue="INR">
          {["INR", "USD", "EUR", "GBP", "AUD", "CAD"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <div className="field-heading">
        <strong>Who’s in?</strong>
        <small>{people.length} people</small>
      </div>
      <p className="field-help">
        Add an email so they can see this group after signing in and verifying
        it.
      </p>
      {people.map((p, i) => (
        <div className="person-fields" key={p.id}>
          <label>
            <span className="sr-only">Person {i + 1} name</span>
            <input
              aria-label={`Person ${i + 1} name`}
              placeholder="Name"
              value={p.name}
              onChange={(e) => change(i, "name", e.target.value)}
              readOnly={i === 0}
              maxLength={80}
              required
            />
          </label>
          <label>
            <span className="sr-only">Person {i + 1} email</span>
            <input
              aria-label={`Person ${i + 1} email`}
              type="email"
              placeholder="Email (optional)"
              value={p.email}
              onChange={(e) => change(i, "email", e.target.value)}
              readOnly={i === 0}
              maxLength={254}
            />
          </label>
          {i > 1 && (
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove ${p.name || "person"}`}
              onClick={() => setPeople(people.filter((_, n) => i !== n))}
            >
              <X size={16} />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="text-button add-person"
        disabled={people.length >= 50}
        onClick={() =>
          setPeople([
            ...people,
            { id: crypto.randomUUID(), name: "", email: "" },
          ])
        }
      >
        <Plus size={16} />
        Add a person
      </button>
    </Form>
  );
}
export function ExpenseForm({ group, user, submit }) {
  return (
    <Form
      label="Save expense"
      onSubmit={(f) => {
        const participants = f.getAll("participants");
        if (!participants.length)
          throw new Error("Select at least one person.");
        return submit({
          title: f.get("title").trim(),
          amount: minorUnits(f.get("amount")),
          payerId: f.get("payerId"),
          participants,
        });
      }}
    >
      <label>
        What was it for?
        <input
          name="title"
          placeholder="Dinner, groceries, train tickets…"
          required
          maxLength={120}
          autoFocus
        />
      </label>
      <label>
        Amount · {group.currency}
        <input
          name="amount"
          inputMode="decimal"
          placeholder="0.00"
          required
          pattern="[0-9]+(\.[0-9]{1,2})?"
        />
      </label>
      <label>
        Paid by
        <select
          name="payerId"
          defaultValue={group.members.find((m) => m.email === user.email)?.id}
        >
          {group.members.map((m) => (
            <option value={m.id} key={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Split equally between</legend>
        {group.members.map((m) => (
          <label className="checkbox-row" key={m.id}>
            <Avatar name={m.name} />
            <span>{m.name}</span>
            <input
              type="checkbox"
              name="participants"
              value={m.id}
              defaultChecked
            />
          </label>
        ))}
      </fieldset>
      <p className="field-help">
        Every paise or cent is included. Any remainder is allocated
        consistently.
      </p>
    </Form>
  );
}
export function SettlementForm({ group, transfer, submit }) {
  const name = (id) => group.members.find((m) => m.id === id)?.name;
  return (
    <Form
      label="Record payment"
      onSubmit={(f) => {
        const amount = minorUnits(f.get("amount"));
        if (amount > transfer.amount)
          throw new Error("Amount exceeds the outstanding balance.");
        return submit({ fromId: transfer.fromId, toId: transfer.toId, amount });
      }}
    >
      <p className="settlement-intro">
        <strong>{name(transfer.fromId)}</strong> pays{" "}
        <strong>{name(transfer.toId)}</strong>
      </p>
      <label>
        Amount · {group.currency}
        <input
          name="amount"
          inputMode="decimal"
          required
          defaultValue={(transfer.amount / 100).toFixed(2)}
        />
      </label>
      <p className="field-help">Record a payment after it has been made.</p>
    </Form>
  );
}
