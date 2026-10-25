import { Link } from "react-router-dom";
import { Empty } from "../components/States";

export default function NotFound() {
  return (
    <div className="page">
      <Empty title="Page not found" body="That page doesn't exist." action={<Link to="/" className="btn-primary">Go home</Link>} />
    </div>
  );
}
