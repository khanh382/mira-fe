"use client";

import React from "react";
import { useLang } from "@/lang";

export default function Header() {
  const { t, lang, setLang } = useLang();

  return (
    <div className="flex items-center justify-between bg-[rgb(173,8,8)] p-4">
      <h1 className="text-2xl font-bold text-white">Mira Admin</h1>
      <div className="flex items-center gap-2">
        <label className="text-sm text-red-100">{t("common.language")}:</label>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as "en" | "vi")}
          className="rounded border border-red-300 bg-white px-2 py-1 text-sm text-red-700"
        >
          <option value="en">{t("common.english")}</option>
          <option value="vi">{t("common.vietnamese")}</option>
        </select>
      </div>
    </div>
  );
}
