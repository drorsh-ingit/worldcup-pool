"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { createCuratedBet } from "@/lib/actions/bet-types";

export function CuratedPropForm({
  groupId,
  tournamentId,
}: {
  groupId: string;
  tournamentId: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [locksAt, setLocksAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addOption() {
    if (options.length < 6) setOptions([...options, ""]);
  }
  function removeOption(i: number) {
    if (options.length > 2) setOptions(options.filter((_, idx) => idx !== i));
  }
  function setOption(i: number, val: string) {
    const next = [...options];
    next[i] = val;
    setOptions(next);
  }

  async function handleSubmit() {
    const validOptions = options.filter((o) => o.trim());
    if (validOptions.length < 2) return setError("At least 2 options required");
    if (!name.trim()) return setError("Name is required");
    if (!locksAt) return setError("Lock time is required");

    setLoading(true);
    setError(null);
    try {
      const result = await createCuratedBet(groupId, tournamentId, {
        name: name.trim(),
        description: description.trim(),
        options: validOptions,
        locksAt: new Date(locksAt),
      });
      if ("error" in result) {
        setError(result.error as string);
      } else {
        setOpen(false);
        setName(""); setDescription(""); setOptions(["", ""]); setLocksAt("");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-neutral-200 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add prop bet
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-neutral-900">New prop bet</p>
        <button onClick={() => setOpen(false)} className="text-neutral-400 hover:text-neutral-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Question (e.g. Will there be a red card in the final?)"
          className="w-full h-9 px-3 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="w-full h-9 px-3 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
        />
        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-500">Options</p>
          {options.map((opt, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={opt}
                onChange={(e) => setOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                className="flex-1 h-9 px-3 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
              />
              {options.length > 2 && (
                <button onClick={() => removeOption(i)} className="text-neutral-400 hover:text-red-500 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          {options.length < 6 && (
            <button onClick={addOption} className="text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add option
            </button>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-neutral-500">Locks at</p>
          <input
            type="datetime-local"
            value={locksAt}
            onChange={(e) => setLocksAt(e.target.value)}
            className="h-9 px-3 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="h-9 px-4 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-60 transition-colors"
        >
          {loading ? "Creating..." : "Create prop bet"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="h-9 px-4 rounded-xl border border-neutral-200 text-sm text-neutral-600 hover:bg-neutral-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
