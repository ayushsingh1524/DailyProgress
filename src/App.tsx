import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { isCloudConfigured, supabase } from "./supabase";

type Status = "completed" | "skipped" | "forgot" | "unmarked";
type Task = {
  id: string;
  title: string;
  time: string;
  duration: number;
  icon: string;
  detail: string;
};
type Day = {
  tasks: Record<string, { status: Status; note: string }>;
  goal: string;
  reflection: {
    learned: string;
    struggle: string;
    improve: string;
    rating: number;
  };
};
type Data = {
  months: Record<string, Record<number, Day>>;
  theme: "light" | "dark";
  colorTheme?: string;
  days?: Record<number, Day>;
};

const tasks: Task[] = [
  {
    id: "dsa",
    title: "DSA",
    time: "09:00 AM – 11:00 AM",
    duration: 2,
    icon: "🔥",
    detail: "New Learning + Problems",
  },
  {
    id: "system",
    title: "System Design",
    time: "02:00 PM – 04:00 PM",
    duration: 2,
    icon: "🏗️",
    detail: "Architecture & real-world systems",
  },
  {
    id: "revision",
    title: "DSA Revision",
    time: "05:00 PM – 06:00 PM",
    duration: 1,
    icon: "🔄",
    detail: "Active recall & old problems",
  },
  {
    id: "development",
    title: "Development",
    time: "07:00 PM – 09:00 PM",
    duration: 2,
    icon: "💻",
    detail: "New technology & projects",
  },
];
const key = "study-challenge-v1";
const newDay = (): Day => ({
  tasks: Object.fromEntries(
    tasks.map((t) => [t.id, { status: "unmarked" as Status, note: "" }]),
  ),
  goal: "",
  reflection: { learned: "", struggle: "", improve: "", rating: 0 },
});
const getDaysInMonth = (yyyymm: string) => { const [y, m] = yyyymm.split("-"); return new Date(Number(y), Number(m), 0).getDate(); };
const currentMonthStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const generateMonth = (yyyymm: string) => Object.fromEntries(Array.from({ length: getDaysInMonth(yyyymm) }, (_, i) => [i + 1, newDay()]));
const initial = (): Data => ({
  months: { [currentMonthStr()]: generateMonth(currentMonthStr()) },
  theme: "light",
});
const load = (): Data => {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (!saved) return initial();
    let data = { ...initial(), ...saved };
    // Migration from old days to months
    if (saved.days && !saved.months) {
      data.months = { [currentMonthStr()]: saved.days };
      delete data.days;
    }
    return normalize(data);
  } catch {
    return initial();
  }
};
const normalize = (value: any): Data => {
  const fresh = initial();
  if (!value) return fresh;
  let months = value.months || {};
  if (value.days && Object.keys(months).length === 0) {
     months = { [currentMonthStr()]: value.days };
  }
  const normalizedMonths: Record<string, Record<number, Day>> = {};
  for (const monthKey of Object.keys(months)) {
    const freshMonth = generateMonth(monthKey);
    normalizedMonths[monthKey] = Object.fromEntries(
      Object.entries(freshMonth).map(([n, d]) => [
        n,
        {
          ...d,
          ...months[monthKey][Number(n)],
          tasks: { ...d.tasks, ...months[monthKey][Number(n)]?.tasks },
          reflection: { ...d.reflection, ...months[monthKey][Number(n)]?.reflection },
        }
      ])
    );
  }
  return { ...fresh, ...value, months: normalizedMonths };
};

const completed = (day: Day) =>
  tasks.filter((t) => day.tasks[t.id].status === "completed").length;
const hours = (day: Day) =>
  tasks.reduce(
    (sum, t) => sum + (day.tasks[t.id].status === "completed" ? t.duration : 0),
    0,
  );
const performance = (day: Day) => {
  const n = completed(day);
  return n === 4 ? "great" : n >= 2 ? "partial" : n ? "low" : "empty";
};

