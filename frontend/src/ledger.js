export function money(amount, currency = "INR") {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(amount / 100);
}
export function minorUnits(text) {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text))
    throw new Error("Enter an amount with up to two decimal places.");
  const [whole, fraction = ""] = text.split(".");
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (value < 1 || value > 100000000)
    throw new Error("Enter an amount between 0.01 and 1,000,000.00.");
  return value;
}
export function balances(group) {
  const result = Object.fromEntries(
    group.members.map((member) => [member.id, 0]),
  );
  for (const expense of group.expenses) {
    result[expense.payerId] += expense.amount;
    for (const share of expense.shares) result[share.memberId] -= share.amount;
  }
  for (const settlement of group.settlements) {
    result[settlement.fromId] += settlement.amount;
    result[settlement.toId] -= settlement.amount;
  }
  return group.members.map((member) => ({
    ...member,
    balance: result[member.id],
  }));
}
export function applyCommand(groups, command) {
  const { id, groupId, type, payload: p } = command;
  if (type === "createGroup")
    return [
      ...groups,
      {
        id: groupId,
        name: p.name,
        currency: p.currency,
        ownerId: p.ownerId,
        members: p.members,
        expenses: [],
        settlements: [],
      },
    ];
  return groups.map((group) => {
    if (group.id !== groupId) return group;
    if (type === "addExpense") {
      const people = [...p.participants].sort();
      const shares = people.map((memberId, index) => ({
        memberId,
        amount:
          Math.floor(p.amount / people.length) +
          (index < p.amount % people.length ? 1 : 0),
      }));
      return {
        ...group,
        expenses: [
          {
            id,
            title: p.title,
            amount: p.amount,
            payerId: p.payerId,
            shares,
            createdAt: command.createdAt,
          },
          ...group.expenses,
        ],
      };
    }
    return {
      ...group,
      settlements: [
        {
          id,
          fromId: p.fromId,
          toId: p.toId,
          amount: p.amount,
          createdAt: command.createdAt,
        },
        ...group.settlements,
      ],
    };
  });
}
export function visibleGroups(bundle) {
  return bundle.pending
    .reduce(applyCommand, bundle.base.groups)
    .map((group) => ({ ...group, members: balances(group) }));
}
export function suggestions(group) {
  const debtors = group.members
    .filter((m) => m.balance < 0)
    .map((m) => ({ ...m, remaining: -m.balance }));
  const creditors = group.members
    .filter((m) => m.balance > 0)
    .map((m) => ({ ...m, remaining: m.balance }));
  const transfers = [];
  for (const debtor of debtors)
    for (const creditor of creditors) {
      const amount = Math.min(debtor.remaining, creditor.remaining);
      if (amount > 0)
        transfers.push({ fromId: debtor.id, toId: creditor.id, amount });
      debtor.remaining -= amount;
      creditor.remaining -= amount;
    }
  return transfers;
}
