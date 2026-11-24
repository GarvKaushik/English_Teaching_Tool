"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/Icons";
import { api, errorText } from "@/lib/api";
import styles from "../ui.module.css";

type Plan = {
  id: number;
  name: string;
  price_inr: number;
  days: number | null;
  interviews: number | null;
  daily_minutes: number;
  azure_voice: number;
  listed: number;
  users: number;
};
type AdminUser = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  level: string | null;
  xp: number;
  last_active: string | null;
  created_at: string;
  is_minor: boolean;
  plan_id: number;
  plan_name: string;
  plan_expires: string | null;
  interviews_used: number;
  interviews_left: number | null;
};

type Payment = {
  id: number;
  created_at: string;
  paid_at: string | null;
  status: string;
  outcome: string | null;
  amount_paise: number;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  plan_name: string;
  user_name: string | null;
  email: string | null;
  phone: string | null;
};

const TOKEN_KEY = "adminToken";
const readToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
let memoryToken: string | null = null; // fallback when storage is blocked
const listeners = new Set<() => void>();
const saveToken = (token: string | null) => {
  memoryToken = token;
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked: the admin stays signed in for this page only.
  }
  listeners.forEach((l) => l());
};
/** undefined while rendering on the server, null when signed out. */
function useAdminToken(): string | null | undefined {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => readToken() ?? memoryToken,
    () => undefined,
  );
}

const EMPTY_PLAN = { name: "", price_inr: "", days: "", interviews: "", daily_minutes: "15", azure_voice: true };

