"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AudioLines, BriefcaseBusiness, ChevronRight, GraduationCap, Flame, Globe, History, LayoutGrid, Link2, ListChecks,
  LogOut, MessagesSquare, Mic, Sparkles, Target, Timer, Trash2, Trophy, Zap, type LucideIcon,
} from "lucide-react";
import { MistakeList } from "@/components/Results";
import { ProfileForm, NewPassword } from "@/components/Auth";
import { Landing } from "@/components/landing/Landing";
import {
  Button, ButtonLink, Card, CardTitle, EmptyState, Flourish, IconTile, ListRow, Metric, Page, PageHeader,
  PillBars, Pill, Segmented, Skeleton, TickBar, cardClass, cn,
} from "@/components/ui";
import { api, ApiError, errorText, signOut, usePasswordRecovery, useToken, type Mistake, type User } from "@/lib/api";
import { setTheme, useTheme } from "@/lib/theme";

type Me = {
  user: User;
  activities: { kind: string; score: number | null; xp: number; created_at: string }[];
  mistakes: Mistake[];
  best: Record<string, number>;
  speaking_seconds_today: number;
  speaking_limit_seconds: number;
};

const KINDS: Record<string, { label: string; short: string; icon: LucideIcon }> = {
  placement: { label: "Placement test", short: "Placement", icon: Target },
  roleplay: { label: "Role-play", short: "Role-play", icon: MessagesSquare },
  coach: { label: "Mistake Coach", short: "Coach", icon: GraduationCap },
  jam: { label: "JAM", short: "JAM", icon: Timer },
  daily_word: { label: "Daily Word", short: "Word", icon: LayoutGrid },
  daily_word_bonus: { label: "Daily Word bonus", short: "Bonus", icon: Sparkles },
  word_chain: { label: "Word Chain", short: "Chain", icon: Link2 },
  tongue_twister: { label: "Tongue Twister", short: "Twister", icon: AudioLines },
  quiz: { label: "MCQ Quiz", short: "Quiz", icon: ListChecks },
};
const kind = (k: string) => KINDS[k] ?? { label: k, short: k, icon: Zap };

const FEATURES: { href: string; title: string; text: string; icon: LucideIcon }[] = [
  { href: "/roleplay", title: "AI Role-Play", text: "Practise a job interview or an everyday conversation.", icon: MessagesSquare },
  { href: "/coach", title: "Mistake Coach", text: "Talk hands-free about your recent mistakes, in English or Hinglish.", icon: GraduationCap },
  { href: "/jam", title: "JAM: Just a Minute", text: "Speak for 60 seconds on today's topic.", icon: Timer },
  { href: "/daily-word", title: "Daily Word", text: "Guess today's five-letter word in six tries.", icon: LayoutGrid },
  { href: "/word-chain", title: "Word Chain", text: "Say a word that starts with the last letter of the AI's word.", icon: Link2 },
  { href: "/tongue-twister", title: "Tongue Twister", text: "Listen once, then say it clearly and quickly.", icon: AudioLines },
  { href: "/quiz", title: "MCQ Quiz", text: "Ten quick grammar and vocabulary questions.", icon: ListChecks },
  { href: "/placement", title: "Placement Test", text: "Find your level: answer three questions out loud.", icon: Target },
  { href: "/interview", title: "Interview Preparation", text: "Upload your resume and answer questions about your own experience.", icon: BriefcaseBusiness },
  { href: "/plans", title: "Plans & Upgrade", text: "Get more interview practice and speaking time.", icon: Sparkles },
];

export default function Home() {
  const token = useToken();
  const recovering = usePasswordRecovery();
  if (token === undefined) return <Page />;
  if (token && recovering) return <NewPassword />;
  return token ? <Dashboard /> : <Landing />;
}

