import { redirect } from "next/navigation";

/**
 * Staff sign in on the shared /login page, which checks the password and
 * starts the session cookie. This address used to hold a separate form that
 * never verified the password; it now only forwards old bookmarks.
 */
export default function AdminLoginRedirect() {
  redirect("/login");
}
