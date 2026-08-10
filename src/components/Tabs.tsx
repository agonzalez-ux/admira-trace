"use client";

import { useState } from "react";

export default function Tabs({
  tabs,
}: {
  tabs: { key: string; label: string; content: React.ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.key);

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto px-4 pt-3 pb-1 bg-white border-b border-slate-100 sticky top-[64px] z-10">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`whitespace-nowrap text-sm font-medium rounded-t-lg px-3 py-2 transition-colors ${
              active === t.key ? "bg-admira-50 text-admira-700 border-b-2 border-admira-600" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-4">{tabs.find((t) => t.key === active)?.content}</div>
    </div>
  );
}
