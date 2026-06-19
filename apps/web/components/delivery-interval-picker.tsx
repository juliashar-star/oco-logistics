"use client";

import type { DeliveryInterval } from "@oco/apiship";

type DeliveryIntervalPickerProps = {
  intervals: DeliveryInterval[];
  selected: DeliveryInterval | null;
  onSelect: (interval: DeliveryInterval) => void;
};

type IntervalGroup = {
  key: string;
  title: string;
  items: DeliveryInterval[];
};

function intervalKey(interval: DeliveryInterval): string {
  return `${interval.date ?? "null"}:${interval.from}:${interval.to}`;
}

function intervalsEqual(a: DeliveryInterval | null, b: DeliveryInterval): boolean {
  if (!a) {
    return false;
  }
  return a.date === b.date && a.from === b.from && a.to === b.to;
}

function formatDateLabel(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(parsed);
}

function groupIntervals(intervals: DeliveryInterval[]): IntervalGroup[] {
  const groups = new Map<string, IntervalGroup>();

  for (const interval of intervals) {
    const key = interval.date ?? "__no_date__";
    const title =
      interval.date === null ? "Доступное время" : formatDateLabel(interval.date);

    const existing = groups.get(key);
    if (existing) {
      existing.items.push(interval);
    } else {
      groups.set(key, { key, title, items: [interval] });
    }
  }

  return Array.from(groups.values());
}

export function DeliveryIntervalPicker({
  intervals,
  selected,
  onSelect,
}: DeliveryIntervalPickerProps) {
  if (intervals.length === 0) {
    return null;
  }

  const groups = groupIntervals(intervals);

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      {groups.map((group) => (
        <div key={group.key}>
          <h4 className="mb-2 text-sm font-medium text-slate-700">{group.title}</h4>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={group.title}>
            {group.items.map((interval) => {
              const isSelected = intervalsEqual(selected, interval);
              return (
                <button
                  key={intervalKey(interval)}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onSelect(interval)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isSelected
                      ? "bg-slate-900 text-white"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {interval.from}–{interval.to}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
