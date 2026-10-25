import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import Browse from "./pages/Browse";
import Home from "./pages/Home";
import ListingDetail from "./pages/ListingDetail";
import Login from "./pages/Login";
import Messages from "./pages/Messages";
import NotFound from "./pages/NotFound";
import RentalPage from "./pages/Rental";
import Signup from "./pages/Signup";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="browse" element={<Browse />} />
        <Route path="listings/:id" element={<ListingDetail />} />
        <Route path="rentals/:id" element={<RentalPage />} />
        <Route path="messages" element={<Messages />} />
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<Signup />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
