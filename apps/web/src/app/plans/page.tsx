"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icons";
import { api, errorText, postJson, useRequireLogin } from "@/lib/api";
import styles from "../ui.module.css";

type Plan = {
  id: number;
  name: string;
  price_inr: number;
  days: number;
  interviews: number | null;
  daily_minutes: number;
  azure_voice: number;
  on_purchase: "activates_now" | "starts_later" | "blocked";
  starts?: string;
};
type Summary = {
  current: { id: number; name: string; expires: string | null; interviews_left: number | null };
  upcoming: { id: number; name: string; starts: string } | null;
};
type Order = {
  order_id: string;
  key_id: string;
  amount: number;
  currency: string;
  plan_name: string;
  prefill: { name: string; email: string; contact: string };
};
type CheckoutResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayCheckout = {
  open: () => void;
  on: (event: "payment.failed", cb: (r: { error: { description?: string } }) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: object) => RazorpayCheckout;
  }
}

const CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

/** Razorpay's official checkout script, loaded only when someone buys. */
function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Couldn't load the payment window. Check your connection and try again."));
    document.body.appendChild(script);
  });
}

const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { dateStyle: "medium" });
const length = (days: number) => (days % 30 === 0 ? `${days / 30} ${days === 30 ? "month" : "months"}` : `${days} days`);

export default function Plans() {
  useRequireLogin();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState<number | "activate" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0); // bump to reload after a purchase

  useEffect(() => {
    api<{ plans: Plan[] } & Summary>("/v1/plans")
      .then((r) => {
        setPlans(r.plans);
        setSummary({ current: r.current, upcoming: r.upcoming });
      })
      .catch((e) => setError(errorText(e)));
  }, [version]);

  async function buy(plan: Plan) {
    setBusy(plan.id);
    setMessage("");
    setError("");
    try {
      const order = await postJson<Order>("/v1/payments/order", { plan_id: plan.id });
      await loadCheckout();
      const checkout = new window.Razorpay!({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: "English Coach",
        description: order.plan_name,
        prefill: order.prefill,
        theme: { color: "#4f46e5" },
        handler: async (result: CheckoutResult) => {
          try {
            const r = await postJson<{ outcome: string } & Summary>("/v1/payments/verify", result);
            setMessage(
              r.outcome === "queued" && r.upcoming
                ? `Payment received. ${r.upcoming.name} starts on ${day(r.upcoming.starts)}, after your current plan.`
                : `Payment received. You're on ${r.current.name}${r.current.expires ? ` until ${day(r.current.expires)}` : ""}.`,
            );
            setVersion((v) => v + 1);
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(null);
          }
        },
        modal: { ondismiss: () => setBusy(null) },
      });
      checkout.on("payment.failed", (r) => setError(r.error.description || "The payment didn't go through. You haven't been charged."));
      checkout.open();
    } catch (e) {
      setError(errorText(e));
      setBusy(null);
    }
  }

  async function activateUpcoming() {
    setBusy("activate");
    setMessage("");
    setError("");
    try {
      const r = await postJson<Summary>("/v1/plans/activate-upcoming", {});
      setMessage(`${r.current.name} has started.`);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  if (!plans || !summary) return <main className={styles.main}><p role="status" className={styles.status}>{error || "Loading…"}</p></main>;
  const { current, upcoming } = summary;

  return (
    <main className={`${styles.main} ${styles.wide}`}>
      <div className={styles.pageHead}>
        <span className={styles.eyebrow}>Plans</span>
        <h1>Choose your plan</h1>
        <p className={styles.muted}>One-time payment. No auto-renewal.</p>
      </div>

      <section className={styles.card} aria-labelledby="current-heading">
        <h2 id="current-heading">Your plan: {current.name}</h2>
        <p className={styles.muted}>
          {current.expires ? `Until ${day(current.expires)}. ` : ""}
          {current.interviews_left === null ? "Unlimited interviews." : `${current.interviews_left} ${current.interviews_left === 1 ? "interview" : "interviews"} left.`}
        </p>
        {upcoming && (
          <div className={styles.section}>
            <p><strong>Next: {upcoming.name}</strong>, starts {day(upcoming.starts)}.</p>
            {current.interviews_left === 0 ? (
              <button className={styles.button} onClick={activateUpcoming} disabled={busy !== null}>
                <Icon name="zap" size={18} />Start {upcoming.name} now
              </button>
            ) : (
              <p className={`${styles.muted} ${styles.small}`}>You can start it early once this plan&apos;s interviews are used up.</p>
            )}
          </div>
        )}
      </section>

      <p role="status" aria-live="polite" className={`${styles.status} ${styles.good}`}>{message}</p>
      <p role="alert" className={styles.error}>{error}</p>

      <div className={styles.cards}>
        {plans.map((p) => (
          <section key={p.id} className={styles.card} aria-labelledby={`plan-${p.id}`}>
            <h2 id={`plan-${p.id}`}>{p.name}</h2>
            <p><strong style={{ fontSize: "1.8rem" }}>₹{p.price_inr}</strong> <span className={styles.muted}>for {length(p.days)}</span></p>
            <ul className={styles.list}>
              <li className={styles.mistakeLine}><Icon name="briefcase" size={16} />{p.interviews === null ? "Unlimited" : p.interviews} resume interviews</li>
              <li className={styles.mistakeLine}><Icon name="mic" size={16} />{p.daily_minutes} minutes of speaking a day</li>
              <li className={styles.mistakeLine}><Icon name="speaker" size={16} />{p.azure_voice ? "Natural AI voice" : "Device voice"}</li>
            </ul>
            {p.on_purchase === "blocked" ? (
              <>
                <button className={styles.secondary} disabled>Buy</button>
                <span className={`${styles.muted} ${styles.small}`}>Available once {upcoming?.name} has started.</span>
              </>
            ) : (
              <>
                <button className={styles.button} onClick={() => buy(p)} disabled={busy !== null}>
                  {busy === p.id ? <><Icon name="loader" className={styles.spin} />Opening payment…</> : <>Buy for ₹{p.price_inr}</>}
                </button>
                <span className={`${styles.muted} ${styles.small}`}>
                  {p.on_purchase === "activates_now" ? "Starts today." : `Starts ${day(p.starts!)}, when your current plan ends.`}
                </span>
              </>
            )}
          </section>
        ))}
        {plans.length === 0 && <p className={styles.muted}>No plans are available right now.</p>}
      </div>
      <p className={styles.note}><Icon name="shield" size={18} />Payments are handled securely by Razorpay. We never see your card or UPI details.</p>
    </main>
  );
}
