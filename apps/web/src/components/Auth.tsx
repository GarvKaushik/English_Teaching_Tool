"use client";

import { useEffect, useState } from "react";
import { errorText, finishPasswordRecovery, postJson } from "@/lib/api";
import { authConfigured, supabase } from "@/lib/supabase";
import styles from "@/app/ui.module.css";
import { Icon } from "./Icons";

const MIN_PASSWORD = 8;
const home = () => window.location.origin;

/** Google, or email + password: sign in, create an account, or reset a forgotten password. */
export function SignIn() {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<string | void>) {
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const done = await action();
      if (done) setMessage(done);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const google = () =>
    run(async () => {
      const { error } = await supabase!.auth.signInWithOAuth({ provider: "google", options: { redirectTo: home() } });
      if (error) throw error; // on success the browser leaves for Google
    });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    run(async () => {
      if (mode === "forgot") {
        const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: home() });
        if (error) throw error;
        return "If that email has an account, we've sent a link to reset the password.";
      }
      if (mode === "signup") {
        const { data, error } = await supabase!.auth.signUp({ email, password, options: { emailRedirectTo: home() } });
        if (error) throw error;
        if (!data.session) return "Check your inbox and click the link to confirm your email. Then sign in here.";
        return;
      }
      const { error } = await supabase!.auth.signInWithPassword({ email, password });
      if (error) throw error;
    });
  }

  if (!authConfigured) {
    return (
      <div className={`${styles.card} ${styles.form}`}>
        <h2>Sign-in isn&apos;t set up</h2>
        <p className={styles.muted}>Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to apps/web/.env.local and restart the web app.</p>
      </div>
    );
  }

  const title = mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Sign in";
  return (
    <form className={`${styles.card} ${styles.form}`} onSubmit={submit}>
      <div className={styles.pageHead}>
        <h2>{title}</h2>
        {mode !== "forgot" && <p className={`${styles.muted} ${styles.small}`}>Free to start. No card needed.</p>}
      </div>

      {mode !== "forgot" && (
        <>
          <button type="button" className={styles.secondary} onClick={google} disabled={busy}>
            <Icon name="globe" size={18} />Continue with Google
          </button>
          <p className={`${styles.muted} ${styles.small}`} style={{ textAlign: "center" }}>or use your email</p>
        </>
      )}

      <label className={styles.field}>
        Email
        <input className={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </label>
      {mode !== "forgot" && (
        <label className={styles.field}>
          Password
          {mode === "signup" && <span className={styles.hint}>At least {MIN_PASSWORD} characters</span>}
          <input
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === "signup" ? MIN_PASSWORD : undefined}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </label>
      )}

      <button className={styles.button} disabled={busy}>
        {busy ? <><Icon name="loader" className={styles.spin} />Please wait…</> :
          mode === "signup" ? <>Create account <Icon name="arrow" size={18} /></> :
          mode === "forgot" ? <>Send reset link</> : <>Sign in <Icon name="arrow" size={18} /></>}
      </button>
      <p role="status" aria-live="polite" className={`${styles.status} ${styles.good}`}>{message}</p>
      <p role="alert" className={styles.error}>{error}</p>

      <div className={styles.actions}>
        {mode === "signin" ? (
          <>
            <button type="button" className={styles.ghost} onClick={() => setMode("signup")}>New here? Create an account</button>
            <button type="button" className={styles.ghost} onClick={() => setMode("forgot")}>Forgot password?</button>
          </>
        ) : (
          <button type="button" className={styles.ghost} onClick={() => setMode("signin")}>Back to sign in</button>
        )}
      </div>
      <p className={styles.note}><Icon name="shield" size={18} />Your recordings are scored and then deleted. They are never stored.</p>
    </form>
  );
}

/** Shown once after the first sign-in: details we need that Google and email sign-up don't give us. */
export function ProfileForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [consent, setConsent] = useState(false);
  const [explainLang, setExplainLang] = useState("english");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const isMinor = birthYear.length === 4 && new Date().getFullYear() - Number(birthYear) < 18;

  // Google accounts come with a name: offer it as the starting value.
  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata ?? {};
      const fromGoogle = meta.full_name ?? meta.name;
      if (typeof fromGoogle === "string") setName((n) => n || fromGoogle);
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await postJson("/v1/auth/profile", {
        name,
        phone,
        birth_year: Number(birthYear),
        parental_consent: consent,
        explain_lang: explainLang,
      });
      onDone();
    } catch (err) {
      setMessage(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.main}>
      <form className={`${styles.card} ${styles.form}`} onSubmit={submit}>
        <div className={styles.pageHead}>
          <span className={styles.eyebrow}>One last step</span>
          <h1>Tell us about you</h1>
        </div>
        <label className={styles.field}>
          Your name
          <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={40} autoComplete="name" />
        </label>
        <label className={styles.field}>
          Mobile number
          <span className={styles.hint} id="phone-hint">One account per number. Outside India, start with your country code, e.g. +44.</span>
          <input className={styles.input} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required autoComplete="tel" placeholder="98765 43210" aria-describedby="phone-hint" />
        </label>
        <label className={styles.field}>
          Birth year
          <input className={styles.input} value={birthYear} onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, "").slice(0, 4))} required inputMode="numeric" autoComplete="bday-year" placeholder="e.g. 2004" />
        </label>
        {isMinor && (
          <label className={styles.check}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I am a parent or guardian and I agree to this learner using the app, including voice recordings that are scored and then deleted.</span>
          </label>
        )}
        <label className={styles.field}>
          Explanations in
          <select className={styles.input} value={explainLang} onChange={(e) => setExplainLang(e.target.value)}>
            <option value="english">English</option>
            <option value="hinglish">Hinglish</option>
          </select>
        </label>
        <button className={styles.button} disabled={busy}>
          {busy ? <><Icon name="loader" className={styles.spin} />Please wait…</> : <>Start learning <Icon name="arrow" size={18} /></>}
        </button>
        <p role="alert" className={styles.error}>{message}</p>
      </form>
    </main>
  );
}

/** After following a "reset password" email link. */
export function NewPassword() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setMessage(error.message);
    else finishPasswordRecovery();
  }

  return (
    <main className={styles.main}>
      <form className={`${styles.card} ${styles.form}`} onSubmit={submit}>
        <div className={styles.pageHead}>
          <h1>Choose a new password</h1>
        </div>
        <label className={styles.field}>
          New password
          <span className={styles.hint}>At least {MIN_PASSWORD} characters</span>
          <input className={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={MIN_PASSWORD} autoComplete="new-password" />
        </label>
        <button className={styles.button} disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
        <p role="alert" className={styles.error}>{message}</p>
      </form>
    </main>
  );
}