export default function Admin() {
  const token = useAdminToken();
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState<"users" | "plans" | "payments">("users");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(EMPTY_PLAN);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0); // bump to reload users and plans

  const call = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      try {
        return await api<T>(path, { ...init, headers: { "X-Admin-Token": token ?? "" } });
      } catch (e) {
        if (errorText(e) === "Admin sign-in required.") saveToken(null);
        throw e;
      }
    },
    [token],
  );

  useEffect(() => {
    if (!token) return;
    Promise.all([
      call<AdminUser[]>(`/v1/admin/users?q=${encodeURIComponent(query)}`),
      call<Plan[]>("/v1/admin/plans"),
      call<Payment[]>("/v1/admin/payments"),
    ])
      .then(([u, p, pay]) => {
        setUsers(u);
        setPlans(p);
        setPayments(pay);
      })
      .catch((e) => setMessage(errorText(e)));
  }, [call, query, token, version]);

  async function act(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(done);
      setVersion((v) => v + 1);
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const r = await api<{ token: string }>("/v1/admin/login", { method: "POST", body: JSON.stringify({ password }) });
      saveToken(r.token);
      setPassword("");
    } catch (err) {
      setMessage(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const switchPlan = (user: AdminUser, planId: number) =>
    act(
      () => call(`/v1/admin/users/${user.id}/plan`, { method: "POST", body: JSON.stringify({ plan_id: planId }) }),
      `${user.name} is now on ${plans.find((p) => p.id === planId)?.name}.`,
    );

  const setListed = (plan: Plan, listed: boolean) =>
    act(
      () => call(`/v1/admin/plans/${plan.id}/listed`, { method: "POST", body: JSON.stringify({ listed }) }),
      `${plan.name} ${listed ? "relisted" : "unlisted"}.`,
    );

  function createPlan(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      name: form.name,
      price_inr: Number(form.price_inr),
      days: Number(form.days),
      interviews: form.interviews === "" ? null : Number(form.interviews),
      daily_minutes: Number(form.daily_minutes),
      azure_voice: form.azure_voice,
    };
    act(async () => {
      await call("/v1/admin/plans", { method: "POST", body: JSON.stringify(body) });
      setForm(EMPTY_PLAN);
    }, `Plan "${form.name}" created.`);
  }

  if (token === undefined) return <main className={styles.main} />;
  if (!token) {
    return (
      <main className={styles.main}>
        <form className={`${styles.card} ${styles.form}`} onSubmit={signIn}>
          <div className={styles.pageHead}>
            <span className={styles.eyebrow}>Admin</span>
            <h1>Sign in</h1>
          </div>
          <label className={styles.field}>
            Admin password
            <input className={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </label>
          <button className={styles.button} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          <p role="alert" className={styles.error}>{message}</p>
        </form>
      </main>
    );
  }

  const listedPlans = plans.filter((p) => p.listed);
  const interviews = (n: number | null) => (n === null ? "Unlimited" : String(n));

  return (
    <main className={`${styles.main} ${styles.wide}`}>
      <div className={styles.chatHead}>
        <div className={styles.pageHead}>
          <span className={styles.eyebrow}>Admin</span>
          <h1>{tab === "users" ? "Users" : tab === "plans" ? "Plans" : "Payments"}</h1>
        </div>
        <button className={styles.ghost} onClick={() => saveToken(null)}><Icon name="logout" size={18} />Sign out</button>
      </div>

      <div className={styles.actions} role="tablist">
        <button role="tab" aria-selected={tab === "users"} className={tab === "users" ? styles.button : styles.secondary} onClick={() => setTab("users")}>
          <Icon name="user" size={18} />Users
        </button>
        <button role="tab" aria-selected={tab === "plans"} className={tab === "plans" ? styles.button : styles.secondary} onClick={() => setTab("plans")}>
          <Icon name="grid" size={18} />Plans
        </button>
        <button role="tab" aria-selected={tab === "payments"} className={tab === "payments" ? styles.button : styles.secondary} onClick={() => setTab("payments")}>
          <Icon name="zap" size={18} />Payments
        </button>
      </div>
      <p role="status" aria-live="polite" className={styles.status}>{message}</p>

      {tab === "users" ? (
        <section className={styles.section}>
          <label className={styles.field} style={{ maxWidth: 320 }}>
            Search by name, email or mobile
            <input className={styles.input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Asha or 98765" />
          </label>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th><th>Email</th><th>Mobile</th><th>Plan</th><th>Plan ends</th><th>Interviews used / left</th><th>Level</th><th>XP</th><th>Last active</th><th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name} {u.is_minor && <span className={styles.tag}>Under 18</span>}</td>
                    <td>{u.email ?? "–"}</td>
                    <td>{u.phone ?? "–"}</td>
                    <td>
                      <select
                        className={styles.input}
                        value={u.plan_id}
                        disabled={busy}
                        onChange={(e) => switchPlan(u, Number(e.target.value))}
                        aria-label={`Plan for ${u.name}`}
                      >
                        {!listedPlans.some((p) => p.id === u.plan_id) && <option value={u.plan_id}>{u.plan_name} (unlisted)</option>}
                        {listedPlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                    <td>{u.plan_expires ?? "Never"}</td>
                    <td>{u.interviews_used} / {interviews(u.interviews_left)}</td>
                    <td>{u.level ?? "–"}</td>
                    <td>{u.xp}</td>
                    <td>{u.last_active ?? "–"}</td>
                    <td>{u.created_at.slice(0, 10)}</td>
                  </tr>
                ))}
                {users.length === 0 && <tr><td colSpan={10} className={styles.muted}>No users found.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className={`${styles.muted} ${styles.small}`}>Changing a plan starts it today and resets the user&apos;s interview count. Expired plans return to Free automatically.</p>
        </section>
      ) : tab === "plans" ? (
        <>
          <section className={styles.section}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Plan</th><th>Price</th><th>Length</th><th>Interviews</th><th>Speaking / day</th><th>Voice</th><th>Users</th><th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.name}</strong></td>
                      <td>₹{p.price_inr}</td>
                      <td>{p.days ? `${p.days} days` : "Forever"}</td>
                      <td>{interviews(p.interviews)}</td>
                      <td>{p.daily_minutes} min</td>
                      <td>{p.azure_voice ? "Azure" : "Browser"}</td>
                      <td>{p.users}</td>
                      <td>{p.listed ? <span className={`${styles.tag} ${styles.good}`}>Listed</span> : <span className={styles.tag}>Unlisted</span>}</td>
                      <td>
                        {p.id !== 1 && (
                          <button className={styles.ghost} disabled={busy} onClick={() => setListed(p, !p.listed)}>
                            {p.listed ? "Unlist" : "Relist"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={`${styles.muted} ${styles.small}`}>Unlisting stops a plan being given to more users; people already on it keep it until it ends. Plans can&apos;t be edited: create a new one and unlist the old one.</p>
          </section>

          <form className={`${styles.card} ${styles.form}`} onSubmit={createPlan}>
            <h2>Create a plan</h2>
            <label className={styles.field}>
              Name
              <input className={styles.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} maxLength={40} />
            </label>
            <label className={styles.field}>
              Price (₹)
              <input className={styles.input} type="number" min={0} value={form.price_inr} onChange={(e) => setForm({ ...form, price_inr: e.target.value })} required />
            </label>
            <label className={styles.field}>
              Length (days)
              <input className={styles.input} type="number" min={1} value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} required placeholder="e.g. 90 for 3 months" />
            </label>
            <label className={styles.field}>
              Interviews included
              <span className={styles.hint}>Leave empty for unlimited</span>
              <input className={styles.input} type="number" min={0} value={form.interviews} onChange={(e) => setForm({ ...form, interviews: e.target.value })} />
            </label>
            <label className={styles.field}>
              Speaking minutes per day
              <input className={styles.input} type="number" min={1} max={240} value={form.daily_minutes} onChange={(e) => setForm({ ...form, daily_minutes: e.target.value })} required />
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={form.azure_voice} onChange={(e) => setForm({ ...form, azure_voice: e.target.checked })} />
              <span>Azure voice (unticked: the browser&apos;s free built-in voice)</span>
            </label>
            <button className={styles.button} disabled={busy}><Icon name="check" size={18} />Create plan</button>
          </form>
        </>
      ) : (
        <section className={styles.section}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th><th>User</th><th>Plan</th><th>Amount</th><th>Status</th><th>Result</th><th>Razorpay payment</th><th>Razorpay order</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{(p.paid_at ?? p.created_at).slice(0, 16)}</td>
                    <td>{p.user_name ?? <span className={styles.muted}>Deleted account</span>}{p.email && <div className={`${styles.muted} ${styles.small}`}>{p.email}</div>}</td>
                    <td>{p.plan_name}</td>
                    <td>₹{p.amount_paise / 100}</td>
                    <td>{p.status === "paid" ? <span className={`${styles.tag} ${styles.good}`}>Paid</span> : <span className={styles.tag}>Not paid</span>}</td>
                    <td>{p.outcome === "queued" ? "Starts after current plan" : p.outcome === "activated" ? "Started" : "–"}</td>
                    <td>{p.razorpay_payment_id ?? "–"}</td>
                    <td>{p.razorpay_order_id}</td>
                  </tr>
                ))}
                {payments.length === 0 && <tr><td colSpan={8} className={styles.muted}>No payments yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className={`${styles.muted} ${styles.small}`}>&quot;Not paid&quot; means checkout was opened but not completed. Refunds are made from the Razorpay dashboard.</p>
        </section>
      )}
    </main>
  );
}
