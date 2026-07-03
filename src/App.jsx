import { useCallback, useEffect, useState } from "react";
import { getSession, logout } from "./api.js";
import { C, DISPLAY, MONO, pillStyle, st } from "./styles.js";
import { DayTab } from "./components/DayTab.jsx";
import { ConditionsView } from "./components/ConditionsView.jsx";
import { FeedbackTab } from "./components/FeedbackTab.jsx";
import { FleetTab } from "./components/FleetTab.jsx";
import { Login } from "./components/Login.jsx";
import { ScheduleTab } from "./components/ScheduleTab.jsx";
import { ScoreTab } from "./components/ScoreTab.jsx";

/**
 * Root application. Gates the UI behind a session, renders the header
 * and tab bar, and dispatches to the active tab. Role controls which
 * actions each tab exposes.
 */

const TABS = Object.freeze([
  { key: "score", label: "Score" },
  { key: "fleet", label: "Fleet" },
  { key: "day", label: "Day" },
  { key: "schedule", label: "Schedule" },
  { key: "feedback", label: "Feedback" },
]);

/** @returns {JSX.Element} The tab body for the active key. */
function renderTab(activeKey, isAdmin) {
  if (activeKey === "fleet") {
    return <FleetTab isAdmin={isAdmin} />;
  }
  if (activeKey === "day") {
    return <DayTab isAdmin={isAdmin} />;
  }
  if (activeKey === "schedule") {
    return <ScheduleTab isAdmin={isAdmin} />;
  }
  if (activeKey === "feedback") {
    return <FeedbackTab isAdmin={isAdmin} />;
  }
  return <ScoreTab isAdmin={isAdmin} />;
}

export default function App() {
  const [role, setRole] = useState(null);
  const [checking, setChecking] = useState(true);
  const [activeTab, setActiveTab] = useState("score");
  const [publicView, setPublicView] = useState(false);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const session = await getSession();
        if (active) {
          setRole(session.role);
        }
      } catch {
        if (active) {
          setRole(null);
        }
      } finally {
        if (active) {
          setChecking(false);
        }
      }
    };
    check();
    return () => {
      active = false;
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logout();
    } catch {
      /* Clearing local state below is enough even if the call fails. */
    }
    setRole(null);
    setActiveTab("score");
  }, []);

  if (checking) {
    return <p style={{ ...st.meta, padding: 24 }}>Loading...</p>;
  }

  if (!role) {
    if (publicView) {
      return <ConditionsView onBack={() => setPublicView(false)} />;
    }
    return <Login onAuthed={setRole} onViewPublic={() => setPublicView(true)} />;
  }

  const isAdmin = role === "admin";

  return (
    <div style={st.page}>
      <header style={st.header}>
        <div>
          <h1 style={st.brand}>Drone Smoke</h1>
          <div style={st.brandSub}>C-sUAS Interceptor Evaluation</div>
        </div>
        <div style={st.roleRow}>
          <span style={pillStyle(isAdmin ? C.orange : C.olive)}>{isAdmin ? "Admin" : "Scorer"}</span>
          <button style={{ ...st.ghostBtn, minHeight: 40 }} onClick={signOut}>Sign out</button>
        </div>
      </header>

      <nav style={st.tabBar} className="tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            style={{ ...st.tab, ...(activeTab === tab.key ? st.tabActive : {}) }}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {renderTab(activeTab, isAdmin)}

      <footer style={{ marginTop: 32, fontFamily: MONO, fontSize: 11, color: C.inkMuted, textAlign: "center" }}>
        <span style={{ fontFamily: DISPLAY, letterSpacing: "0.06em" }}>DRONESMOKE</span> · scores logged live · reports on close
      </footer>
    </div>
  );
}
