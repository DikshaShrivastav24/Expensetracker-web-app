// ═══════════════════════════════════════════════════════════════════════════════
// ExpenseIQ – Full App with Supabase Auth + Database
//
// SETUP INSTRUCTIONS:
// 1. Go to https://supabase.com → create a free project
// 2. In Supabase dashboard → SQL Editor → run this SQL:
//
//    create table transactions (
//      id         uuid primary key default gen_random_uuid(),
//      user_id    uuid references auth.users not null,
//      type       text not null check (type in ('income','expense')),
//      amount     numeric not null,
//      category   text not null,
//      note       text default '',
//      date       date not null,
//      created_at timestamptz default now()
//    );
//    alter table transactions enable row level security;
//    create policy "Users manage own transactions"
//      on transactions for all using (auth.uid() = user_id);
//
// 3. In Supabase → Settings → API → copy Project URL and anon key
// 4. Replace SUPABASE_URL and SUPABASE_ANON_KEY below
// 5. npm install @supabase/supabase-js
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// ── Supabase Client ────────────────────────────────────────────────────────────
const SUPABASE_URL      = "https://pdkwxvzlmqivxgwbkuaf.supabase.co";   // ← replace
const SUPABASE_ANON_KEY = "sb_publishable_S-053I_Kn-UEi9Mbp6w9fQ_kZsYKO4r";                       // ← replace

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Types ──────────────────────────────────────────────────────────────────────
interface Transaction {
  id: string;
  user_id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  note: string;
  date: string;
  created_at?: string;
}

interface FormState {
  type: "income" | "expense";
  amount: string;
  category: string;
  note: string;
  date: string;
}

// ── Palette ────────────────────────────────────────────────────────────────────
const C = {
  bg: "#0f0f17", surface: "#16161f", card: "#1c1c28", border: "#2a2a3a",
  accent: "#7c6af7", accent2: "#f7a26a", accent3: "#4ecca3", accent4: "#f76a8a",
  text: "#e8e8f0", muted: "#7070a0", income: "#4ecca3", expense: "#f76a8a",
};

const CATEGORIES = [
  { id: "food",          label: "Food",          emoji: "🍔", color: "#f7a26a" },
  { id: "travel",        label: "Travel",        emoji: "✈️", color: "#7c6af7" },
  { id: "bills",         label: "Bills",         emoji: "📄", color: "#f76a8a" },
  { id: "entertainment", label: "Entertainment", emoji: "🎬", color: "#ffd166" },
  { id: "health",        label: "Health",        emoji: "💊", color: "#4ecca3" },
  { id: "shopping",      label: "Shopping",      emoji: "🛍️", color: "#06d6a0" },
  { id: "education",     label: "Education",     emoji: "📚", color: "#118ab2" },
  { id: "other",         label: "Other",         emoji: "💡", color: "#aaa"    },
];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function getCat(id: string) { return CATEGORIES.find(c => c.id === id) || CATEGORIES[7]; }

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number) => "₹" + Number(n).toLocaleString("en-IN");

// Parse "YYYY-MM-DD" safely without UTC timezone shifting (fixes IST +5:30 offset bug)
function parseLocalDate(str: string): Date {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function filterByRange(
  items: Transaction[], range: string, from: string, to: string
): Transaction[] {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return items.filter(t => {
    const d = parseLocalDate(t.date);
    if (range === "week") {
      const w = new Date(today); w.setDate(today.getDate() - 7);
      return d >= w && d <= today;
    }
    if (range === "month") return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    if (range === "year")  return d.getFullYear() === today.getFullYear();
    if (range === "custom" && from && to) return d >= parseLocalDate(from) && d <= parseLocalDate(to);
    return true;
  });
}

// ── Shared styles ──────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", background: C.bg, border: `1px solid ${C.border}`,
  borderRadius: 10, color: C.text, fontSize: 14, outline: "none", marginTop: 4,
  fontFamily: "inherit",
};
const labelStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", fontSize: 13, color: C.muted, fontWeight: 600,
};

