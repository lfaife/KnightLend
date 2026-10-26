import { useState } from "react";
import { Link } from "react-router-dom";
import { VerifiedBadge } from "../components/Badges";
import { RequireAuth } from "../components/RequireAuth";
import { Notice } from "../components/States";
import { useAuth } from "../context/auth";
import { api } from "../lib/api";

export default function Verify() {
  return (
    <RequireAuth title="Sign in to verify">
      <VerifyView />
    </RequireAuth>
  );
}

function VerifyView() {
  const { user, refresh } = useAuth();
  const [path, setPath] = useState<"student" | "alumni">(user?.affiliation === "alumni" ? "alumni" : "student");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [simCode, setSimCode] = useState<string | null>(null);
  const [year, setYear] = useState("");
  const [degree, setDegree] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = user?.verification_status === "pending";

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  if (user?.verified)
    return (
      <div className="page max-w-xl space-y-4">
        <h1 className="text-2xl">You're verified</h1>
        <VerifiedBadge affiliation={user.affiliation} />
        <p className="text-sm text-charcoal">Your badge shows on your profile and listings. You can lend and borrow.</p>
        <div className="flex gap-2">
          <Link to="/list" className="btn-primary">List an item</Link>
          <Link to="/browse" className="btn-secondary">Browse</Link>
        </div>
      </div>
    );

  return (
    <div className="page max-w-xl space-y-5">
      <div>
        <h1 className="text-2xl">Verify your UCF status</h1>
        <p className="text-sm text-charcoal">KnightLend is only for UCF students and alumni. Verification is simulated in this demo: no email is sent and no records are checked.</p>
      </div>
      <div className="grid grid-cols-2 gap-2" role="tablist">
        {(["student", "alumni"] as const).map((p) => (
          <button key={p} role="tab" aria-selected={path === p} onClick={() => setPath(p)} className={`rounded-lg border-2 px-3 py-2.5 text-sm font-semibold ${path === p ? "border-ink bg-gold" : "border-line"}`}>
            {p === "student" ? "Current student" : "Alum"}
          </button>
        ))}
      </div>

      {path === "student" ? (
        <div className="card space-y-4 p-4">
          <div>
            <label htmlFor="ucf-email" className="field-label">
              Step 1. Your UCF email
            </label>
            <div className="flex gap-2">
              <input id="ucf-email" type="email" className="input" placeholder="yourname@ucf.edu" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button
                className="btn-primary shrink-0"
                disabled={busy || !email}
                onClick={() =>
                  run(async () => {
                    const r = await api.verification.studentStart(email);
                    setMsg(r.message);
                    setSimCode(r.simulated_code);
                  })
                }
              >
                Send code
              </button>
            </div>
            <p className="field-hint">We only check the domain. Your UCF email isn't stored or shown to anyone.</p>
          </div>
          {msg && <Notice title={msg}>{simCode && <span>Your code: <strong className="font-mono text-ink">{simCode}</strong></span>}</Notice>}
          {(pending || msg) && user?.verification_method === "ucf_email" && (
            <div>
              <label htmlFor="code" className="field-label">
                Step 2. Enter the 6-digit code
              </label>
              <div className="flex gap-2">
                <input id="code" inputMode="numeric" maxLength={6} className="input font-mono" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                <button className="btn-primary shrink-0" disabled={busy || code.length !== 6} onClick={() => run(() => api.verification.studentConfirm(code))}>
                  Verify
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card space-y-4 p-4">
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <label className="text-sm font-semibold">
              Graduation year
              <input inputMode="numeric" maxLength={4} className="input mt-1" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))} />
            </label>
            <label className="text-sm font-semibold">
              Degree
              <input className="input mt-1" placeholder="BS Civil Engineering" value={degree} onChange={(e) => setDegree(e.target.value)} />
            </label>
          </div>
          <button className="btn-primary" disabled={busy || year.length !== 4 || degree.length < 2} onClick={() => run(async () => setMsg((await api.verification.alumniStart(Number(year), degree)).message))}>
            Step 1. Continue
          </button>
          {pending && user?.verification_method === "alumni" && (
            <div className="space-y-2 border-t border-line pt-4">
              <p className="field-label">Step 2. Upload a photo of your diploma or alumni card</p>
              <p className="field-hint">Simulated check: it's approved right away in the demo. Cover any ID numbers before you upload.</p>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="block text-sm file:mr-3 file:rounded-lg file:border-2 file:border-ink file:bg-paper file:px-3 file:py-1.5 file:font-semibold" onChange={(e) => e.target.files?.[0] && run(() => api.verification.alumniProof(e.target.files![0]))} aria-label="Diploma or alumni card photo" />
            </div>
          )}
          {msg && <Notice title={msg} />}
        </div>
      )}
      {err && <Notice tone="danger" title={err} />}
    </div>
  );
}