function Dashboard() {
  const theme = useTheme();
  const [me, setMe] = useState<Me | null>(null);
  const [message, setMessage] = useState("");
  const [needsProfile, setNeedsProfile] = useState(false);
  const [version, setVersion] = useState(0); // bump to reload after the profile is saved

  useEffect(() => {
    api<Me>("/v1/me")
      .then((m) => {
        setMe(m);
        setNeedsProfile(false);
      })
      .catch((e) => (e instanceof ApiError && e.status === 428 ? setNeedsProfile(true) : setMessage(errorText(e))));
  }, [version]);

  async function changeLanguage(explain_lang: string) {
    try {
      const user = await api<User>("/v1/me", { method: "PATCH", body: JSON.stringify({ explain_lang }) });
      setMe((m) => (m ? { ...m, user } : m));
    } catch (e) {
      setMessage(errorText(e));
    }
  }

  async function deleteAccount() {
    if (!confirm("Delete your account and all your progress? This cannot be undone.")) return;
    try {
      await api("/v1/me", { method: "DELETE" });
      await signOut();
    } catch (e) {
      setMessage(errorText(e));
    }
  }

  if (needsProfile) return <ProfileForm onDone={() => setVersion((v) => v + 1)} />;
  if (!me) return <DashboardSkeleton message={message} />;

  const { user } = me;
  const secondsLeft = Math.max(0, me.speaking_limit_seconds - me.speaking_seconds_today);
  const minutesLeft = Math.round(secondsLeft / 60);
  const limitMinutes = Math.round(me.speaking_limit_seconds / 60);
  const usedPct = me.speaking_limit_seconds ? Math.min(100, (me.speaking_seconds_today / me.speaking_limit_seconds) * 100) : 0;
  const best = Object.entries(me.best).map(([k, v]) => ({ label: kind(k).short, value: v }));

  return (
    <Page>
      <PageHeader
        title={`Hi ${user.name}!`}
        subtitle={user.streak > 0 ? `You're on a ${user.streak}-day streak. Keep it going today.` : "Practise today to start your streak."}
      />

      <div className="stagger grid gap-5 lg:grid-cols-12 lg:gap-6">
        {/* Hero */}
        <Card variant="hero" className="justify-between gap-6 overflow-hidden lg:col-span-8">
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-mint/10 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="flex max-w-lg flex-col gap-2">
              <h2 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] sm:text-[2rem]">
                Your English sounds <Flourish>better</Flourish> every day
              </h2>
              <p className="text-sm text-on-dark-2">
                {user.level ? "Pick up where you left off: a role-play, a game or a quick quiz." : "Start with a short test: answer three questions out loud to find your level."}
              </p>
            </div>
            <Pill tone="glass" dot>{minutesLeft} min speaking left</Pill>
          </div>
          <div className="relative flex flex-wrap gap-3">
            {user.level ? (
              <>
                <ButtonLink href="/roleplay" variant="coral" icon={Mic}>Start a role-play</ButtonLink>
                <ButtonLink href="/jam" variant="glass" icon={Timer}>Today&apos;s JAM</ButtonLink>
              </>
            ) : (
              <ButtonLink href="/placement" variant="coral" icon={Target}>Find your level</ButtonLink>
            )}
          </div>
        </Card>

        {/* Speaking today */}
        <Card className="justify-between lg:col-span-4">
          <div className="flex items-center justify-between">
            <CardTitle>Speaking today</CardTitle>
            <IconTile icon={Mic} size={36} />
          </div>
          <Metric value={minutesLeft} unit="min left" />
          <div className="flex flex-col gap-2">
            <TickBar value={usedPct} label="Speaking time used today" />
            <p className="flex justify-between text-xs text-fg-3">
              <span>{Math.round(usedPct)}% used</span>
              <span>{limitMinutes} min a day</span>
            </p>
          </div>
        </Card>

        <StatCard className="lg:col-span-4" icon={Zap} label="Total XP" value={user.xp} unit="XP" />
        <StatCard className="lg:col-span-4" icon={Flame} label="Day streak" value={user.streak} unit={user.streak === 1 ? "day" : "days"} coral />
        <StatCard
          className="lg:col-span-4" icon={Target} label="Level"
          value={<span className="capitalize">{user.level ?? "—"}</span>}
          footer={!user.level && <Link href="/placement" className="text-xs font-semibold text-accent-fg hover:underline">Take the placement test</Link>}
        />
      </div>

      <section aria-labelledby="practise-heading" className="flex flex-col gap-4">
        <h2 id="practise-heading" className="text-xl font-semibold tracking-[-0.01em]">Practise</h2>
        <div className="stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {FEATURES.map((f) => (
            <Link key={f.href} href={f.href} className={cn(cardClass("default", true), "group gap-3")}>
              <div className="flex items-start justify-between">
                <IconTile icon={f.icon} tone="mint" size={44} />
                <span className="grid size-9 place-items-center rounded-full bg-raised text-fg-2 transition group-hover:bg-mint group-hover:text-on-mint">
                  <ChevronRight size={18} aria-hidden />
                </span>
              </div>
              <span className="text-base font-semibold">{f.title}</span>
              <span className="text-sm text-fg-2">{f.text}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-12 lg:gap-6">
        <Card aria-labelledby="best-heading" className="lg:col-span-7">
          <div className="flex items-center justify-between">
            <CardTitle id="best-heading">Best scores</CardTitle>
            <Pill tone="neutral" icon={Trophy}>out of 100</Pill>
          </div>
          {best.length === 0 ? (
            <EmptyState icon={Trophy} title="No scores yet" text="Complete an activity to see your best scores here." />
          ) : (
            <PillBars data={best} />
          )}
        </Card>

        <Card aria-labelledby="recent-heading" className="lg:col-span-5">
          <div className="flex items-center justify-between">
            <CardTitle id="recent-heading">Recent activity</CardTitle>
            {me.activities.length > 0 && <Pill tone="mint">{Math.min(6, me.activities.length)}</Pill>}
          </div>
          {me.activities.length === 0 ? (
            <EmptyState icon={History} title="Nothing yet" text="Your practice history will appear here." />
          ) : (
            <ul className="-mx-2 flex flex-col">
              {me.activities.slice(0, 6).map((a, i) => (
                <ListRow
                  key={i}
                  leading={<IconTile icon={kind(a.kind).icon} />}
                  title={<>{kind(a.kind).label}{a.score !== null && <span className="text-fg-2"> · {Math.round(a.score)}</span>}</>}
                  meta={new Date(a.created_at.replace(" ", "T") + "Z").toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  trailing={<Pill tone="coral">+{a.xp} XP</Pill>}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

      {me.mistakes.length > 0 && (
        <Card aria-labelledby="mistakes-heading">
          <CardTitle id="mistakes-heading">Mistakes to review</CardTitle>
          <MistakeList mistakes={me.mistakes} />
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-12 lg:gap-6">
        <Card aria-labelledby="settings-heading" className="lg:col-span-7">
          <CardTitle id="settings-heading">Settings</CardTitle>
          <ul className="flex flex-col divide-y divide-line">
            <SettingRow icon={Globe} title="Explanations in" meta="Language for tips and corrections">
              <Segmented
                label="Explanations in"
                value={user.explain_lang}
                onChange={changeLanguage}
                options={[{ value: "english", label: "English" }, { value: "hinglish", label: "Hinglish" }]}
              />
            </SettingRow>
            <SettingRow icon={Sparkles} title="Appearance" meta="Day or night colours">
              <Segmented
                label="Appearance"
                value={theme}
                onChange={setTheme}
                options={[{ value: "day", label: "Day" }, { value: "night", label: "Night" }]}
              />
            </SettingRow>
          </ul>
          <div>
            <Button variant="ghost" icon={LogOut} onClick={() => signOut()}>Sign out</Button>
          </div>
        </Card>

        <Card aria-labelledby="danger-heading" className="lg:col-span-5">
          <CardTitle id="danger-heading">Delete account</CardTitle>
          <p className="text-sm text-fg-2">Permanently remove your account, scores and progress.</p>
          <div className="mt-auto">
            <Button variant="danger" icon={Trash2} onClick={deleteAccount}>Delete account</Button>
          </div>
        </Card>
      </div>

      <p role="alert" className="min-h-[1.55em] text-sm text-danger-fg">{message}</p>
    </Page>
  );
}

function StatCard({ icon, label, value, unit, coral, footer, className }: { icon: LucideIcon; label: string; value: React.ReactNode; unit?: string; coral?: boolean; footer?: React.ReactNode; className?: string }) {
  const I = icon;
  return (
    <Card className={className}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-fg-2">{label}</span>
        <span className={cn("grid size-9 place-items-center rounded-full", coral ? "bg-peach text-on-mint" : "bg-raised text-accent-fg")}>
          <I size={18} aria-hidden />
        </span>
      </div>
      <Metric value={value} unit={unit} />
      {footer}
    </Card>
  );
}

function SettingRow({ icon, title, meta, children }: { icon: LucideIcon; title: string; meta: string; children: React.ReactNode }) {
  return (
    <ListRow
      className="flex-wrap px-0 py-4"
      leading={<IconTile icon={icon} />}
      title={title}
      meta={meta}
      trailing={children}
    />
  );
}

function DashboardSkeleton({ message }: { message: string }) {
  return (
    <Page aria-busy={!message}>
      {message ? (
        <p role="alert" className="text-sm text-danger-fg">{message}</p>
      ) : (
        <p role="status" className="sr-only">Loading…</p>
      )}
      <Skeleton className="h-12 w-64 rounded-full" />
      <div className="grid gap-5 lg:grid-cols-12 lg:gap-6">
        <Skeleton className="h-56 rounded-card lg:col-span-8" />
        <Skeleton className="h-56 rounded-card lg:col-span-4" />
        <Skeleton className="h-36 rounded-card lg:col-span-4" />
        <Skeleton className="h-36 rounded-card lg:col-span-4" />
        <Skeleton className="h-36 rounded-card lg:col-span-4" />
      </div>
    </Page>
  );
}
