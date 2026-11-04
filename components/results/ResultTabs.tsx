"use client";

import { useState, type ReactNode } from "react";

// Panneau à onglets des Résultats (maquette) : REPLAY DE LA COURSE / MON CLAVIER.
export function ResultTabs({
  tabs,
}: {
  tabs: { id: string; label: string; legend: string; content: ReactNode }[];
}) {
  const [current, setCurrent] = useState(tabs[0]?.id ?? "");
  const active = tabs.find((tab) => tab.id === current) ?? tabs[0];
  return (
    <section className="lobby-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#3b2a1a] px-5 py-3.5">
        <div role="tablist" className="flex gap-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={tab.id === active?.id}
              aria-controls={`pane-${tab.id}`}
              data-on={tab.id === active?.id}
              onClick={() => setCurrent(tab.id)}
              className="res-tab font-pixel"
            >
              {tab.label}
            </button>
          ))}
        </div>
        <span className="text-[19px] text-[#cdbf9c]">{active?.legend}</span>
      </div>
      {active && (
        <div
          role="tabpanel"
          id={`pane-${active.id}`}
          aria-labelledby={`tab-${active.id}`}
          className="p-5"
        >
          {active.content}
        </div>
      )}
    </section>
  );
}