// ── Tiny UI ────────────────────────────────────────────────────────────────────
const Badge = ({ color, children }: { color: string; children: React.ReactNode }) => (
  <span style={{ background: color+"22", color, borderRadius: 99, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>
    {children}
  </span>
);

const Pill = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} style={{
    padding: "6px 16px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
    background: active ? C.accent : C.border, color: active ? "#fff" : C.muted, transition: "all .2s",
  }}>{children}</button>
);

function Spinner() {
  return (
    <div style={{ display: "inline-block", width: 18, height: 18, border: `2px solid #fff4`, borderTop: `2px solid #fff`, borderRadius: "50%", animation: "spin .7s linear infinite" }} />
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH PAGE
// ══════════════════════════════════════════════════════════════════════════════
function AuthPage({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode]         = useState<"login"|"signup">("login");
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [pass, setPass]         = useState("");
  const [err, setErr]           = useState("");
  const [info, setInfo]         = useState("");
  const [loading, setLoading]   = useState(false);
  const [showPass, setShowPass] = useState(false);

  const switchMode = (m: "login"|"signup") => { setMode(m); setErr(""); setInfo(""); setName(""); setEmail(""); setPass(""); };

  const submit = async () => {
    setErr(""); setInfo("");
    if (!email.trim() || !pass.trim()) { setErr("Please fill all fields."); return; }
    if (!/\S+@\S+\.\S+/.test(email))  { setErr("Enter a valid email address."); return; }
    if (pass.length < 6)              { setErr("Password must be at least 6 characters."); return; }
    setLoading(true);

    if (mode === "signup") {
      if (!name.trim()) { setErr("Please enter your full name."); setLoading(false); return; }
      const { data, error } = await supabase.auth.signUp({
        email, password: pass,
        options: { data: { full_name: name.trim() } },
      });
      setLoading(false);
      if (error) { setErr(error.message); return; }
      if (data.user && !data.session) {
        setInfo("Check your email to confirm your account, then sign in.");
      } else if (data.user) {
        onLogin(data.user);
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
      setLoading(false);
      if (error) { setErr(error.message); return; }
      if (data.user) onLogin(data.user);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "grid", placeItems: "center", padding: 16, fontFamily: "'DM Sans','Segoe UI',sans-serif", color: C.text }}>
      <div style={{ position: "fixed", top: -120, left: -120, width: 420, height: 420, borderRadius: "50%", background: C.accent+"14", filter: "blur(90px)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: -120, right: -120, width: 420, height: 420, borderRadius: "50%", background: C.accent2+"14", filter: "blur(90px)", pointerEvents: "none" }} />

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 24, padding: "38px 34px", width: "100%", maxWidth: 430, position: "relative", zIndex: 1, boxShadow: "0 32px 80px #000a" }}>
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <div style={{ width: 62, height: 62, borderRadius: 20, background: `linear-gradient(135deg,${C.accent},${C.accent2})`, display: "grid", placeItems: "center", fontSize: 32, margin: "0 auto 14px", boxShadow: `0 8px 28px ${C.accent}44` }}>₹</div>
          <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: "-0.5px" }}>ExpenseIQ</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
            {mode === "login" ? "Welcome back! Sign in to continue." : "Create your free account to get started."}
          </div>
        </div>

        <div style={{ display: "flex", background: C.bg, borderRadius: 12, padding: 4, marginBottom: 26 }}>
          {(["login","signup"] as const).map(m => (
            <button key={m} onClick={() => switchMode(m)} style={{
              flex: 1, padding: "11px 0", borderRadius: 9, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14, transition: "all .2s",
              background: mode === m ? C.accent : "transparent", color: mode === m ? "#fff" : C.muted,
            }}>{m === "login" ? "Sign In" : "Sign Up"}</button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {mode === "signup" && (
            <label style={labelStyle}>Full Name
              <input value={name} onChange={e => setName(e.target.value)} placeholder="John Doe"
                style={inputStyle} onKeyDown={e => e.key === "Enter" && submit()} />
            </label>
          )}
          <label style={labelStyle}>Email Address
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com"
              style={inputStyle} onKeyDown={e => e.key === "Enter" && submit()} />
          </label>
          <label style={labelStyle}>Password
            <div style={{ position: "relative" }}>
              <input type={showPass ? "text" : "password"} value={pass} onChange={e => setPass(e.target.value)}
                placeholder="Min. 6 characters" style={{ ...inputStyle, paddingRight: 46 }}
                onKeyDown={e => e.key === "Enter" && submit()} />
              <button onClick={() => setShowPass(p => !p)} style={{
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 17, paddingTop: 3,
              }}>{showPass ? "🙈" : "👁"}</button>
            </div>
          </label>
        </div>

        {err && (
          <div style={{ marginTop: 14, padding: "11px 14px", background: C.expense+"18", border: `1px solid ${C.expense}44`, borderRadius: 10, color: C.expense, fontSize: 13 }}>
            ⚠ {err}
          </div>
        )}
        {info && (
          <div style={{ marginTop: 14, padding: "11px 14px", background: C.income+"18", border: `1px solid ${C.income}44`, borderRadius: 10, color: C.income, fontSize: 13 }}>
            ✓ {info}
          </div>
        )}

        <button onClick={submit} disabled={loading} style={{
          width: "100%", marginTop: 22, padding: "14px 0", borderRadius: 12, border: "none", cursor: loading ? "not-allowed" : "pointer",
          background: `linear-gradient(135deg,${C.accent},${C.accent2})`, color: "#fff", fontWeight: 800, fontSize: 16,
          boxShadow: `0 4px 24px ${C.accent}44`, display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          opacity: loading ? 0.8 : 1,
        }}>
          {loading ? <Spinner /> : (mode === "login" ? "Sign In →" : "Create Account →")}
        </button>

        <p style={{ textAlign: "center", marginTop: 18, fontSize: 13, color: C.muted }}>
          {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          <span onClick={() => switchMode(mode === "login" ? "signup" : "login")}
            style={{ color: C.accent, cursor: "pointer", fontWeight: 700 }}>
            {mode === "login" ? "Sign Up" : "Sign In"}
          </span>
        </p>

        {/* Demo hint */}
        <div style={{ marginTop: 20, padding: "10px 14px", background: C.accent+"11", border: `1px solid ${C.accent}33`, borderRadius: 10, fontSize: 12, color: C.muted, textAlign: "center" }}>
          💡 Make sure you've configured your Supabase credentials at the top of App.tsx
        </div>
      </div>
      <style>{`* { box-sizing:border-box; margin:0; padding:0; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ROOT
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check existing session
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    // Listen to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center", color: C.muted }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>₹</div>
          <Spinner />
        </div>
        <style>{`* { box-sizing:border-box; margin:0; padding:0; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) return <AuthPage onLogin={u => setUser(u)} />;

  return (
    <MainApp
      user={user}
      onLogout={async () => {
        await supabase.auth.signOut();
        setUser(null);
      }}
    />
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════════════════════
function MainApp({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tab, setTab]               = useState("dashboard");
  const [txns, setTxns]             = useState<Transaction[]>([]);
  const [dbLoading, setDbLoading]   = useState(true);
  const [range, setRange]           = useState("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo]     = useState("");
  const [filterCat, setFilterCat]   = useState("all");
  const [showModal, setShowModal]   = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [toast, setToast]           = useState<{ msg: string; type: string } | null>(null);
  const [form, setForm]             = useState<FormState>({
    type: "expense", amount: "", category: "food", note: "",
    date: new Date().toISOString().split("T")[0],
  });

  const userName = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
  const initials = userName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);

  // ── Load transactions from Supabase ──────────────────────────────────────────
  const loadTxns = useCallback(async () => {
    setDbLoading(true);
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("date", { ascending: false });
    if (!error && data) setTxns(data as Transaction[]);
    setDbLoading(false);
  }, [user.id]);

  useEffect(() => { loadTxns(); }, [loadTxns]);

  // ── Real-time subscription ────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("transactions-changes")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "transactions",
        filter: `user_id=eq.${user.id}`,
      }, () => loadTxns())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user.id, loadTxns]);

  const showToast = (msg: string, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  // ── Filtered & computed data ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = filterByRange(txns, range, customFrom, customTo);
    if (filterCat !== "all") list = list.filter(t => t.category === filterCat);
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [txns, range, customFrom, customTo, filterCat]);

  const totals = useMemo(() => {
    const base    = filterByRange(txns, range, customFrom, customTo);
    const income  = base.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expense = base.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    return { income, expense, net: income - expense };
  }, [txns, range, customFrom, customTo]);

  const pieData = useMemo(() => {
    const base = filterByRange(txns, range, customFrom, customTo).filter(t => t.type === "expense");
    const map: Record<string, number> = {};
    base.forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount; });
    return Object.entries(map).map(([cat, val]) => ({ name: getCat(cat).label, value: val, color: getCat(cat).color }));
  }, [txns, range, customFrom, customTo]);

  const barData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }).map((_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const m = d.getMonth(); const y = d.getFullYear();
      const month = txns.filter(t => { const td = new Date(t.date); return td.getMonth() === m && td.getFullYear() === y; });
      return {
        name: MONTHS[m],
        Income: month.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0),
        Expense: month.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0),
      };
    });
  }, [txns]);

  // ── Add transaction ───────────────────────────────────────────────────────────
  const addTxn = async () => {
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) {
      showToast("Enter a valid amount", "error");
      return;
    }
    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      type: form.type,
      amount: parseFloat(form.amount),
      category: form.category,
      note: form.note,
      date: form.date,
    });
    if (error) { showToast("Failed to save: " + error.message, "error"); return; }
    setForm({ type: "expense", amount: "", category: "food", note: "", date: new Date().toISOString().split("T")[0] });
    setShowModal(false);
    showToast("Transaction added ✓", "success");
  };

  // ── Delete transaction ────────────────────────────────────────────────────────
  const deleteTxn = async (id: string) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) { showToast("Delete failed: " + error.message, "error"); return; }
    showToast("Deleted", "info");
  };

  // ── Clear all ─────────────────────────────────────────────────────────────────
  const clearAll = async () => {
    if (!window.confirm("Clear ALL your transactions? This cannot be undone.")) return;
    const { error } = await supabase.from("transactions").delete().eq("user_id", user.id);
    if (error) { showToast("Clear failed", "error"); return; }
    showToast("All data cleared", "info");
  };

  const TABS = [
    { id: "dashboard",    label: "Dashboard",    icon: "◈" },
    { id: "transactions", label: "Transactions", icon: "↕" },
    { id: "charts",       label: "Charts",       icon: "◉" },
  ];

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", background: C.bg, minHeight: "100vh", color: C.text }}>
      {/* Header */}
      <header style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50, overflow: "visible" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg,${C.accent},${C.accent2})`, display: "grid", placeItems: "center", fontSize: 18 }}>₹</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>ExpenseIQ</div>
            <div style={{ fontSize: 11, color: C.muted }}>Hi, {userName.split(" ")[0]} 👋</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
          <button onClick={clearAll} style={{ background: C.border, color: C.muted, border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            🗑 Clear
          </button>
          <button onClick={onLogout} style={{ background: C.expense+"22", color: C.expense, border: `1px solid ${C.expense}44`, borderRadius: 10, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            🚪 Sign Out
          </button>
          <button onClick={() => setShowModal(true)} style={{
            background: `linear-gradient(135deg,${C.accent},${C.accent2})`, color: "#fff", border: "none",
            borderRadius: 10, padding: "10px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer",
            boxShadow: `0 4px 20px ${C.accent}44`,
          }}>+ Add</button>

          <div style={{ position: "relative" }}>
            <div onClick={() => setShowProfile(p => !p)} style={{
              width: 38, height: 38, borderRadius: "50%", background: `linear-gradient(135deg,${C.accent},${C.accent2})`,
              display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14, cursor: "pointer", userSelect: "none", color: "#fff",
            }}>{initials}</div>

            {showProfile && (
              <div style={{ position: "absolute", right: 0, top: 50, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, minWidth: 220, boxShadow: "0 12px 40px #0009", zIndex: 200, overflow: "hidden" }}>
                <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: `linear-gradient(135deg,${C.accent},${C.accent2})`, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14, color: "#fff" }}>{initials}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{userName}</div>
                      <div style={{ fontSize: 12, color: C.muted }}>{user.email}</div>
                    </div>
                  </div>
                </div>
                <div style={{ padding: "8px 18px 6px", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>ACCOUNT</div>
                  <div style={{ fontSize: 13, color: C.income }}>✓ Database connected</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{txns.length} transactions stored</div>
                </div>
                <button onClick={() => { setShowProfile(false); onLogout(); }} style={{
                  width: "100%", padding: "14px 18px", background: "none", border: "none", cursor: "pointer",
                  color: C.expense, fontWeight: 700, fontSize: 14, textAlign: "left", display: "flex", alignItems: "center", gap: 10,
                }}>🚪 Sign Out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Nav */}
      <nav style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "0 24px", display: "flex", gap: 4 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "14px 20px", background: "none", border: "none", cursor: "pointer",
            fontWeight: tab === t.id ? 700 : 500, fontSize: 14, color: tab === t.id ? C.accent : C.muted,
            borderBottom: tab === t.id ? `2px solid ${C.accent}` : "2px solid transparent", transition: "all .2s",
          }}>{t.icon} {t.label}</button>
        ))}
      </nav>

      {/* Filters */}
      <div style={{ padding: "14px 24px", background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: C.muted, marginRight: 4 }}>Period:</span>
        {["week","month","year","all","custom"].map(r =>
          <Pill key={r} active={range === r} onClick={() => setRange(r)}>{r.charAt(0).toUpperCase() + r.slice(1)}</Pill>
        )}
        {range === "custom" && <>
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
          <span style={{ color: C.muted }}>–</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
        </>}
        <span style={{ fontSize: 12, color: C.muted, marginLeft: 12, marginRight: 4 }}>Category:</span>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 12px", marginTop: 0 }}>
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
        </select>
      </div>

      {/* Content */}
      <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
        {dbLoading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: C.muted }}>
            <Spinner /> <div style={{ marginTop: 12 }}>Loading your data…</div>
          </div>
        ) : (
          <>
            {tab === "dashboard"    && <DashboardTab    totals={totals} filtered={filtered} deleteTxn={deleteTxn} pieData={pieData} />}
            {tab === "transactions" && <TransactionsTab filtered={filtered} deleteTxn={deleteTxn} />}
            {tab === "charts"       && <ChartsTab       pieData={pieData} barData={barData} totals={totals} filtered={filtered} />}
          </>
        )}
      </main>

      {showModal && <TxnModal form={form} setForm={setForm} onAdd={addTxn} onClose={() => setShowModal(false)} />}
      {showProfile && <div onClick={() => setShowProfile(false)} style={{ position: "fixed", inset: 0, zIndex: 100 }} />}

      {toast && (
        <div style={{
          position: "fixed", bottom: 28, right: 28, zIndex: 999, animation: "slideUp .3s ease",
          background: toast.type === "error" ? C.expense : toast.type === "success" ? C.income : C.accent,
          color: "#fff", padding: "12px 24px", borderRadius: 12, fontWeight: 600, fontSize: 14, boxShadow: "0 8px 32px #0008",
        }}>{toast.msg}</div>
      )}

      <style>{`
        @keyframes slideUp { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar{width:6px} ::-webkit-scrollbar-track{background:#111} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:99px}
      `}</style>
    </div>
  );
}

// ── Dashboard Tab ──────────────────────────────────────────────────────────────
function DashboardTab({ totals, filtered, deleteTxn, pieData }: {
  totals: { income: number; expense: number; net: number };
  filtered: Transaction[];
  deleteTxn: (id: string) => void;
  pieData: { name: string; value: number; color: string }[];
}) {
  const cards = [
    { label: "Total Income",   value: totals.income,  color: C.income,  icon: "↑" },
    { label: "Total Expenses", value: totals.expense, color: C.expense, icon: "↓" },
    { label: "Net Savings",    value: totals.net,     color: totals.net >= 0 ? C.income : C.expense, icon: "◈" },
  ];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16, marginBottom: 24 }}>
        {cards.map(c => (
          <div key={c.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 16, right: 16, width: 40, height: 40, borderRadius: 12, background: c.color+"22", display: "grid", placeItems: "center", fontSize: 20, color: c.color }}>{c.icon}</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: c.color, letterSpacing: "-1px" }}>{fmt(c.value)}</div>
            <div style={{ position: "absolute", bottom: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: c.color+"0a" }} />
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Spending by Category</div>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={70} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                  {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 16 }}>Financial Health</div>
          {(() => {
            const rate    = totals.income > 0 ? ((totals.net / totals.income) * 100).toFixed(1) : "0";
            const expRate = totals.income > 0 ? ((totals.expense / totals.income) * 100).toFixed(1) : "0";
            const expList = filtered.filter(t => t.type === "expense");
            const avgExp  = expList.length > 0 ? expList.reduce((s, t) => s + t.amount, 0) / expList.length : 0;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Meter label="Savings Rate"  value={rate}    max={100} color={C.income}  suffix="%" />
                <Meter label="Expense Ratio" value={expRate} max={100} color={C.expense} suffix="%" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
                  <StatBox label="Transactions" value={filtered.length} />
                  <StatBox label="Avg Expense"  value={fmt(Math.round(avgExp))} />
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 14 }}>Recent Transactions</div>
        {filtered.length === 0 ? <EmptyState /> : filtered.slice(0, 6).map(t => <TxnRow key={t.id} t={t} onDelete={deleteTxn} />)}
      </div>
    </div>
  );
}

// ── Transactions Tab ───────────────────────────────────────────────────────────
function TransactionsTab({ filtered, deleteTxn }: { filtered: Transaction[]; deleteTxn: (id: string) => void }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
      <div style={{ fontWeight: 700, marginBottom: 14 }}>All Transactions ({filtered.length})</div>
      {filtered.length === 0 ? <EmptyState /> : filtered.map(t => <TxnRow key={t.id} t={t} onDelete={deleteTxn} />)}
    </div>
  );
}

// ── Charts Tab ─────────────────────────────────────────────────────────────────
function ChartsTab({ pieData, barData, totals, filtered }: {
  pieData: { name: string; value: number; color: string }[];
  barData: { name: string; Income: number; Expense: number }[];
  totals: { income: number; expense: number; net: number };
  filtered: Transaction[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Income vs Expenses — Last 6 Months</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>Monthly comparison overview</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={barData} barGap={4}>
            <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => "₹" + v / 1000 + "k"} />
            <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }} />
            <Legend wrapperStyle={{ fontSize: 13, color: C.muted }} />
            <Bar dataKey="Income"  fill={C.income}  radius={[6, 6, 0, 0]} />
            <Bar dataKey="Expense" fill={C.expense} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Category Breakdown</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Where your money goes</div>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3}>
                    {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {pieData.map(d => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: d.color }} />
                      <span style={{ fontSize: 13 }}>{d.name}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: d.color }}>{fmt(d.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <EmptyState />}
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 16 }}>Period Summary</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { label: "Total Income",  val: fmt(totals.income),  color: C.income  },
              { label: "Total Expense", val: fmt(totals.expense), color: C.expense },
              { label: "Net Savings",   val: fmt(totals.net),     color: totals.net >= 0 ? C.income : C.expense },
              { label: "Transactions",  val: filtered.length,     color: C.accent  },
              { label: "Avg Daily Exp", val: fmt(Math.round(totals.expense / 30)), color: C.accent2 },
              { label: "Top Category",  val: (() => { if (!pieData.length) return "—"; return pieData.reduce((a, b) => a.value > b.value ? a : b).name; })(), color: C.accent3 },
            ].map(s => (
              <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: C.bg, borderRadius: 10 }}>
                <span style={{ fontSize: 13, color: C.muted }}>{s.label}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{s.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Transaction Row ────────────────────────────────────────────────────────────
function TxnRow({ t, onDelete }: { t: Transaction; onDelete: (id: string) => void }) {
  const cat = getCat(t.category);
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${C.border}22` }}>
      <div style={{ width: 38, height: 38, borderRadius: 12, background: cat.color+"22", display: "grid", placeItems: "center", fontSize: 18, flexShrink: 0 }}>{cat.emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.note || cat.label}</div>
        <div style={{ fontSize: 12, color: C.muted }}>{t.date} · <Badge color={cat.color}>{cat.label}</Badge></div>
      </div>
      <div style={{ fontWeight: 700, fontSize: 16, color: t.type === "income" ? C.income : C.expense, marginRight: 8 }}>
        {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
      </div>
      {hov && <button onClick={() => onDelete(t.id)} style={{ background: C.expense+"22", color: C.expense, border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 14 }}>✕</button>}
    </div>
  );
}

