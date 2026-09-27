"use client";

import BookingForm from "@/app/components/BookingForm";

export default function BookingPage() {
  return (
    <div className="bk-page-root">
      {/* Subtle decorative background */}
      <div className="bk-page-bg" />
      <BookingForm isModal={false} />
    </div>
  );
}
