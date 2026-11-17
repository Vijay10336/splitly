import test from "node:test";
import assert from "node:assert/strict";
import {
  minorUnits,
  applyCommand,
  visibleGroups,
  suggestions,
} from "./ledger.js";

test("parses money without floating-point rounding or silent truncation", () => {
  assert.equal(minorUnits("0.29"), 29);
  assert.equal(minorUnits("12.3"), 1230);
  for (const value of ["0", "-1", "1.001", "1e3", "Infinity", "1000000.01"])
    assert.throws(() => minorUnits(value));
});
test("offline preview preserves every cent and settlement clears balances", () => {
  const group = {
    id: "g",
    members: [{ id: "a" }, { id: "b" }, { id: "c" }],
    expenses: [],
    settlements: [],
  };
  const expense = {
    id: "e",
    groupId: "g",
    type: "addExpense",
    createdAt: 1,
    payload: {
      title: "Dinner",
      amount: 100,
      payerId: "a",
      participants: ["c", "b", "a"],
    },
  };
  const bundle = { base: { groups: [group] }, pending: [expense] };
  let preview = visibleGroups(bundle)[0];
  assert.deepEqual(
    preview.members.map((m) => m.balance),
    [66, -33, -33],
  );
  assert.equal(
    preview.expenses[0].shares.reduce((s, p) => s + p.amount, 0),
    100,
  );
  const payments = suggestions(preview);
  assert.equal(payments.length, 2);
  for (const [i, payment] of payments.entries())
    bundle.pending.push({
      id: `s${i}`,
      groupId: "g",
      type: "settle",
      createdAt: 2,
      payload: payment,
    });
  assert.deepEqual(
    visibleGroups(bundle)[0].members.map((m) => m.balance),
    [0, 0, 0],
  );
  assert.equal(group.expenses.length, 0);
});
test("an acknowledged command can move to cached state without losing the expense", () => {
  const group = {
    id: "g",
    members: [{ id: "a" }, { id: "b" }],
    expenses: [],
    settlements: [],
  };
  const command = {
    id: "e",
    groupId: "g",
    type: "addExpense",
    createdAt: 1,
    payload: {
      title: "Dinner",
      amount: 1,
      payerId: "a",
      participants: ["a", "b"],
    },
  };
  const before = visibleGroups({
    base: { groups: [group] },
    pending: [command],
  });
  const after = visibleGroups({
    base: { groups: applyCommand([group], command) },
    pending: [],
  });
  assert.deepEqual(after, before);
});
