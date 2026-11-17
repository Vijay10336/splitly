import { Preferences } from "@capacitor/preferences";
const ACTIVE = "splitly.active";
const key = (id) => `splitly.account.${id}`;
export async function load() {
  const { value: id } = await Preferences.get({ key: ACTIVE });
  if (!id) return null;
  const { value } = await Preferences.get({ key: key(id) });
  return value ? JSON.parse(value) : null;
}
export async function save(bundle) {
  await Preferences.set({
    key: key(bundle.user.id),
    value: JSON.stringify(bundle),
  });
  await Preferences.set({ key: ACTIVE, value: bundle.user.id });
}
export async function forget(bundle) {
  if (bundle) await Preferences.remove({ key: key(bundle.user.id) });
  await Preferences.remove({ key: ACTIVE });
}
export async function forUser(user) {
  const { value } = await Preferences.get({ key: key(user.id) });
  return value
    ? { ...JSON.parse(value), user }
    : { user, base: { groups: [] }, pending: [] };
}
