"use client";

import React, { FormEvent, useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { requestLoginCode, verifyLoginCode } from "@/services/AuthService";
import { useAuth } from "@/hooks/useAuth";
import { useLang } from "@/lang";

type LoginCredentialKey = "email" | "identifier" | "uname";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { t, lang, setLang } = useLang();

  const [credentialType, setCredentialType] = useState<LoginCredentialKey>("email");
  const [credentialValue, setCredentialValue] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [retryAfterSec, setRetryAfterSec] = useState<number | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const canSubmitStep1 = useMemo(() => {
    return credentialValue.trim().length > 0 && password.trim().length >= 6;
  }, [credentialValue, password]);

  const canSubmitStep2 = useMemo(() => {
    return code.trim().length > 0;
  }, [code]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === 2) {
      timer = setInterval(() => {
        setRetryAfterSec((prev) => {
          if (prev === null || prev <= 0) {
            clearInterval(timer);
            return prev === null ? null : 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [step]);

  const onRequestCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmitStep1 || submitting) return;

    setSubmitting(true);
    setErrorMessage("");
    setMessage("");

    try {
      const response = await requestLoginCode({
        key: credentialType,
        value: credentialValue.trim(),
        password: password.trim(),
      });

      setStep(2);
      setMessage(response.data.message || t("login.requestCodeSuccess"));
      setRetryAfterSec(response.data.retryAfterSec ?? null);
      setExpiresAt(response.data.expiresAt ?? null);
    } catch (error: any) {
      const apiMessage =
        error?.response?.data?.message || t("login.requestCodeError");
      setErrorMessage(apiMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const onVerifyCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmitStep2 || submitting) return;

    setSubmitting(true);
    setErrorMessage("");
    setMessage("");

    try {
      await verifyLoginCode({
        key: credentialType,
        value: credentialValue.trim(),
        code: code.trim(),
      });

      login();
      router.push("/chat");
    } catch (error: any) {
      const apiMessage =
        error?.response?.data?.message || t("login.verifyCodeError");
      setErrorMessage(apiMessage);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="group relative flex min-h-screen items-center justify-center overflow-hidden bg-white text-zinc-900 selection:bg-red-200 selection:text-red-900">
      {/* Dynamic Background Elements */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 contrast-150 mix-blend-overlay"></div>
      <div className="absolute -left-40 top-0 h-96 w-96 animate-pulse rounded-full bg-red-100 opacity-60 mix-blend-multiply blur-3xl filter transition-opacity duration-1000"></div>
      <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-red-50 opacity-60 mix-blend-multiply blur-3xl filter"></div>
      
      <div className="relative z-10 w-full max-w-5xl p-4 sm:p-6 lg:p-8">
        <div className="flex w-full flex-col overflow-hidden rounded-[2rem] border border-white/60 bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl ring-1 ring-zinc-200/50 md:flex-row">
          
          {/* Left Side: Branding / Messaging */}
          <div className="relative hidden w-full flex-col justify-between bg-zinc-50/50 p-10 md:flex md:w-5/12 lg:w-1/2">
            <div className="relative z-10">
              <div className="mb-6 flex items-center justify-start">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[rgb(173,8,8)] to-red-600 font-bold text-white shadow-lg shadow-red-500/30">
                  M
                </div>
              </div>
              <h1 className="mt-8 bg-gradient-to-br from-zinc-900 to-zinc-600 bg-clip-text text-4xl font-extrabold leading-tight tracking-tight text-transparent lg:text-5xl">
                {t("login.leftTitleLine1")}
              </h1>
              <p className="mt-6 max-w-sm text-base leading-relaxed text-zinc-500">
                {t("login.leftDescription")}
              </p>
            </div>
            
            <div className="relative z-10 mt-12 flex items-center justify-between">
               <p className="inline-flex items-center rounded-full border border-red-200/50 bg-red-50 px-3 py-1.5 text-xs font-semibold tracking-widest text-[rgb(173,8,8)]">
                  MIRA ADMIN
               </p>
               <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value as "en" | "vi")}
                  className="cursor-pointer appearance-none rounded-lg border border-zinc-200/60 bg-white/80 px-3 py-1.5 text-xs font-medium text-zinc-600 outline-none backdrop-blur-sm transition-all hover:bg-white focus:border-red-300 focus:ring-4 focus:ring-red-500/10"
               >
                  <option value="en">🇺🇸 EN</option>
                  <option value="vi">🇻🇳 VI</option>
               </select>
            </div>
          </div>

          {/* Right Side: Form */}
          <div className="w-full bg-white p-8 sm:p-12 md:w-7/12 lg:w-1/2">
            <div className="mb-8 flex flex-col md:hidden">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[rgb(173,8,8)] to-red-600 font-bold text-white shadow-md shadow-red-500/20">
                  M
                </div>
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value as "en" | "vi")}
                  className="cursor-pointer appearance-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600 outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-500/10"
                >
                  <option value="en">🇺🇸 EN</option>
                  <option value="vi">🇻🇳 VI</option>
                </select>
              </div>
            </div>

            <div className="mb-10 text-center md:text-left">
              <h2 className="text-3xl font-bold tracking-tight text-zinc-900">{t("login.title")}</h2>
              <p className="mt-2 text-sm text-zinc-500">
                {t("login.subtitle", { step })}
              </p>
            </div>

            {message && (
              <div className="mb-6 animate-in slide-in-from-top-2 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-sm text-sm text-emerald-800">
                {message}
              </div>
            )}

            {errorMessage && (
              <div className="mb-6 animate-in slide-in-from-top-2 rounded-xl border border-red-100 bg-red-50/50 p-4 shadow-sm text-sm text-red-800">
                {errorMessage}
              </div>
            )}

            {step === 1 ? (
              <form className="space-y-5" onSubmit={onRequestCode}>
                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-700">{t("login.credentialType")}</label>
                  <select
                    className="w-full appearance-none rounded-xl border border-zinc-200 bg-zinc-50/50 px-4 py-3.5 text-sm text-zinc-800 outline-none transition-all focus:border-[rgb(173,8,8)] focus:bg-white focus:ring-4 focus:ring-red-500/10"
                    value={credentialType}
                    onChange={(e) => setCredentialType(e.target.value as LoginCredentialKey)}
                  >
                    <option value="email">Email</option>
                    <option value="identifier">Identifier</option>
                    <option value="uname">Username</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-700">{t("login.credential")}</label>
                  <input
                    value={credentialValue}
                    onChange={(e) => setCredentialValue(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-4 py-3.5 text-sm text-zinc-800 outline-none transition-all placeholder:text-zinc-400 focus:border-[rgb(173,8,8)] focus:bg-white focus:ring-4 focus:ring-red-500/10"
                    placeholder={t("login.enterCredential", { credentialType })}
                    autoComplete="username"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-700">{t("login.password")}</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-4 py-3.5 text-sm text-zinc-800 outline-none transition-all placeholder:text-zinc-400 focus:border-[rgb(173,8,8)] focus:bg-white focus:ring-4 focus:ring-red-500/10"
                    placeholder={t("login.enterPassword")}
                    autoComplete="current-password"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={!canSubmitStep1 || submitting}
                    className="group relative flex w-full items-center justify-center overflow-hidden rounded-xl bg-zinc-900 px-4 py-4 text-sm font-semibold text-white transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      {submitting ? t("login.sendingCode") : t("login.sendCode")}
                      {!submitting && (
                        <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      )}
                    </span>
                    {!submitting && (
                      <div className="absolute inset-0 z-0 bg-gradient-to-r from-[rgb(173,8,8)] to-red-600 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <form className="space-y-6 animate-in slide-in-from-right-4" onSubmit={onVerifyCode}>
                <div className="rounded-xl border border-[rgb(173,8,8)]/20 bg-red-50/50 p-4 text-sm text-[rgb(173,8,8)]">
                  <p className="font-medium">
                    {t("login.loginFor")}: <span className="font-bold">{credentialValue}</span>
                  </p>
                  {retryAfterSec !== null && retryAfterSec > 0 && (
                    <p className="mt-1.5 text-red-600/80">{t("login.retryAfter", { seconds: retryAfterSec })}</p>
                  )}
                  {expiresAt && <p className="mt-1.5 text-red-600/80">{t("login.expiresAt", { expiresAt })}</p>}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-700">{t("login.verificationCode")}</label>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full bg-zinc-50/50 rounded-xl border border-zinc-200 px-4 py-3.5 text-lg font-mono tracking-widest text-center text-zinc-800 outline-none transition-all placeholder:text-zinc-300 focus:border-[rgb(173,8,8)] focus:bg-white focus:ring-4 focus:ring-red-500/10"
                    placeholder="••••••"
                    maxLength={6}
                    autoFocus
                  />
                </div>

                <div className="flex gap-4 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStep(1);
                      setCode("");
                      setErrorMessage("");
                      setMessage("");
                    }}
                    className="flex w-[40%] items-center justify-center rounded-xl bg-white px-4 py-4 text-sm font-semibold text-zinc-600 border border-zinc-200 shadow-sm transition-all hover:bg-zinc-50 hover:text-zinc-900"
                  >
                    {t("login.back")}
                  </button>
                  <button
                    type="submit"
                    disabled={!canSubmitStep2 || submitting}
                    className="group relative flex flex-1 items-center justify-center overflow-hidden rounded-xl bg-[rgb(173,8,8)] px-4 py-4 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition-all hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none"
                  >
                    {submitting ? t("login.verifying") : t("login.verifyLogin")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
