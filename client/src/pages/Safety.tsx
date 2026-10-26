import { Link } from "react-router-dom";
import { HeldAmount } from "../components/Badges";
import { Icon } from "../components/Icon";
import { useMeta } from "../lib/useMeta";
import { money0 } from "../lib/format";

const STEPS = [
  { title: "You request and the lender approves", body: "Nothing is charged or held yet. If the lender turned approval off, it's approved right away." },
  { title: "Both of you accept the agreement", body: "It's short and in plain language. It says exactly when the hold is released and when it can be charged." },
  { title: "You pay the rental and place the hold", body: "The rental fee is charged. The protection hold is a temporary hold on your card, like a hotel or gas pump. It isn't a charge." },
  { title: "Holds refresh every 7 days on long rentals", body: "Card holds expire after 7 days, so we renew yours automatically. You get a reminder the day before. Renewing never charges you." },
  { title: "Return it the same way, get it all back", body: "After a clean return the hold is released within 3 days. Banks can take a few days to show it." },
  { title: "If something goes wrong", body: "For damage, a late return or no return, the lender can file a claim with photos. You can accept or dispute it. Up to the held amount can be charged. A destroyed or unreturned item can cost its full replacement value." },
];

export default function Safety() {
  const meta = useMeta();
  return (
    <div className="page max-w-4xl space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl">Safety on KnightLend</h1>
        <p className="max-w-2xl text-charcoal">Lending your stuff should feel as safe as borrowing it. Here's how we protect both sides.</p>
      </header>

      <section className="space-y-4" id="protection-hold">
        <h2 className="text-2xl">How the protection hold works</h2>
        <div className="flex flex-wrap items-center gap-3 rounded-card bg-mist p-4 text-sm">
          <span className="font-semibold">Two different things:</span>
          <span className="rounded-lg border-2 border-ink bg-paper px-2 py-0.5 font-bold">$21.00 charged</span>
          <span>is what you pay for the rental.</span>
          <HeldAmount amount={40} />
          <span>is set aside on your card and given back after a clean return.</span>
        </div>
        <ol className="grid gap-3 md:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card flex gap-3 p-4">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gold text-sm font-bold">{i + 1}</span>
              <span>
                <span className="block font-semibold">{s.title}</span>
                <span className="text-sm text-charcoal">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
        {meta && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <caption className="mb-2 text-left font-semibold">Hold amounts scale with the item's value</caption>
              <thead>
                <tr className="border-b border-line">
                  <th className="py-2">Item value</th>
                  <th className="py-2">Protection hold</th>
                </tr>
              </thead>
              <tbody>
                {meta.hold_tiers.map((t) => (
                  <tr key={t.label} className="border-b border-line">
                    <td className="py-2">{t.label}</td>
                    <td className="py-2">
                      {money0(t.min_hold)} to {money0(t.max_hold)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-sm text-charcoal">Debit cards: the held amount is temporarily unavailable in your account. You can use a different card at checkout.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl">Meet in public</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            ["pin", "Use a suggested campus spot", "The Student Union, the Library and the other spots are busy, well lit and accessible."],
            ["clock", "Meet in daylight when you can", "Pick a morning or afternoon slot, and tell a friend where you're going."],
            ["camera", "Take photos together", "Both of you add pickup photos and confirm each other's. Do the same at return."],
            ["chat", "Keep it in KnightLend", "Message in the app. Phone numbers and emails are hidden so your personal info stays private."],
          ].map(([icon, t, b]) => (
            <li key={t} className="card flex gap-3 p-4">
              <Icon name={icon} className="mt-0.5 shrink-0" />
              <span>
                <span className="block font-semibold">{t}</span>
                <span className="text-sm text-charcoal">{b}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl">How disputes work</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>The lender files a claim within 24 hours of the return, with photos and an amount up to the hold.</li>
          <li>The borrower gets a notice. The hold stays held, not charged, while the claim is open.</li>
          <li>The borrower accepts (the amount is charged from the hold) or disputes with their side and photos.</li>
          <li>A KnightLend moderator compares the pickup and return photos and both statements, then releases the hold or captures part or all of the claim.</li>
          <li>Both sides see the result and a short explanation. Whatever isn't captured is released.</li>
        </ol>
      </section>

      <section className="space-y-3 rounded-card border-2 border-ink p-5">
        <h2 className="text-xl">Report a problem</h2>
        <p className="text-sm text-charcoal">
          Use “Report” on any profile or listing. Moderators review reports, and members with repeated bad reviews or reports can be restricted from listing and requesting. If you ever feel unsafe, leave right away and contact campus police or emergency services.
        </p>
        <Link to="/browse" className="btn-secondary btn-sm">
          Back to browsing
        </Link>
      </section>
    </div>
  );
}