// ── Add Transaction Modal ──────────────────────────────────────────────────────
function TxnModal({ form, setForm, onAdd, onClose }: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onAdd: () => void;
  onClose: () => void;
}) {
  const f = (k: keyof FormState, v: string) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000a", display: "grid", placeItems: "center", zIndex: 100, padding: 16 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 24px 80px #000a" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Add Transaction</div>
          <button onClick={onClose} style={{ background: C.border, border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: C.text, fontSize: 18 }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 18, background: C.bg, borderRadius: 12, padding: 4 }}>
          {(["expense","income"] as const).map(type => (
            <button key={type} onClick={() => f("type", type)} style={{
              flex: 1, padding: "10px 0", borderRadius: 9, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14, transition: "all .2s",
              background: form.type === type ? (type === "income" ? C.income : C.expense) : "transparent",
              color: form.type === type ? "#fff" : C.muted,
            }}>{type === "income" ? "↑ Income" : "↓ Expense"}</button>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={labelStyle}>Amount (₹)
            <input type="number" value={form.amount} onChange={e => f("amount", e.target.value)} placeholder="0.00" style={inputStyle} />
          </label>
          <label style={labelStyle}>Category
            <select value={form.category} onChange={e => f("category", e.target.value)} style={inputStyle}>
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
            </select>
          </label>
          <label style={labelStyle}>Note
            <input type="text" value={form.note} onChange={e => f("note", e.target.value)} placeholder="Optional note…" style={inputStyle} />
          </label>
          <label style={labelStyle}>Date
            <input type="date" value={form.date} onChange={e => f("date", e.target.value)} style={inputStyle} />
          </label>
        </div>
        <button onClick={onAdd} style={{
          width: "100%", marginTop: 20, padding: "14px 0", borderRadius: 12, border: "none", cursor: "pointer",
          background: `linear-gradient(135deg,${C.accent},${C.accent2})`, color: "#fff", fontWeight: 800, fontSize: 16,
          boxShadow: `0 4px 24px ${C.accent}44`,
        }}>Save to Database</button>
      </div>
    </div>
  );
}

// ── Mini Helpers ───────────────────────────────────────────────────────────────
function Meter({ label, value, max, color, suffix }: { label: string; value: string | number; max: number; color: string; suffix: string }) {
  const pct = Math.min(Math.abs(Number(value)), max);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
        <span style={{ color: C.muted }}>{label}</span>
        <span style={{ fontWeight: 700, color }}>{value}{suffix}</span>
      </div>
      <div style={{ height: 8, background: C.border, borderRadius: 99 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width .6s ease" }} />
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: C.bg, borderRadius: 10, padding: "10px 14px", textAlign: "center" }}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{value}</div>
    </div>
  );
}

function EmptyState() {
  return <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 14 }}>No transactions in this period</div>;
}