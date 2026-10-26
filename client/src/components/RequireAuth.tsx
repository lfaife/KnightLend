import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/auth";
import { Empty, Loading } from "./States";

export function RequireAuth({ children, title = "Sign in to continue" }: { children: ReactNode; title?: string }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!user)
    return (
      <div className="page">
        <Empty
          icon="lock"
          title={title}
          body="KnightLend is for verified UCF students and alumni. Sign in or create an account."
          action={
            <div className="flex gap-2">
              <Link to="/login" state={{ from: loc.pathname }} className="btn-primary">
                Sign in
              </Link>
              <Link to="/signup" className="btn-secondary">
                Create account
              </Link>
            </div>
          }
        />
      </div>
    );
  return <>{children}</>;
}
