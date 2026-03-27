"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createUser, updateUser } from "@/services/AuthService";
import axiosClient from "@/utils/axiosClient";
import { useLang } from "@/lang";
import { useAuth } from "@/hooks/useAuth";

type ManagedUser = {
  uid: number;
  identifier: string;
  uname: string;
  email: string;
  level: string;
  status: string;
};

export default function UserManagementPage() {
  const router = useRouter();
  const { user, isChecking } = useAuth();
  const { t } = useLang();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [level, setLevel] = useState<"colleague" | "client">("colleague");

  const [updateLevel, setUpdateLevel] = useState<"" | "colleague" | "client">("");
  const [status, setStatus] = useState<"" | "active" | "block">("");
  const [updatePassword, setUpdatePassword] = useState("");

  const tr = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    setError("");
    try {
      const response = await axiosClient.get("/users/list");
      const payload = response?.data?.data;
      const source = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.items)
          ? payload.items
          : [];
      const normalized: ManagedUser[] = source
        .map((item: any) => ({
          uid: Number(item?.uid ?? item?.id ?? 0),
          identifier: String(item?.identifier ?? ""),
          uname: String(item?.uname ?? item?.username ?? ""),
          email: String(item?.email ?? ""),
          level: String(item?.level ?? ""),
          status: String(item?.status ?? ""),
        }))
        .filter((item: ManagedUser) => item.uid > 0);
      setUsers(normalized);
    } catch (e: any) {
      setUsers([]);
      setError(e?.response?.data?.message || tr("account.loadUsersError", "Could not load users."));
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (isChecking) return;
    if (user?.level !== "owner") {
      router.replace("/");
      return;
    }
    void loadUsers();
  }, [isChecking, user?.level]);

  if (isChecking || user?.level !== "owner") {
    return null;
  }

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => a.uid - b.uid);
  }, [users]);

  const onCreateUser = async () => {
    setError("");
    setMessage("");
    try {
      const res = await createUser({ username, email, password, level });
      setMessage(res.data?.message || tr("account.saved", "Saved successfully."));
      setUsername("");
      setEmail("");
      setPassword("");
      setLevel("colleague");
      setShowCreateModal(false);
      await loadUsers();
    } catch (e: any) {
      setError(e?.response?.data?.message || tr("account.saveError", "Could not save."));
    }
  };

  const openEditModal = (user: ManagedUser) => {
    setEditingUser(user);
    setUpdateLevel((user.level === "colleague" || user.level === "client" ? user.level : "") as "" | "colleague" | "client");
    setStatus((user.status === "active" || user.status === "block" ? user.status : "") as "" | "active" | "block");
    setUpdatePassword("");
  };

  const onUpdateUser = async () => {
    if (!editingUser) return;
    setError("");
    setMessage("");
    try {
      const res = await updateUser(editingUser.uid, {
        level: updateLevel || undefined,
        status: status || undefined,
        password: updatePassword || undefined,
      });
      setMessage(res.data?.message || tr("account.saved", "Saved successfully."));
      setEditingUser(null);
      await loadUsers();
    } catch (e: any) {
      setError(e?.response?.data?.message || tr("account.saveError", "Could not save."));
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="rounded-xl border border-red-200 bg-white p-4">
        <h1 className="text-2xl font-semibold text-[rgb(173,8,8)]">
          {tr("account.userManagementTitle", "User management")}
        </h1>
        <p className="text-sm text-zinc-600">
          {tr("account.userManagementSubtitle", "Owner actions: create and update subordinate users.")}
        </p>
      </div>

      {message && <p className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-emerald-700">{message}</p>}
      {error && <p className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-red-700">{error}</p>}

      <section className="w-full rounded-xl border border-red-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[rgb(173,8,8)]">
            {tr("account.userList", "User list")}
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void loadUsers()}
              className="rounded border border-red-300 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-red-50"
            >
              {tr("account.reload", "Reload")}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="rounded bg-[rgb(173,8,8)] px-3 py-2 text-sm text-white hover:bg-[rgb(150,7,7)]"
            >
              {tr("account.createUser", "Create user")}
            </button>
          </div>
        </div>
        <div className="w-full overflow-x-auto rounded-lg border border-red-200 shadow-sm">
          <table className="w-full min-w-[880px] table-auto divide-y divide-red-200 text-sm">
            <thead className="bg-red-50 text-zinc-700">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">{tr("account.uid", "UID")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">{tr("account.identifier", "Identifier")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">{tr("account.username", "Username")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">{tr("account.email", "Email")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">{tr("account.level", "Level")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">{tr("account.status", "Status")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">{tr("account.actions", "Actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-red-100 bg-white">
              {loadingUsers ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-zinc-500">
                    {tr("account.loadingUsers", "Loading users...")}
                  </td>
                </tr>
              ) : sortedUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-zinc-500">
                    {tr("account.noUsers", "No users found.")}
                  </td>
                </tr>
              ) : (
                sortedUsers.map((user) => (
                  <tr key={user.uid} className="hover:bg-red-50/40">
                    <td className="whitespace-nowrap px-3 py-2">{user.uid}</td>
                    <td className="whitespace-nowrap px-3 py-2">{user.identifier || "-"}</td>
                    <td className="whitespace-nowrap px-3 py-2">{user.uname}</td>
                    <td className="px-3 py-2">{user.email}</td>
                    <td className="whitespace-nowrap px-3 py-2">{user.level}</td>
                    <td className="whitespace-nowrap px-3 py-2">{user.status}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {user.level !== "owner" && (
                        <button
                          type="button"
                          onClick={() => openEditModal(user)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded border border-red-300 text-zinc-700 hover:bg-red-50"
                          aria-label={tr("account.updateUser", "Update user")}
                          title={tr("account.updateUser", "Update user")}
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                            <path d="M4 20h4l10-10-4-4L4 16v4Z" stroke="currentColor" strokeWidth="1.8" />
                            <path d="m13 7 4 4" stroke="currentColor" strokeWidth="1.8" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showCreateModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-xl rounded-xl border border-red-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[rgb(173,8,8)]">{tr("account.createUser", "Create user")}</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100"
                aria-label={tr("account.close", "Close")}
                title={tr("account.close", "Close")}
              >
                x
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input className="rounded border border-red-300 px-3 py-2 text-sm" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={tr("account.username", "Username")} />
              <input className="rounded border border-red-300 px-3 py-2 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tr("account.email", "Email")} />
              <input type="password" className="rounded border border-red-300 px-3 py-2 text-sm" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={tr("account.password", "Password")} />
              <select className="rounded border border-red-300 px-3 py-2 text-sm" value={level} onChange={(e) => setLevel(e.target.value as "colleague" | "client")}>
                <option value="colleague">{tr("account.colleague", "colleague")}</option>
                <option value="client">{tr("account.client", "client")}</option>
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreateModal(false)} className="rounded border border-red-300 px-3 py-2 text-sm text-zinc-700 hover:bg-red-50">{tr("login.back", "Back")}</button>
              <button onClick={() => void onCreateUser()} className="rounded bg-[rgb(173,8,8)] px-4 py-2 text-sm text-white hover:bg-[rgb(150,7,7)]">
                {tr("account.createUserAction", "Create user")}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-xl rounded-xl border border-red-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[rgb(173,8,8)]">
                {tr("account.updateUser", "Update user")} #{editingUser.uid}
              </h3>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100"
                aria-label={tr("account.close", "Close")}
                title={tr("account.close", "Close")}
              >
                x
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="rounded border border-red-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700"
                value={String(editingUser.uid)}
                readOnly
                placeholder={tr("account.uid", "UID")}
              />
              <input
                className="rounded border border-red-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700"
                value={editingUser.uname}
                readOnly
                placeholder={tr("account.username", "Username")}
              />
              <input
                className="rounded border border-red-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 md:col-span-2"
                value={editingUser.email}
                readOnly
                placeholder={tr("account.email", "Email")}
              />
              <input
                className="rounded border border-red-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 md:col-span-2"
                value={editingUser.identifier || ""}
                readOnly
                placeholder={tr("account.identifier", "Identifier")}
              />
              <select className="rounded border border-red-300 px-3 py-2 text-sm" value={updateLevel} onChange={(e) => setUpdateLevel(e.target.value as any)}>
                <option value="">{tr("account.levelOptional", "level (optional)")}</option>
                <option value="colleague">{tr("account.colleague", "colleague")}</option>
                <option value="client">{tr("account.client", "client")}</option>
              </select>
              <select className="rounded border border-red-300 px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                <option value="">{tr("account.statusOptional", "status (optional)")}</option>
                <option value="active">{tr("account.active", "active")}</option>
                <option value="block">{tr("account.block", "block")}</option>
              </select>
              <input
                type="password"
                className="rounded border border-red-300 px-3 py-2 text-sm md:col-span-2"
                value={updatePassword}
                onChange={(e) => setUpdatePassword(e.target.value)}
                placeholder={tr("account.passwordOptional", "password (optional)")}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingUser(null)} className="rounded border border-red-300 px-3 py-2 text-sm text-zinc-700 hover:bg-red-50">{tr("login.back", "Back")}</button>
              <button onClick={() => void onUpdateUser()} className="rounded bg-[rgb(173,8,8)] px-4 py-2 text-sm text-white hover:bg-[rgb(150,7,7)]">
                {tr("account.updateUserAction", "Update user")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
