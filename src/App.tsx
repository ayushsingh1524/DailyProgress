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
  pyqs?: string[];
  archived?: boolean;
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
  tasks: Task[];
  months: Record<string, Record<number, Day>>;
  theme: "light" | "dark";
  colorTheme?: string;
  days?: Record<number, Day>;
};

const DEFAULT_TASKS: Task[] = [
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
const newDay = (customTasks: Task[] = DEFAULT_TASKS): Day => ({
  tasks: Object.fromEntries(
    customTasks.map((t) => [t.id, { status: "unmarked" as Status, note: "" }]),
  ),
  goal: "",
  reflection: { learned: "", struggle: "", improve: "", rating: 0 },
});
const getDaysInMonth = (yyyymm: string) => { const [y, m] = yyyymm.split("-"); return new Date(Number(y), Number(m), 0).getDate(); };
const currentMonthStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const generateMonth = (yyyymm: string, customTasks: Task[] = DEFAULT_TASKS) => Object.fromEntries(Array.from({ length: getDaysInMonth(yyyymm) }, (_, i) => [i + 1, newDay(customTasks)]));
const initial = (): Data => ({
  tasks: DEFAULT_TASKS,
  months: { [currentMonthStr()]: generateMonth(currentMonthStr(), DEFAULT_TASKS) },
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
  let activeTasks = value.tasks || DEFAULT_TASKS;
  let months = value.months || {};
  if (value.days && Object.keys(months).length === 0) {
     months = { [currentMonthStr()]: value.days };
  }
  const normalizedMonths: Record<string, Record<number, Day>> = {};
  for (const monthKey of Object.keys(months)) {
    const freshMonth = generateMonth(monthKey, activeTasks);
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

const completed = (day: Day, tasksList: Task[]) =>
  tasksList.filter((t) => day.tasks[t.id]?.status === "completed").length;
const hours = (day: Day, tasksList: Task[]) =>
  tasksList.reduce(
    (sum, t) => sum + (day.tasks[t.id]?.status === "completed" ? t.duration : 0),
    0,
  );
const performance = (day: Day, tasksList: Task[]) => {
  const activeTasks = tasksList.filter(t => !t.archived);
  const n = completed(day, activeTasks);
  return n === activeTasks.length && activeTasks.length > 0 ? "great" : n >= Math.ceil(activeTasks.length / 2) ? "partial" : n ? "low" : "empty";
};

export default function App() {
  const [data, setData] = useState<Data>(load);
  const [viewedMonth, setViewedMonth] = useState(currentMonthStr());
  const [selected, setSelected] = useState(new Date().getDate());
  const TOTAL_DAYS = getDaysInMonth(viewedMonth);
  const activeDays = data.months[viewedMonth] || generateMonth(viewedMonth, data.tasks);
  const [page, setPage] = useState<
    "dashboard" | "schedule" | "overview" | "statistics" | "notes" | "sync" | "settings"
  >("dashboard"); // ADDED SCHEDULE PAGE
  const [query, setQuery] = useState("");
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [cloudStatus, setCloudStatus] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(data));
    document.documentElement.dataset.theme = data.theme;
    document.documentElement.dataset.color = data.colorTheme || "green";
  }, [data]);
  // Auto-advance to new day at midnight
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const todayMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      if (todayMonth !== viewedMonth || selected !== now.getDate()) {
        if (viewedMonth === currentMonthStr()) {
          setViewedMonth(todayMonth);
          setSelected(now.getDate());
        }
      }
    };
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [viewedMonth, selected]);
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
    const qualifying = days.map((d) => completed(d, data.tasks.filter(t => !t.archived)) >= Math.ceil(data.tasks.filter(t => !t.archived).length * 0.75));
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
      hours: days.reduce((n, d) => n + hours(d, data.tasks), 0),
      percent: Math.round((done / (TOTAL_DAYS * (data.tasks.filter(t => !t.archived).length || 1))) * 100),
      completedDays: days.filter((d) => completed(d, data.tasks.filter(t => !t.archived)) === data.tasks.filter(t => !t.archived).length).length,
      current,
      best,
    };
  }, [data]);
  const day = activeDays[selected];
  const updateDay = (fn: (d: Day) => Day) =>
    setData((prev) => {
      const monthData = prev.months[viewedMonth] || generateMonth(viewedMonth, prev.tasks);
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
      data.tasks.forEach((t) => {
        const item = day.tasks[t.id] || { status: 'unmarked', note: '' };
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
      <button className="today" onClick={() => { setViewedMonth(currentMonthStr()); navigate(new Date().getDate()); }}>
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
              "--progress": `${Math.round((completed(day, data.tasks.filter(t => !t.archived)) / (data.tasks.filter(t => !t.archived).length || 1)) * 100)}%`,
            } as React.CSSProperties
          }
        >
          <strong>{Math.round((completed(day, data.tasks.filter(t => !t.archived)) / (data.tasks.filter(t => !t.archived).length || 1)) * 100)}%</strong>
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
          value={`${stats.hours} / ${TOTAL_DAYS * (data.tasks.filter(t => !t.archived).reduce((acc, t) => acc + t.duration, 0) || 1)}`}
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
        {data.tasks.filter(t => !t.archived).map((t) => (
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
            count = completed(d, data.tasks.filter(t => !t.archived));
          return (
            <button
              key={n}
              onClick={() => navigate(n)}
              className={`calendar-day ${performance(d, data.tasks)} ${n === selected ? "active" : ""}`}
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
          <p className="muted">Completed blocks out of {data.tasks.filter(t => !t.archived).length}</p>
        </div>
        <div className="bars">
          {Array.from({ length: TOTAL_DAYS }, (_, i) => (
            <div
              key={i}
              title={`Day ${i + 1}: ${completed(activeDays[i + 1], data.tasks.filter(t => !t.archived))}/${data.tasks.filter(t => !t.archived).length}`}
            >
              <span
                style={{ height: `${(completed(activeDays[i + 1], data.tasks.filter(t => !t.archived)) / (data.tasks.filter(t => !t.archived).length || 1)) * 100}%` }}
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
        data.tasks
          .filter((t) => activeDays[n].tasks[t.id]?.note?.trim())
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
          <h2>🤖 AI Settings</h2>
          <p className="muted">✅ AI is enabled via server‑side proxy. No API key required.</p>
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
    ) : page === "schedule" ? (
      <ScheduleBuilder data={data} setData={setData} />
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
    ["schedule", "Schedule", "🗓️"],
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
          {data.tasks.filter(t => !t.archived).reduce((acc, t) => acc + t.duration, 0)} hour daily target
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
        {page === "dashboard" && <FocusSprint tasks={data.tasks} />}
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

function ScheduleBuilder({ data, setData }: { data: Data, setData: (data: Data | ((d: Data) => Data)) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Task>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string>("");
  const [syllabusText, setSyllabusText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeTasks = data.tasks.filter(t => !t.archived);

  const saveTask = () => {
    if (!draft.title || !draft.time) return;
    setData(prev => {
      const newTasks = [...prev.tasks];
      if (editingId && editingId !== "new") {
        const idx = newTasks.findIndex(t => t.id === editingId);
        if (idx !== -1) newTasks[idx] = { ...newTasks[idx], ...draft } as Task;
      } else {
        newTasks.push({ ...draft, id: Date.now().toString(), archived: false } as Task);
      }
      return { ...prev, tasks: newTasks };
    });
    setEditingId(null);
    setDraft({});
  };

  const archiveTask = (id: string) => {
    if (!confirm("Are you sure you want to remove this task? Past data will be preserved.")) return;
    setData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === id ? { ...t, archived: true } : t)
    }));
  };

  const moveTask = (index: number, direction: -1 | 1) => {
    if (index + direction < 0 || index + direction >= activeTasks.length) return;
    setData(prev => {
      const newTasks = [...prev.tasks];
      const idx1 = newTasks.findIndex(t => t.id === activeTasks[index].id);
      const idx2 = newTasks.findIndex(t => t.id === activeTasks[index + direction].id);
      const temp = newTasks[idx1];
      newTasks[idx1] = newTasks[idx2];
      newTasks[idx2] = temp;
      return { ...prev, tasks: newTasks };
    });
  };

  const loadPreset = (type: string) => {
    let presets: Task[] = [];
    if (type === 'medical') {
      presets = [
        { id: "med1", title: "Anatomy Revision", time: "08:00 AM – 10:00 AM", duration: 2, icon: "🧠", detail: "Notes + Diagrams" },
        { id: "med2", title: "Mock Test", time: "11:00 AM – 02:00 PM", duration: 3, icon: "📝", detail: "Full length paper" },
        { id: "med3", title: "Clinical Postings", time: "03:00 PM – 06:00 PM", duration: 3, icon: "🏥", detail: "Ward duties" },
        { id: "med4", title: "Biology NCERT", time: "07:00 PM – 09:00 PM", duration: 2, icon: "🧬", detail: "Line by line reading" },
      ];
    } else if (type === 'engineering') {
      presets = [
        { id: "eng1", title: "DSA Practice", time: "09:00 AM – 11:00 AM", duration: 2, icon: "💻", detail: "Leetcode / CP" },
        { id: "eng2", title: "System Design", time: "02:00 PM – 04:00 PM", duration: 2, icon: "🏗️", detail: "Architecture concepts" },
        { id: "eng3", title: "Development", time: "05:00 PM – 08:00 PM", duration: 3, icon: "🚀", detail: "Projects & open source" },
      ];
    } else if (type === 'general') {
      presets = [
        { id: "gen1", title: "Deep Work", time: "09:00 AM – 11:00 AM", duration: 2, icon: "🎧", detail: "High focus tasks" },
        { id: "gen2", title: "Reading", time: "12:00 PM – 01:00 PM", duration: 1, icon: "📖", detail: "Books / Articles" },
        { id: "gen3", title: "Workout", time: "05:00 PM – 06:30 PM", duration: 1.5, icon: "🏋️", detail: "Gym or Cardio" },
        { id: "gen4", title: "Meditation", time: "09:00 PM – 09:30 PM", duration: 0.5, icon: "🧘‍♀️", detail: "Wind down" },
      ];
    }
    if (presets.length && confirm(`Replace your active schedule with the ${type} preset? (Past tasks are safely archived)`)) {
      setData(prev => {
        const archivedTasks = prev.tasks.map(t => ({ ...t, archived: true }));
        return { ...prev, tasks: [...archivedTasks, ...presets] };
      });
    }
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;


    setAiLoading(true);
    setAiResult("Reading your file...");

    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]); // Remove data:...;base64, prefix
        };
        reader.readAsDataURL(file);
      });

      const mimeType = file.type || "application/pdf";
      setAiResult("🧠 AI is analyzing your syllabus...");

      const response = await fetch(
        '/api/gemini',
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: base64,
                  },
                },
                {
                  text: `You are a master study planner. Analyze this syllabus/schedule document carefully.

Your job:
1. Extract ALL subjects and topics from this document.
2. For each topic, assess its difficulty level (Easy, Medium, Hard) based on your knowledge of student experiences, exam patterns, and common feedback.
3. Allocate MORE study hours to Hard topics, moderate hours to Medium, and fewer to Easy.
4. Create a daily study schedule with realistic time blocks (morning, afternoon, evening).
5. For each study block, suggest 2-3 previous year questions (PYQs) strictly from the last 5 years, or important questions that students should practice.

IMPORTANT: You MUST respond with ONLY a valid JSON object in this exact format, no markdown, no explanation, just pure JSON:

{
  "analysis": "Brief 2-3 sentence overview of the syllabus",
  "tasks": [
    {
      "title": "Subject/Topic Name",
      "time": "09:00 AM – 11:00 AM",
      "duration": 2,
      "icon": "appropriate emoji",
      "detail": "What to focus on",
      "difficulty": "Hard",
      "pyqs": ["Question 1?", "Question 2?"]
    }
  ],
  "tips": ["Tip 1 for the student", "Tip 2"]
}

Make the schedule practical and achievable in a single day (total 6-10 hours). Use appropriate emojis for each subject.`
                },
              ],
            }],
          }),
        }
      );

      const result = await response.json();

      if (result.error) {
        setAiResult(`❌ API Error: ${result.error.message}`);
        setAiLoading(false);
        return;
      }

      const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
      // Clean markdown code blocks if present
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

      try {
        const parsed = JSON.parse(cleaned);
        setAiResult(`✅ AI Analysis: ${parsed.analysis || "Schedule generated!"}\n\n${parsed.tips ? "💡 Tips:\n" + parsed.tips.map((t: string, i: number) => `${i + 1}. ${t}`).join("\n") : ""}\n\n${parsed.tasks ? "📋 PYQs & Important Questions:\n" + parsed.tasks.filter((t: any) => t.pyqs?.length).map((t: any) => `\n${t.icon} ${t.title} (${t.difficulty}):\n${t.pyqs.map((q: string) => `  • ${q}`).join("\n")}`).join("\n") : ""}`);

        if (parsed.tasks && parsed.tasks.length > 0) {
          const newTasks: Task[] = parsed.tasks.map((t: any, i: number) => ({
            id: `ai_${Date.now()}_${i}`,
            title: t.title,
            time: t.time,
            duration: t.duration,
            icon: t.icon || "📚",
            detail: `${t.detail}${t.difficulty ? ` [${t.difficulty}]` : ""}`,
            pyqs: t.pyqs || [],
            archived: false,
          }));

          if (confirm(`AI generated ${newTasks.length} study blocks. Apply this schedule? (Current tasks will be archived)`)) {
            setData(prev => {
              const archivedTasks = prev.tasks.map(t => ({ ...t, archived: true }));
              return { ...prev, tasks: [...archivedTasks, ...newTasks] };
            });
          }
        }
      } catch {
        setAiResult("⚠️ AI responded but the format was unexpected. Here's the raw response:\n\n" + text);
      }
    } catch (err: any) {
      setAiResult(`❌ Error: ${err.message}`);
    }

    setAiLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleTextAnalysis = async () => {
    if (!syllabusText.trim()) return;


    setAiLoading(true);
    setAiResult("🧠 AI is analyzing your syllabus...");

    try {
      const response = await fetch(
        '/api/gemini',
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `You are a master study planner. Analyze this syllabus/schedule text carefully:

---
${syllabusText}
---

Your job:
1. Extract ALL subjects and topics from this text.
2. For each topic, assess its difficulty level (Easy, Medium, Hard) based on your knowledge of student experiences, exam patterns, and common feedback.
3. Allocate MORE study hours to Hard topics, moderate hours to Medium, and fewer to Easy.
4. Create a daily study schedule with realistic time blocks (morning, afternoon, evening).
5. For each study block, suggest 2-3 previous year questions (PYQs) strictly from the last 5 years, or important questions that students should practice.

IMPORTANT: You MUST respond with ONLY a valid JSON object in this exact format, no markdown, no explanation, just pure JSON:

{
  "analysis": "Brief 2-3 sentence overview of the syllabus",
  "tasks": [
    {
      "title": "Subject/Topic Name",
      "time": "09:00 AM – 11:00 AM",
      "duration": 2,
      "icon": "appropriate emoji",
      "detail": "What to focus on",
      "difficulty": "Hard",
      "pyqs": ["Question 1?", "Question 2?"]
    }
  ],
  "tips": ["Tip 1 for the student", "Tip 2"]
}

Make the schedule practical and achievable in a single day (total 6-10 hours). Use appropriate emojis for each subject.`
              }],
            }],
          }),
        }
      );

      const result = await response.json();
      if (result.error) {
        setAiResult(`❌ API Error: ${result.error.message}`);
        setAiLoading(false);
        return;
      }

      const text2 = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleaned = text2.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

      try {
        const parsed = JSON.parse(cleaned);
        setAiResult(`✅ AI Analysis: ${parsed.analysis || "Schedule generated!"}\n\n${parsed.tips ? "💡 Tips:\n" + parsed.tips.map((t: string, i: number) => `${i + 1}. ${t}`).join("\n") : ""}\n\n${parsed.tasks ? "📋 PYQs & Important Questions:\n" + parsed.tasks.filter((t: any) => t.pyqs?.length).map((t: any) => `\n${t.icon} ${t.title} (${t.difficulty}):\n${t.pyqs.map((q: string) => `  • ${q}`).join("\n")}`).join("\n") : ""}`);

        if (parsed.tasks && parsed.tasks.length > 0) {
          const newTasks: Task[] = parsed.tasks.map((t: any, i: number) => ({
            id: `ai_${Date.now()}_${i}`,
            title: t.title,
            time: t.time,
            duration: t.duration,
            icon: t.icon || "📚",
            detail: `${t.detail}${t.difficulty ? ` [${t.difficulty}]` : ""}`,
            pyqs: t.pyqs || [],
            archived: false,
          }));

          if (confirm(`AI generated ${newTasks.length} study blocks. Apply this schedule? (Current tasks will be archived)`)) {
            setData(prev => {
              const archivedTasks = prev.tasks.map(t => ({ ...t, archived: true }));
              return { ...prev, tasks: [...archivedTasks, ...newTasks] };
            });
          }
        }
      } catch {
        setAiResult("⚠️ AI responded but the format was unexpected. Here's the raw response:\n\n" + text2);
      }
    } catch (err: any) {
      setAiResult(`❌ Error: ${err.message}`);
    }

    setAiLoading(false);
  };

  return (
    <div>
      <div className="page-heading">
        <span className="eyebrow">ROUTINE BUILDER</span>
        <h1>Design Your Schedule</h1>
        <p className="muted">Customize your daily tasks and focus areas.</p>
      </div>

      {/* AI Auto-Plan Section */}
      <div className="settings card" style={{ marginBottom: 20, background: 'linear-gradient(135deg, var(--surface), var(--pale))' }}>
        <h2>🤖 AI Auto-Plan</h2>
        <p className="muted" style={{ marginBottom: 15, fontSize: 13 }}>
          Upload your syllabus (PDF/Image) or paste it as text. AI will analyze difficulty, allocate time, and suggest PYQs.
        </p>

        

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 15 }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={aiLoading}
            style={{ background: 'var(--accent)', color: 'var(--bg)', border: 'none', padding: '10px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
          >
            {aiLoading ? "⏳ Analyzing..." : "📄 Upload Syllabus (PDF/Image)"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/*,.jpg,.jpeg,.png"
            onChange={handleFileUpload}
            hidden
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <textarea
            className="search"
            style={{ width: '100%', minHeight: 80, resize: 'vertical' }}
            placeholder="Or paste your syllabus / subjects list here...&#10;Example: Physics - Mechanics, Optics, Thermodynamics&#10;Chemistry - Organic, Inorganic, Physical&#10;Biology - Botany, Zoology, Genetics"
            value={syllabusText}
            onChange={(e) => setSyllabusText(e.target.value)}
          />
          <button
            onClick={handleTextAnalysis}
            disabled={aiLoading || !syllabusText.trim()}
            style={{ marginTop: 8, background: 'var(--accent)', color: 'var(--bg)', border: 'none', padding: '10px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
          >
            {aiLoading ? "⏳ Analyzing..." : "🧠 Analyze & Generate Schedule"}
          </button>
        </div>

        {aiResult && (
          <div style={{ marginTop: 15, padding: 15, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--line)', whiteSpace: 'pre-wrap', fontSize: 13, maxHeight: 400, overflow: 'auto' }}>
            {aiResult}
          </div>
        )}
      </div>

      {/* Quick Presets */}
      <div className="settings card" style={{ marginBottom: 20 }}>
        <h2>Quick Presets</h2>
        <p className="muted" style={{ marginBottom: 15, fontSize: 13 }}>Load a pre-made template tailored to your field.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => loadPreset('medical')}>🩺 Medical / NEET</button>
          <button onClick={() => loadPreset('engineering')}>💻 Engineering</button>
          <button onClick={() => loadPreset('general')}>🌱 General</button>
        </div>
      </div>

      {/* Current Schedule */}
      <div className="section-title" style={{ marginTop: 25 }}>
        <div>
          <p className="eyebrow">YOUR DAILY ROUTINE</p>
          <h2>Active Tasks ({activeTasks.length})</h2>
        </div>
      </div>

      <div className="schedule">
        {activeTasks.map((t, index) => (
          <div key={t.id} className="task-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="task-main" style={{ gap: 15 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <button onClick={() => moveTask(index, -1)} disabled={index === 0} style={{ padding: '2px 5px', fontSize: 10 }}>▲</button>
                <button onClick={() => moveTask(index, 1)} disabled={index === activeTasks.length - 1} style={{ padding: '2px 5px', fontSize: 10 }}>▼</button>
              </div>
              <div className="task-time" style={{ minWidth: 120 }}>{t.time}</div>
              <div className="task-title" style={{ flex: 1 }}>
                <span>{t.icon}</span>
                <div>
                  <h3>{t.title}</h3>
                  <p>{t.detail} <b>· {t.duration} hr</b></p>
                  {t.pyqs && t.pyqs.length > 0 && (
                    <div style={{ marginTop: 8, padding: 10, background: 'var(--pale)', borderRadius: 6, fontSize: 12 }}>
                      <strong>📝 PYQs / Important:</strong>
                      <ul style={{ margin: '4px 0 0 15px', padding: 0, color: 'var(--muted)' }}>
                        {t.pyqs.map((q, i) => (
                          <li key={i} style={{ marginBottom: 2 }}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="task-actions">
              <button onClick={() => { setEditingId(t.id); setDraft(t); }}>Edit</button>
              <button className="note-button" style={{ color: 'var(--red)' }} onClick={() => archiveTask(t.id)}>Remove</button>
            </div>
          </div>
        ))}

        {editingId === "new" || (editingId && editingId !== "new") ? (
          <div className="task-card" style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 1fr', gap: 10 }}>
              <input placeholder="Emoji" value={draft.icon || ""} onChange={e => setDraft({...draft, icon: e.target.value})} className="search" style={{ width: '100%' }} />
              <input placeholder="Task Title" value={draft.title || ""} onChange={e => setDraft({...draft, title: e.target.value})} className="search" style={{ width: '100%' }} />
              <input placeholder="Time (e.g. 09:00 AM - 11:00 AM)" value={draft.time || ""} onChange={e => setDraft({...draft, time: e.target.value})} className="search" style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
              <input placeholder="Short Description" value={draft.detail || ""} onChange={e => setDraft({...draft, detail: e.target.value})} className="search" style={{ width: '100%' }} />
              <input type="number" step="0.5" placeholder="Duration (hours)" value={draft.duration || ""} onChange={e => setDraft({...draft, duration: parseFloat(e.target.value)})} className="search" style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <button onClick={() => { setEditingId(null); setDraft({}); }} className="theme-toggle" style={{ borderRadius: 8, width: 'auto', padding: '0 15px' }}>Cancel</button>
              <button onClick={saveTask} className="theme-toggle" style={{ borderRadius: 8, width: 'auto', padding: '0 15px', background: 'var(--accent)', color: 'var(--bg)' }}>
                {editingId === "new" ? "Save Task" : "Update Task"}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => { setEditingId("new"); setDraft({ duration: 1, icon: "📌" }); }} className="task-card" style={{ width: '100%', textAlign: 'center', cursor: 'pointer', border: '1px dashed var(--line)' }}>
            + Add New Task
          </button>
        )}
      </div>
    </div>
  );
}

function FocusSprint({ tasks }: { tasks: Task[] }) {
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [focusTask, setFocusTask] = useState(tasks.filter(t=>!t.archived)[0]?.id || "");
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
            {tasks.filter(t => !t.archived).map((t) => (
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
