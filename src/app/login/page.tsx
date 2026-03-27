"use client";

import React, { FormEvent, useMemo, useState } from "react";
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
    <section className="min-h-screen bg-gradient-to-br from-red-300 via-red-200 to-zinc-100 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-10">
        <div className="grid w-full overflow-hidden rounded-2xl border border-red-400/80 bg-red-50/85 shadow-2xl backdrop-blur md:grid-cols-2">
          <div className="hidden flex-col justify-between border-r border-red-200/80 bg-red-100/70 p-10 md:flex">
            <div>
              <div className="mb-4 flex items-center justify-end">
                <label className="mr-2 text-xs font-medium text-red-700">{t("common.language")}:</label>
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value as "en" | "vi")}
                  className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs text-red-700 outline-none ring-red-400 focus:ring-2"
                >
                  <option value="en">{t("common.english")}</option>
                  <option value="vi">{t("common.vietnamese")}</option>
                </select>
              </div>
              <p className="mb-3 inline-flex rounded-full border border-red-300 bg-red-200/80 px-3 py-1 text-xs uppercase tracking-[0.2em] text-red-700">
                Mira Admin
              </p>
              <h1 className="text-4xl font-semibold leading-tight text-[rgb(173,8,8)]">
                {t("login.leftTitleLine1")}
              </h1>
              <p className="mt-4 max-w-sm text-sm text-red-700/90">
                {t("login.leftDescription")}
              </p>
            </div>
          </div>

          <div className="p-6 sm:p-10">
            <div className="mb-4 flex items-center justify-end md:hidden">
              <label className="mr-2 text-xs font-medium text-red-700">{t("common.language")}:</label>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as "en" | "vi")}
                className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs text-red-700 outline-none ring-red-400 focus:ring-2"
              >
                <option value="en">{t("common.english")}</option>
                <option value="vi">{t("common.vietnamese")}</option>
              </select>
            </div>
            <h2 className="text-2xl font-semibold text-[rgb(173,8,8)]">{t("login.title")}</h2>
            <p className="mt-2 text-sm text-zinc-600">
              {t("login.subtitle", { step })}
            </p>

            {message && (
              <p className="mt-4 rounded-lg border border-emerald-700/40 bg-white px-3 py-2 text-sm text-emerald-700">
                {message}
              </p>
            )}

            {errorMessage && (
              <p className="mt-4 rounded-lg border border-red-700/50 bg-white px-3 py-2 text-sm text-red-700">
                {errorMessage}
              </p>
            )}

            {step === 1 ? (
              <form className="mt-6 space-y-4" onSubmit={onRequestCode}>
                <div>
                  <label className="mb-1 block text-sm text-zinc-700">{t("login.credentialType")}</label>
                  <select
                    className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-zinc-800 outline-none ring-red-400 transition focus:ring-2"
                    value={credentialType}
                    onChange={(e) => setCredentialType(e.target.value as LoginCredentialKey)}
                  >
                    <option value="email">Email</option>
                    <option value="identifier">Identifier</option>
                    <option value="uname">Username</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm text-zinc-700">{t("login.credential")}</label>
                  <input
                    value={credentialValue}
                    onChange={(e) => setCredentialValue(e.target.value)}
                    className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-zinc-800 outline-none ring-red-400 placeholder:text-zinc-500 transition focus:ring-2"
                    placeholder={t("login.enterCredential", { credentialType })}
                    autoComplete="username"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm text-zinc-700">{t("login.password")}</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-zinc-800 outline-none ring-red-400 placeholder:text-zinc-500 transition focus:ring-2"
                    placeholder={t("login.enterPassword")}
                    autoComplete="current-password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!canSubmitStep1 || submitting}
                  className="w-full rounded-lg border-0 bg-[rgb(173,8,8)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[rgb(150,7,7)] disabled:cursor-not-allowed disabled:bg-red-900"
                >
                  {submitting ? t("login.sendingCode") : t("login.sendCode")}
                </button>
              </form>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={onVerifyCode}>
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                  <p>
                    {t("login.loginFor")}: <span className="font-medium">{credentialValue}</span>
                  </p>
                  {retryAfterSec !== null && (
                    <p className="mt-1 text-zinc-600">{t("login.retryAfter", { seconds: retryAfterSec })}</p>
                  )}
                  {expiresAt && <p className="mt-1 text-zinc-600">{t("login.expiresAt", { expiresAt })}</p>}
                </div>

                <div>
                  <label className="mb-1 block text-sm text-zinc-700">{t("login.verificationCode")}</label>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-zinc-800 outline-none ring-red-400 placeholder:text-zinc-500 transition focus:ring-2"
                    placeholder={t("login.enterCode")}
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setStep(1);
                      setCode("");
                      setErrorMessage("");
                      setMessage("");
                    }}
                    className="w-1/2 rounded-lg border-0 bg-red-100 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-200"
                  >
                    {t("login.back")}
                  </button>
                  <button
                    type="submit"
                    disabled={!canSubmitStep2 || submitting}
                    className="w-1/2 rounded-lg border-0 bg-[rgb(173,8,8)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[rgb(150,7,7)] disabled:cursor-not-allowed disabled:bg-red-900"
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
