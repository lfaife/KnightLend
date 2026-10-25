import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div>
      <section className="on-dark bg-ink text-paper">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h1 className="max-w-2xl text-4xl text-paper md:text-5xl">Rent it from a Knight. Return it the same way.</h1>
          <p className="mt-4 max-w-xl text-paper/80">Borrow calculators, cameras, tools and more from verified UCF students and alumni nearby.</p>
          <div className="mt-6 flex gap-3">
            <Link to="/browse" className="btn-primary">Browse items</Link>
            <Link to="/list" className="btn-dark-outline">List an item</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