export default function App() {
  const [data, setData] = useState<Data>(load);
  const [viewedMonth, setViewedMonth] = useState(currentMonthStr());
  const [selected, setSelected] = useState(1);
  const TOTAL_DAYS = getDaysInMonth(viewedMonth);
  const activeDays = data.months[viewedMonth] || generateMonth(viewedMonth);
  const [page, setPage] = useState<
    "dashboard" | "overview" | "statistics" | "notes" | "sync" | "settings"
  >("dashboard");
  const [query, setQuery] = useState("");
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [cloudStatus, setCloudStatus] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(data));
    document.documentElement.dataset.theme = data.theme;
    document.documentElement.dataset.color = data.colorTheme || "green";
  }, [data]);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setCloudUser(data.user));
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => setCloudUser(session?.user ?? null),
    );
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (cloudUser && supabase) {
      supabase
        .from("tracker_data")
        .select("data")
        .eq("user_id", cloudUser.id)
        .maybeSingle()
        .then(({ data: row }) => {
          if (row?.data) setData(normalize(row.data as Data));
        });
    }
  }, [cloudUser]);
  const stats = useMemo(() => {
    const days = Object.values(activeDays);
    const all = days.flatMap((d) => Object.values(d.tasks));
    const qualifying = days.map((d) => completed(d) >= 3);
    let best = 0,
      run = 0;
    qualifying.forEach((ok) => {
      run = ok ? run + 1 : 0;
      best = Math.max(best, run);
    });
    let current = 0;
    for (let i = TOTAL_DAYS - 1; i >= 0 && qualifying[i]; i--) current++;
    const done = all.filter((t) => t.status === "completed").length;
    return {
      done,
      skipped: all.filter((t) => t.status === "skipped").length,
      forgot: all.filter((t) => t.status === "forgot").length,
      hours: days.reduce((n, d) => n + hours(d), 0),
      percent: Math.round((done / (TOTAL_DAYS * 4)) * 100),
      completedDays: days.filter((d) => completed(d) === 4).length,
      current,
      best,
    };
  }, [data]);
  const day = activeDays[selected];
  const updateDay = (fn: (d: Day) => Day) =>
    setData((prev) => {
      const monthData = prev.months[viewedMonth] || generateMonth(viewedMonth);
      return {
        ...prev,
        months: {
          ...prev.months,
          [viewedMonth]: {
            ...monthData,
            [selected]: fn(monthData[selected]),
          },
        },
      };
    });
  const setStatus = (id: string, status: Status) =>
    updateDay((d) => ({
      ...d,
      tasks: {
        ...d.tasks,
        [id]: {
          ...d.tasks[id],
          status: d.tasks[id].status === status ? "unmarked" : status,
        },
      },
    }));
  const setNote = (id: string, note: string) =>
    updateDay((d) => ({
      ...d,
      tasks: { ...d.tasks, [id]: { ...d.tasks[id], note } },
    }));
  const setGoal = (goal: string) => updateDay((d) => ({ ...d, goal }));
  const setReflection = (
    field: keyof Day["reflection"],
    value: string | number,
  ) =>
    updateDay((d) => ({
      ...d,
      reflection: { ...d.reflection, [field]: value },
    }));
  const signIn = async (email: string) => {
    if (!supabase) return;
    setCloudStatus("Sending sign-in link…");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setCloudStatus(
      error ? error.message : "Check your email for the secure sign-in link.",
    );
  };
  const saveCloud = async () => {
    if (!supabase || !cloudUser) return;
    setCloudStatus("Syncing…");
    const { error } = await supabase
      .from("tracker_data")
      .upsert({
        user_id: cloudUser.id,
        data,
        updated_at: new Date().toISOString(),
      });
    if (error) {
      setCloudStatus(error.message);
      alert("Sync failed: " + error.message);
    } else {
      setCloudStatus("Synced to the cloud.");
      alert("Progress synced to the cloud successfully!");
    }
  };
  const loadCloud = async () => {
    if (!supabase || !cloudUser) return;
    setCloudStatus("Loading…");
    const { data: row, error } = await supabase
      .from("tracker_data")
      .select("data")
      .eq("user_id", cloudUser.id)
      .maybeSingle();
    if (error) setCloudStatus(error.message);
    else if (row?.data) {
      setData(normalize(row.data as Data));
      setCloudStatus("Cloud progress loaded.");
      alert("Progress loaded successfully!");
    } else
      setCloudStatus("No cloud backup yet — choose Sync now to create one.");
  };
  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setCloudStatus("Signed out. Your local progress remains on this device.");
  };
  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "study-challenge-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportCsv = () => {
    let csv =
      "Day,Task,Status,Time,Duration (hrs),Notes,Goal,Learned,Struggle,Improve,Rating\n";
    Object.entries(activeDays).forEach(([n, day]) => {
      tasks.forEach((t) => {
        const item = day.tasks[t.id];
        const escape = (str: string) => `"${str.replace(/"/g, '""')}"`;
        csv += `${n},${escape(t.title)},${item.status},${escape(t.time)},${t.duration},${escape(item.note)},${escape(day.goal)},${escape(day.reflection.learned)},${escape(day.reflection.struggle)},${escape(day.reflection.improve)},${day.reflection.rating}\n`;
      });
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "study-progress.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  const importData = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const incoming = JSON.parse(String(reader.result));
        if (!incoming.days) throw new Error();
        setData(normalize(incoming));
        alert("Progress restored successfully.");
      } catch {
        alert("That file is not a valid tracker backup.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };
  const navigate = (next: number) => {
    setSelected(next);
    setPage("dashboard");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const DayPicker = () => (
    <div className="day-picker">
      <button
        onClick={() => navigate(Math.max(1, selected - 1))}
        disabled={selected === 1}
      >
        ← Previous
      </button>
      <button className="today" onClick={() => navigate(1)}>
        Today
      </button>
      <button
        onClick={() => navigate(Math.min(TOTAL_DAYS, selected + 1))}
        disabled={selected === TOTAL_DAYS}
      >
        Next →
      </button>
    </div>
  );
  const dashboard = (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">MONTHLY STUDY CHALLENGE</p>
          <h1>
            Build your consistency,
            <br />
            <em>one focused day at a time.</em>
          </h1>
          <p className="muted">
            Day {selected} of {TOTAL_DAYS} · Daily study target: 7 hours
          </p>
        </div>
        <div
          className="hero-ring"
          style={
            {
              "--progress": `${Math.round((completed(day) / 4) * 100)}%`,
            } as React.CSSProperties
          }
        >
          <strong>{Math.round((completed(day) / 4) * 100)}%</strong>
          <span>today</span>
        </div>
      </section>
      <section className="metrics">
        <Metric
          label="Current day"
          value={`${selected} / ${TOTAL_DAYS}`}
          icon="◷"
        />
        <Metric
          label="Study hours"
          value={`${stats.hours} / ${TOTAL_DAYS * 7}`}
          icon="◒"
        />
        <Metric
          label="Current streak"
          value={`${stats.current} days`}
          icon="🔥"
        />
        <Metric label="Best streak" value={`${stats.best} days`} icon="🏆" />
      </section>
      <div className="quick-sync card">
        <div>
          <strong>
            {cloudUser ? "Cloud sync ready" : "Keep your progress everywhere"}
          </strong>
          <span>
            {cloudUser
              ? "Save your latest progress securely."
              : "Sign in once to sync across devices."}
          </span>
        </div>
        <button onClick={cloudUser ? saveCloud : () => setPage("sync")}>
          {cloudUser ? "☁ Sync now" : "Set up sync"}
        </button>
      </div>
      <DailyGoal goal={day.goal} setGoal={setGoal} />
      <div className="section-title">
        <div>
          <p className="eyebrow">TODAY — DAY {selected}</p>
          <h2>Your study schedule</h2>
        </div>
        <DayPicker />
      </div>
      <div className="schedule">
        {tasks.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            item={day.tasks[t.id]}
            onStatus={setStatus}
            onNote={setNote}
          />
        ))}
      </div>
      <Reflection day={day} set={setReflection} />
    </>
  );
  const Overview = () => (
    <>
      <div className="page-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end' }}>
        <div>
          <p className="eyebrow">PROGRESS AT A GLANCE</p>
          <h1>Monthly overview</h1>
          <p className="muted">Click any day to review or update it.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)' }} onClick={() => {
            const [y, m] = viewedMonth.split('-');
            const prev = new Date(Number(y), Number(m) - 2, 1);
            setViewedMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
          }}>← Previous</button>
          <strong style={{ fontSize: '16px', minWidth: '100px', textAlign: 'center' }}>
            {new Date(viewedMonth + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })}
          </strong>
          <button style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)' }} onClick={() => {
            const [y, m] = viewedMonth.split('-');
            const next = new Date(Number(y), Number(m), 1);
            setViewedMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
          }}>Next →</button>
        </div>
      </div>
      <div className="overview-summary">
        <strong>{stats.completedDays}</strong>
        <span>perfect days</span>
        <strong>{stats.percent}%</strong>
        <span>overall completion</span>
      </div>
      <div className="calendar">
        {Array.from({ length: TOTAL_DAYS }, (_, i) => {
          const n = i + 1,
            d = activeDays[n],
            count = completed(d);
          return (
            <button
              key={n}
              onClick={() => navigate(n)}
              className={`calendar-day ${performance(d)} ${n === selected ? "active" : ""}`}
            >
              <span>DAY</span>
              <b>{String(n).padStart(2, "0")}</b>
              <small>{count ? `${count}/4 done` : "Not marked"}</small>
            </button>
          );
        })}
      </div>
      <div className="legend">
        <i className="great" /> 4/4 completed <i className="partial" /> Some
        progress <i className="low" /> Little progress <i className="empty" />{" "}
        Not marked
      </div>
    </>
  );
  const Statistics = () => (
    <>
      <div className="page-heading">
        <p className="eyebrow">YOUR CONSISTENCY</p>
        <h1>Statistics</h1>
      </div>
      <div className="stat-grid">
        <Metric label="Completion rate" value={`${stats.percent}%`} icon="◉" />
        <Metric
          label="Completed tasks"
          value={`${stats.done} / ${TOTAL_DAYS * 4}`}
          icon="✓"
        />
        <Metric label="Skipped tasks" value={String(stats.skipped)} icon="×" />
        <Metric label="Forgot tasks" value={String(stats.forgot)} icon="!" />
      </div>
      <section className="card chart">
        <div>
          <h2>Daily performance</h2>
          <p className="muted">Completed study blocks out of 4</p>
        </div>
        <div className="bars">
          {Array.from({ length: TOTAL_DAYS }, (_, i) => (
            <div
              key={i}
              title={`Day ${i + 1}: ${completed(activeDays[i + 1])}/4`}
            >
              <span
                style={{ height: `${completed(activeDays[i + 1]) * 25}%` }}
              />
              <small>{i + 1}</small>
            </div>
          ))}
        </div>
      </section>
    </>
  );
  const Notes = () => {
    const notes = Array.from({ length: TOTAL_DAYS }, (_, i) => i + 1)
      .flatMap((n) =>
        tasks
          .filter((t) => activeDays[n].tasks[t.id].note.trim())
          .map((t) => ({ n, t, note: activeDays[n].tasks[t.id].note })),
      )
      .filter((x) =>
        `${x.t.title} ${x.note}`.toLowerCase().includes(query.toLowerCase()),
      );
    return (
      <>
        <div className="page-heading">
          <p className="eyebrow">KNOWLEDGE LOG</p>
          <h1>Your study notes</h1>
          <input
            className="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes…"
          />
        </div>
        <div className="notes-list">
          {notes.length ? (
            notes.map(({ n, t, note }) => (
              <button
                className="note-card"
                key={`${n}-${t.id}`}
                onClick={() => navigate(n)}
              >
                <span>
                  DAY {n} · {t.title}
                </span>
                <p>{note}</p>
              </button>
            ))
          ) : (
            <div className="empty-state">
              No notes yet. Add a note from any task card and it will appear
              here.
            </div>
          )}
        </div>
      </>
    );
  };
  const Settings = () => (
    <>
      <div className="page-heading">
        <p className="eyebrow">PREFERENCES & BACKUP</p>
        <h1>Settings</h1>
      </div>
      <section className="settings card">
        <div>
          <h2>Appearance</h2>
          <p className="muted">Choose the view that feels most comfortable.</p>
        </div>
        <button
          onClick={() =>
            setData((d) => ({
              ...d,
              theme: d.theme === "light" ? "dark" : "light",
            }))
          }
        >
          Switch to {data.theme === "light" ? "dark" : "light"} mode
        </button>
        <div style={{ marginTop: "10px" }}>
          <p className="muted" style={{ marginBottom: "8px" }}>Color Theme</p>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {[
              { id: "green", label: "Original Green", code: "#1e6954" },
              { id: "orange", label: "Deep Orange", code: "#e65100" },
              { id: "blue", label: "Blue", code: "#1976d2" },
              { id: "purple", label: "Purple", code: "#6a1b9a" },
              { id: "black", label: "Black", code: "#212121" },
              { id: "whitepink", label: "White & Pink", code: "#ec407a" },
              { id: "babypink", label: "Baby Pink", code: "#f48fb1" },
            ].map((c) => (
              <button
                key={c.id}
                onClick={() => setData((d) => ({ ...d, colorTheme: c.id }))}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  backgroundColor: c.code,
                  minHeight: "0",
                  border: (data.colorTheme || "green") === c.id ? "3px solid var(--ink)" : "2px solid transparent",
                  outline: (data.colorTheme || "green") === c.id ? "2px solid var(--surface)" : "none",
                  outlineOffset: "-2px",
                  padding: 0,
                }}
                title={c.label}
              />
            ))}
          </div>
        </div>
        <hr />
        <div>
          <h2>Backup your progress</h2>
          <p className="muted">
            Export a copy or restore it on another device.
          </p>
        </div>
        <div className="actions">
          <button onClick={exportData}>Export backup file</button>
          <button onClick={exportCsv}>Export to Excel (CSV)</button>
          <button onClick={() => importRef.current?.click()}>
            Import backup
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json"
            onChange={importData}
            hidden
          />
        </div>
        <hr />
        <div className="danger">
          <h2>Reset Monthly Challenge</h2>
          <p>
            This permanently deletes statuses, notes, and reflections on this
            device.
          </p>
          <button
            onClick={() => {
              if (
                confirm(
                  "Are you sure? This will permanently delete your monthly progress, statuses, notes and reflections.",
                )
              ) {
                setData(initial());
                setSelected(1);
                setPage("dashboard");
              }
            }}
          >
            Reset challenge
          </button>
        </div>
      </section>
    </>
  );
  const Sync = () => (
    <>
      <div className="page-heading">
        <p className="eyebrow">YOUR DATA, EVERYWHERE</p>
        <h1>Cloud sync</h1>
        <p className="muted">
          Securely keep the same study history on your devices.
        </p>
      </div>
      <section className="settings card">
        <CloudSync
          configured={isCloudConfigured}
          user={cloudUser}
          status={cloudStatus}
          signIn={signIn}
          save={saveCloud}
          load={loadCloud}
          signOut={signOut}
        />
      </section>
    </>
  );
  const content =
    page === "dashboard" ? (
      dashboard
    ) : page === "overview" ? (
      <Overview />
    ) : page === "statistics" ? (
      <Statistics />
    ) : page === "notes" ? (
      <Notes />
    ) : page === "sync" ? (
      <Sync />
    ) : (
      <Settings />
    );
  const navItems = [
    ["dashboard", "Dashboard", "⌂"],
    ["overview", "Overview", "▦"],
    ["statistics", "Stats", "◔"],
    ["notes", "Notes", "▤"],
    ["sync", "Sync", "☁"],
    ["settings", "Settings", "⚙"],
  ] as const;
  return (
    <div className="app">
      <aside>
        <div className="brand">
          <span>◈</span> focus<span>.</span>
        </div>
        <nav>
          {navItems.map(([id, label, icon]) => (
            <button
              key={id}
              className={page === id ? "selected" : ""}
              onClick={() => setPage(id)}
            >
              <i>{icon}</i>
              {label}
            </button>
          ))}
        </nav>
        <div className="aside-bottom">
          7 hour daily target
          <br />
          <strong>Small steps. Real progress.</strong>
        </div>
      </aside>
      <main>
        <header>
          <div className="mobile-brand">
            ◈ focus<span>.</span>
          </div>
          <p className="date">PERSONAL STUDY SPACE</p>
          <button
            className="theme-toggle"
            onClick={() =>
              setData((d) => ({
                ...d,
                theme: d.theme === "light" ? "dark" : "light",
              }))
            }
          >
            {data.theme === "light" ? "☾" : "☀"}
          </button>
        </header>
        {page === "dashboard" && <FocusSprint />}
        {content}
      </main>
      <nav className="mobile-nav">
        {navItems.map(([id, label, icon]) => (
          <button
            key={id}
            className={page === id ? "selected" : ""}
            onClick={() => setPage(id)}
          >
            <i>{icon}</i>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="metric card">
      <span className="metric-icon">{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
function DailyGoal({
  goal,
  setGoal,
}: {
  goal: string;
  setGoal: (goal: string) => void;
}) {
  const [draft, setDraft] = useState(goal);
  useEffect(() => setDraft(goal), [goal]);
  return (
    <section className="daily-goal card">
      <div>
        <p className="eyebrow">DAILY GOAL</p>
        <h2>What is your one win today?</h2>
      </div>
      <input
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setGoal(e.target.value);
        }}
        placeholder="Example: Finish two binary-search problems"
      />
    </section>
  );
}
function CloudSync({
  configured,
  user,
  status,
  signIn,
  save,
  load,
  signOut,
}: {
  configured: boolean;
  user: User | null;
  status: string;
  signIn: (email: string) => void;
  save: () => void;
  load: () => void;
  signOut: () => void;
}) {
  const [email, setEmail] = useState("");
  if (!configured)
    return (
      <div className="cloud-sync">
        <h2>Cloud sync</h2>
        <p className="muted">
          Add your Supabase environment variables to enable secure cross-device
          sync.
        </p>
      </div>
    );
  return (
    <div className="cloud-sync">
      <h2>Cloud sync</h2>
      {user ? (
        <>
          <p className="muted">
            Signed in as {user.email}. Your data is private to your account.
          </p>
          <div className="actions">
            <button onClick={save}>Sync now</button>
            <button onClick={load}>Load cloud progress</button>
            <button onClick={signOut}>Sign out</button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">
            Sign in with an email link to use the same tracker across every
            device.
          </p>
          <div className="sync-login">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <button onClick={() => signIn(email)} disabled={!email}>
              Send sign-in link
            </button>
          </div>
        </>
      )}
      {status && <p className="sync-status">{status}</p>}
    </div>
  );
}
function TaskCard({
  task,
  item,
  onStatus,
  onNote,
}: {
  task: Task;
  item: { status: Status; note: string };
  onStatus: (id: string, s: Status) => void;
  onNote: (id: string, note: string) => void;
}) {
  const [expanded, setExpanded] = useState(Boolean(item.note));
  const [draft, setDraft] = useState(item.note);
  useEffect(() => {
    if (item.note !== draft) setDraft(item.note);
  }, [item.note]);
  const choices: [Status, string, string][] = [
    ["completed", "✓ Done", "done"],
    ["skipped", "× Skip", "skip"],
    ["forgot", "! Forgot", "forgot"],
  ];
  return (
    <article className={`task-card ${item.status}`}>
      <div className="task-main">
        <div className="task-time">{task.time}</div>
        <div className="task-title">
          <span>{task.icon}</span>
          <div>
            <h3>{task.title}</h3>
            <p>
              {task.detail} <b>· {task.duration}h</b>
            </p>
          </div>
        </div>
      </div>
      <div className="task-actions">
        {choices.map(([s, label, className]) => (
          <button
            key={s}
            className={`${className} ${item.status === s ? "chosen" : ""}`}
            onClick={() => onStatus(task.id, s)}
          >
            {label}
          </button>
        ))}
        <button className="note-button" onClick={() => setExpanded(!expanded)}>
          ⌕ {item.note ? "Edit notes" : "Add notes"}
        </button>
      </div>
      {expanded && (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onNote(task.id, e.target.value);
          }}
          onBlur={() => onNote(task.id, draft)}
          placeholder={`Add notes for ${task.title}…`}
          dir="ltr"
        />
      )}
    </article>
  );
}
function Reflection({
  day,
  set,
}: {
  day: Day;
  set: (f: keyof Day["reflection"], v: string | number) => void;
}) {
  const [draft, setDraft] = useState(day.reflection);
  useEffect(() => setDraft(day.reflection), [day.reflection]);
  const update = (field: "learned" | "struggle" | "improve", value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
    set(field, value);
  };
  return (
    <section className="reflection card">
      <p className="eyebrow">CLOSE THE DAY</p>
      <h2>Daily reflection</h2>
      <div className="reflection-grid">
        {(
          [
            ["learned", "What did I learn today?"],
            ["struggle", "What did I struggle with?"],
            ["improve", "What should I improve tomorrow?"],
          ] as const
        ).map(([field, label]) => (
          <label key={field}>
            {label}
            <textarea
              value={draft[field]}
              onChange={(e) => update(field, e.target.value)}
              placeholder="Optional…"
              dir="ltr"
            />
          </label>
        ))}
      </div>
      <div className="rating">
        Day rating:{" "}
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => set("rating", n)}
            className={n <= day.reflection.rating ? "rated" : ""}
          >
            ★
          </button>
        ))}
      </div>
    </section>
  );
}

