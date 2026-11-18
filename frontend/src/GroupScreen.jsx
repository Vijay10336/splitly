import { ActionButton } from "./ActionButton";
import React from "react";
import { Plus, Wallet, Check, ArrowRight } from "lucide-react";
import { Avatar } from "./components";
import { money, suggestions } from "./ledger";

export function GroupScreen({ group, user, back, add, settle }) {
  const name = (id) =>
    group.members.find((m) => m.id === id)?.name || "Unknown";
  const transfers = suggestions(group);
  const events = [
    ...group.expenses.map((e) => ({ ...e, type: "expense" })),
    ...group.settlements.map((e) => ({ ...e, type: "settlement" })),
  ].sort((a, b) => b.createdAt - a.createdAt);
  return (
    <>
      <button className="text-button back" onClick={back}>
        ← All groups
      </button>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SHARED WITH {group.members.length} PEOPLE</p>
          <h1>{group.name}</h1>
          <p>
            {group.currency} · {group.expenses.length} expenses together
          </p>
        </div>
        <ActionButton className="button" onClick={add}>
          <Plus size={18} />
          Add expense
        </ActionButton>
      </div>
      <div className="group-detail">
        <div>
          <section className="panel activity">
            <div className="section-heading">
              <h2>Activity</h2>
              <span className="pill">{events.length} records</span>
            </div>
            {events.length === 0 ? (
              <div className="mini-empty">
                <Wallet size={32} />
                <h3>Your next shared moment goes here.</h3>
                <p>Add your first expense to get started.</p>
              </div>
            ) : (
              events.map((e) => (
                <div className="activity-row" key={e.id}>
                  <span
                    className={`activity-icon ${e.type === "settlement" ? "settled" : ""}`}
                  >
                    {e.type === "settlement" ? (
                      <Check size={20} />
                    ) : (
                      <Wallet size={20} />
                    )}
                  </span>
                  <div>
                    <strong>
                      {e.type === "expense" ? e.title : "Payment recorded"}
                    </strong>
                    <small>
                      {e.type === "expense"
                        ? `${name(e.payerId)} paid · split ${e.shares.length} ways`
                        : `${name(e.fromId)} paid ${name(e.toId)}`}
                      <span>
                        {" "}
                        ·{" "}
                        {new Date(e.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </small>
                  </div>
                  <strong className="activity-amount">
                    {money(e.amount, group.currency)}
                  </strong>
                </div>
              ))
            )}
          </section>
          <section className="panel">
            <h2>Settle up</h2>
            {transfers.length === 0 ? (
              <p className="positive">Everyone’s square. Nice feeling.</p>
            ) : (
              transfers.map((t) => (
                <div className="transfer" key={t.fromId + t.toId}>
                  <p>
                    <strong>{name(t.fromId)}</strong>
                    <ArrowRight size={15} />
                    <strong>{name(t.toId)}</strong>
                  </p>
                  <div>
                    <span>{money(t.amount, group.currency)}</span>
                    <ActionButton
                      className="button small secondary"
                      onClick={() => settle(t)}
                    >
                      Record payment
                    </ActionButton>
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
        <aside className="panel balances">
          <h2>Group balances</h2>
          {group.members.map((m) => (
            <div className="balance-row" key={m.id}>
              <Avatar name={m.name} />
              <div>
                <strong>
                  {m.name}
                  {m.email === user.email ? " (you)" : ""}
                </strong>
                <small>
                  {m.balance > 0
                    ? "Gets back"
                    : m.balance < 0
                      ? "Owes"
                      : "Settled up"}
                </small>
              </div>
              <strong className={m.balance < 0 ? "negative" : "positive"}>
                {money(Math.abs(m.balance), group.currency)}
              </strong>
            </div>
          ))}
        </aside>
      </div>
    </>
  );
}
