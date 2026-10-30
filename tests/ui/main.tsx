import { createRoot } from "react-dom/client";
import { App } from "../../src/components/app";
import { AuthForm } from "../../src/components/auth-form";
import { fixture } from "./fixture";
const path = location.pathname;
const admin = path.startsWith("/admin");
createRoot(document.getElementById("root")!).render(
  ["login", "register", "forgot-password", "reset-password"].includes(
    path.slice(1),
  ) ? (
    <AuthForm mode={path.slice(1)} />
  ) : (
    <App initialProfile={fixture(admin).profile} />
  ),
);
