import { redirect } from "next/navigation";

export default function BookingPage() {
  redirect("/dashboard/patient?view=book");
}
