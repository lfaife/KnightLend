import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import Browse from "./pages/Browse";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import ListingDetail from "./pages/ListingDetail";
import ListingForm from "./pages/ListingForm";
import Login from "./pages/Login";
import Messages from "./pages/Messages";
import Moderation from "./pages/Moderation";
import NotFound from "./pages/NotFound";
import UserProfile, { MyProfile } from "./pages/Profile";
import RentalPage from "./pages/Rental";
import Safety from "./pages/Safety";
import Signup from "./pages/Signup";
import Verify from "./pages/Verify";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="browse" element={<Browse />} />
        <Route path="listings/:id" element={<ListingDetail />} />
        <Route path="list" element={<ListingForm />} />
        <Route path="list/:id" element={<ListingForm />} />
        <Route path="rentals/:id" element={<RentalPage />} />
        <Route path="messages" element={<Messages />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="profile" element={<MyProfile />} />
        <Route path="users/:id" element={<UserProfile />} />
        <Route path="verify" element={<Verify />} />
        <Route path="safety" element={<Safety />} />
        <Route path="moderation" element={<Moderation />} />
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<Signup />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
