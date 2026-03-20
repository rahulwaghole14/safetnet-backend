import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  Camera,
  CreditCard,
  Mail,
  MapPinned,
  Mic,
  Shield,
  Smartphone,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy | SafeTNet",
  description: "Privacy policy for the SafeTNet User App.",
};

const dataCategories = [
  "Account information such as name, email address, phone number, and profile details.",
  "Precise and background location for live location, geofencing, SOS, and safety workflows.",
  "Emergency contact details that a user adds inside the app.",
  "Photos, videos, audio, and related media created or uploaded inside the app.",
  "Device, app, crash, and diagnostic data used to keep the service reliable and secure.",
  "Subscription and purchase status data associated with Google Play billing.",
];

const permissionItems = [
  {
    icon: Camera,
    title: "Camera",
    description: "Used to capture photos or evidence when the user chooses to do so.",
  },
  {
    icon: Mic,
    title: "Microphone",
    description: "Used for in-app audio recording where supported by app features.",
  },
  {
    icon: MapPinned,
    title: "Location",
    description: "Used for live tracking, geofencing, and emergency assistance features.",
  },
  {
    icon: Smartphone,
    title: "Phone, SMS, and media",
    description: "Used for user-initiated emergency calling, messaging, and media selection.",
  },
];

const usageItems = [
  "Create and manage user accounts.",
  "Provide SOS alerts, live location sharing, evidence capture, and geofence monitoring.",
  "Send notifications, alerts, and service messages.",
  "Enable premium subscription features and verify Google Play purchases.",
  "Improve app performance, security, and reliability.",
  "Comply with legal obligations and valid law-enforcement requests.",
];

const sharingItems = [
  "Infrastructure and service providers that help operate the app.",
  "Google Play for subscription billing and purchase verification.",
  "Firebase and related Google services for notifications and app functionality.",
  "Emergency contacts or intended recipients when the user triggers SOS or sharing features.",
  "Authorities where disclosure is required by law or necessary to protect safety, rights, or property.",
];

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_32%),linear-gradient(160deg,_#050816_0%,_#0f172a_48%,_#111827_100%)] text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.15] bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Admin Login
          </Link>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">
            Public Policy Page
          </span>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-white/[0.12] bg-white/[0.08] p-8 shadow-[0_24px_80px_rgba(15,23,42,0.45)] backdrop-blur-xl sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.4fr_0.8fr]">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-3 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-4 py-2 text-sm font-medium text-indigo-100">
                <Shield className="h-4 w-4" />
                SafeTNet User App Privacy Policy
              </div>
              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
                  How SafeTNet handles personal, safety, and subscription data.
                </h1>
                <p className="max-w-3xl text-base leading-7 text-slate-200 sm:text-lg">
                  This privacy policy applies to the SafeTNet User App. It explains what information may
                  be collected, how it is used, when it is shared, and what choices users have.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-3xl border border-white/10 bg-slate-950/[0.35] p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Effective Date</p>
                <p className="mt-3 text-xl font-semibold text-white">March 18, 2026</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-slate-950/[0.35] p-5">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-sky-300" />
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Contact</p>
                    <a
                      href="mailto:support@safetnet.site"
                      className="mt-2 inline-block text-base font-medium text-white transition hover:text-sky-300"
                    >
                      support@safetnet.site
                    </a>
                  </div>
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-slate-950/[0.35] p-5">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-amber-300" />
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Billing</p>
                    <p className="mt-2 text-sm leading-6 text-slate-200">
                      Premium subscriptions are purchased and managed through Google Play.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-[28px] border border-white/[0.12] bg-slate-950/[0.45] p-7 backdrop-blur-xl">
            <h2 className="text-2xl font-semibold text-white">Information we may collect</h2>
            <ul className="mt-5 space-y-4 text-sm leading-7 text-slate-200 sm:text-base">
              {dataCategories.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-2 h-2.5 w-2.5 rounded-full bg-sky-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-[28px] border border-white/[0.12] bg-slate-950/[0.45] p-7 backdrop-blur-xl">
            <h2 className="text-2xl font-semibold text-white">Permissions used by the app</h2>
            <div className="mt-5 grid gap-4">
              {permissionItems.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="rounded-3xl border border-white/10 bg-white/[0.06] p-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="rounded-2xl bg-indigo-500/[0.15] p-3 text-indigo-200">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-white">{title}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-300">{description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[28px] border border-white/[0.12] bg-white/[0.07] p-7 backdrop-blur-xl">
            <h2 className="text-2xl font-semibold text-white">How information is used</h2>
            <ul className="mt-5 space-y-4 text-sm leading-7 text-slate-200 sm:text-base">
              {usageItems.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-2 h-2.5 w-2.5 rounded-full bg-violet-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-[28px] border border-white/[0.12] bg-white/[0.07] p-7 backdrop-blur-xl">
            <h2 className="text-2xl font-semibold text-white">When information may be shared</h2>
            <ul className="mt-5 space-y-4 text-sm leading-7 text-slate-200 sm:text-base">
              {sharingItems.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-2 h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <article className="rounded-[28px] border border-white/[0.12] bg-slate-950/[0.45] p-6 backdrop-blur-xl">
            <h2 className="text-xl font-semibold text-white">Data retention</h2>
            <p className="mt-4 text-sm leading-7 text-slate-200">
              Personal information is kept only as long as needed to operate the service, support safety
              workflows, meet legal obligations, resolve disputes, and enforce agreements.
            </p>
          </article>

          <article className="rounded-[28px] border border-white/[0.12] bg-slate-950/[0.45] p-6 backdrop-blur-xl">
            <h2 className="text-xl font-semibold text-white">User choices</h2>
            <p className="mt-4 text-sm leading-7 text-slate-200">
              Users may deny certain permissions, manage subscriptions through Google Play, and contact
              SafeTNet to request access, correction, or deletion of data where applicable.
            </p>
          </article>

          <article className="rounded-[28px] border border-white/[0.12] bg-slate-950/[0.45] p-6 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-amber-300" />
              <h2 className="text-xl font-semibold text-white">Updates to this policy</h2>
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-200">
              This page may be updated over time. The latest version will stay available at this same
              public URL with a revised effective date.
            </p>
          </article>
        </section>

        <section className="rounded-[32px] border border-white/[0.12] bg-gradient-to-r from-indigo-500/[0.15] via-sky-500/10 to-cyan-400/[0.15] p-7 backdrop-blur-xl">
          <h2 className="text-2xl font-semibold text-white">Contact SafeTNet</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-100 sm:text-base">
            Questions about this privacy policy or personal data handling can be sent to{" "}
            <a href="mailto:support@safetnet.site" className="font-semibold text-sky-200 underline underline-offset-4">
              support@safetnet.com
            </a>.
          </p>
        </section>
      </div>
    </main>
  );
}
