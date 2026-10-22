import { redirect } from "next/navigation";

// This page used to show "saved successfully" without sending anything to the
// API. /complete-profile collects the same details and saves them.
export default function PatientInfoPage() {
  redirect("/complete-profile");
}
