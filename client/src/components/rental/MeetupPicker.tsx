import { useState } from "react";
import type { Meetup, Place } from "../../lib/api";
import { addDays } from "../../lib/format";
import { useMeta } from "../../lib/useMeta";
import { CampusMap } from "../CampusMap";
import { Icon } from "../Icon";
import { Loading, Notice } from "../States";

interface Props {
  current: Meetup | null;
  today: string;
  startDate: string;
  onSave: (body: { spot_id: string; date: string; time_of_day: string; notes: string }) => Promise<void>;
}

export function MeetupPicker({ current, today, startDate, onSave }: Props) {
  const meta = useMeta();
  const [spotId, setSpotId] = useState(current?.spot_id ?? "student-union");
  const [date, setDate] = useState(current?.date ?? (startDate < today ? today : startDate));
  const [time, setTime] = useState<string>(current?.time_of_day ?? "afternoon");
  const [notes, setNotes] = useState(current?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!meta) return <Loading />;

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onSave({ spot_id: spotId, date, time_of_day: time, notes });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save the meetup.");
    } finally {
      setBusy(false);
    }
  };
  const selected = meta.pickup_spots.find((s) => s.id === spotId);

  return (
    <div className="space-y-4">
      <p className="text-sm text-charcoal">Pick a busy, public campus spot. Meeting where other people are around keeps handoffs safe for both of you.</p>
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="field-label">Suggested public spots</legend>
        {meta.pickup_spots.map((s: Place) => (
          <label key={s.id} className={`cursor-pointer rounded-card border-2 p-3 text-sm ${spotId === s.id ? "border-ink bg-mist" : "border-line"}`}>
            <span className="flex items-start gap-2">
              <input type="radio" name="spot" className="mt-1 accent-black" checked={spotId === s.id} onChange={() => setSpotId(s.id)} />
              <span>
                <span className="block font-semibold">{s.name}</span>
                <span className="block text-xs text-charcoal">{s.hours}</span>
                <span className="mt-1 flex items-start gap-1 text-xs text-charcoal">
                  <Icon name="info" size={12} className="mt-0.5 shrink-0" /> {s.accessibility}
                </span>
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <CampusMap center={selected ? [selected.lat, selected.lng] : meta.campus_center} zoom={16} spots={meta.pickup_spots} onSpotSelect={(s) => setSpotId(s.id)} height={260} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Day
          <input type="date" className="input mt-1" min={today} max={addDays(startDate, 1)} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="text-sm font-semibold">
          Time of day
          <select className="input mt-1" value={time} onChange={(e) => setTime(e.target.value)}>
            {meta.times_of_day.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm font-semibold">
        Notes (optional)
        <textarea className="input mt-1" rows={2} maxLength={300} placeholder="I'll be by the front doors in a gold hoodie." value={notes} onChange={(e) => setNotes(e.target.value)} />
        <span className="field-hint block font-normal">Don't share phone numbers or emails. Use KnightLend messages instead.</span>
      </label>
      {err && <Notice tone="danger" title={err} />}
      <button className="btn-primary" onClick={save} disabled={busy}>
        {busy ? "Saving…" : current ? "Update meetup" : "Save meetup"}
      </button>
    </div>
  );
}