let audioCtx: AudioContext | null = null;
function getAudioCtx() {
  if (!audioCtx)
    audioCtx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
function playAlarm() {
  const ctx = getAudioCtx();
  const beep = (time: number, freq: number, dur = 0.3) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = "square";
    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.start(time);
    osc.stop(time + dur);
  };
  const t = ctx.currentTime;
  beep(t, 880);
  beep(t + 0.35, 880);
  beep(t + 0.7, 1046.5);
  beep(t + 1.05, 1046.5);
  beep(t + 1.4, 1174.66, 0.5);
}
function FocusSprint() {
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [focusTask, setFocusTask] = useState(tasks[0].id);
  const [showDone, setShowDone] = useState(false);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(
      () =>
        setSeconds((s) => {
          if (s <= 1) {
            setRunning(false);
            playAlarm();
            setShowDone(true);
            return 0;
          }
          return s - 1;
        }),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [running]);
  useEffect(() => {
    if (!showDone) return;
    playAlarm();
    const beepInterval = window.setInterval(playAlarm, 10000);
    const autoStop = window.setTimeout(() => setShowDone(false), 60000);
    return () => {
      window.clearInterval(beepInterval);
      window.clearTimeout(autoStop);
    };
  }, [showDone]);
  const dismiss = () => setShowDone(false);
  const startSprint = () => {
    getAudioCtx();
    setRunning(!running);
  };
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const updateTime = (
    nextHours: number,
    nextMinutes: number,
    nextSeconds: number,
  ) => {
    setRunning(false);
    setSeconds(
      Math.min(23, Math.max(0, nextHours)) * 3600 +
        Math.min(59, Math.max(0, nextMinutes)) * 60 +
        Math.min(59, Math.max(0, nextSeconds)),
    );
  };
  const field = (
    label: string,
    value: number,
    max: number,
    change: (value: number) => void,
    unit: string,
  ) => (
    <label>
      <input
        aria-label={label}
        type="number"
        min="0"
        max={max}
        value={String(value).padStart(2, "0")}
        onChange={(e) => change(Number(e.target.value) || 0)}
        disabled={running}
      />
      <small>{unit}</small>
    </label>
  );
  return (
    <>
      <section className="focus-sprint card">
        <div>
          <p className="eyebrow">FOCUS SPRINT</p>
          <div className="timer-inputs">
            {field(
              "Sprint hours",
              hours,
              23,
              (value) => updateTime(value, minutes, secs),
              "h",
            )}
            <span>:</span>
            {field(
              "Sprint minutes",
              minutes,
              59,
              (value) => updateTime(hours, value, secs),
              "m",
            )}
            <span>:</span>
            {field(
              "Sprint seconds",
              secs,
              59,
              (value) => updateTime(hours, minutes, value),
              "s",
            )}
          </div>
          <p className="muted">Set your custom hours, minutes, and seconds</p>
        </div>
        <div className="focus-controls">
          <select
            aria-label="Focus task"
            value={focusTask}
            onChange={(e) => setFocusTask(e.target.value)}
            disabled={running}
          >
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.icon} {t.title}
              </option>
            ))}
          </select>
          <button className="sprint-start" onClick={startSprint}>
            {running ? "Pause" : seconds === 0 ? "Done" : "Start sprint"}
          </button>
        </div>
      </section>
      {showDone && (
        <div className="sprint-modal-overlay" onClick={dismiss}>
          <div
            className="sprint-modal card"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="sprint-modal-icon">🎉</span>
            <h2>Sprint Complete!</h2>
            <p className="muted">
              Great focus session! Take a short break before your next sprint.
            </p>
            <button className="sprint-modal-btn" onClick={dismiss}>
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
