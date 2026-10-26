import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Notification } from "../lib/api";
import { when } from "../lib/format";
import { Icon } from "./Icon";

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    let live = true;
    const load = () =>
      api.notifications
        .list()
        .then((n) => {
          if (!live) return;
          setItems(n.items);
          setUnread(n.unread);
        })
        .catch(() => undefined);
    load();
    const t = setInterval(load, 15000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  const openItem = async (n: Notification) => {
    setOpen(false);
    if (!n.read) await api.notifications.read(n.id).catch(() => undefined);
    setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(0, u - (n.read ? 0 : 1)));
    if (n.link) nav(n.link);
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="relative grid h-9 w-9 place-items-center rounded-md text-paper hover:bg-paper/10">
        <Icon name="bell" size={20} />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-[10px] font-bold text-ink">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-card border border-line bg-paper text-ink shadow-card">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="text-sm font-bold">Notifications</p>
            {unread > 0 && (
              <button
                className="text-xs font-semibold underline"
                onClick={async () => {
                  await api.notifications.readAll();
                  setItems((xs) => xs.map((x) => ({ ...x, read: true })));
                  setUnread(0);
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 && <li className="p-4 text-sm text-charcoal">You're all caught up.</li>}
            {items.map((n) => (
              <li key={n.id}>
                <button onClick={() => openItem(n)} className={`flex w-full gap-2 border-b border-line px-3 py-2.5 text-left hover:bg-mist ${n.read ? "" : "bg-gold-soft"}`}>
                  {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ink" aria-label="Unread" />}
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{n.title}</span>
                    {n.body && <span className="block text-xs text-charcoal">{n.body}</span>}
                    <span className="block text-[11px] text-charcoal">{when(n.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
