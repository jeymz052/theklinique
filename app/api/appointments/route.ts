import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { RESERVATION_FEE_PHP } from "@/lib/reservation";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const allowedStatuses = ["pending", "confirmed", "completed", "cancelled"] as const;
type AppointmentStatus = (typeof allowedStatuses)[number];
type AppointmentRecord = {
  id: string;
  reference_no: string;
  appointment_date: string;
  appointment_time: string;
  status: AppointmentStatus;
  total_amount: number | string;
  notes: string | null;
  clients: { full_name: string; email: string | null; phone: string }[] | null;
  services: { name: string }[] | null;
};

function getAdminClient() {
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase server credentials are not configured.");
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

async function getRequestUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !url || !anonKey) return null;

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await authClient.auth.getUser();
  return error ? null : data.user;
}

function isStaff(email?: string) {
  return ["estebanjames67@gmail.com", "thekliniqueph@gmail.com"].includes(
    (email || "").toLowerCase().trim()
  );
}

function toAppointment(record: AppointmentRecord) {
  const client = record.clients?.[0];
  const service = record.services?.[0];
  return {
    id: record.id,
    referenceNo: record.reference_no,
    patient: client?.full_name || "Unknown patient",
    email: client?.email || "",
    phone: client?.phone || "",
    service: service?.name || "Consultation",
    date: record.appointment_date,
    time: record.appointment_time?.slice(0, 5) || "",
    status: record.status as AppointmentStatus,
    amount: Number(record.total_amount),
    notes: record.notes || "",
  };
}

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });

  try {
    const admin = getAdminClient();
    let query = admin
      .from("appointments")
      .select("id, reference_no, appointment_date, appointment_time, status, total_amount, notes, clients(full_name, email, phone), services(name)")
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true });

    if (!isStaff(user.email)) {
      const { data: clients, error: clientsError } = await admin
        .from("clients")
        .select("id")
        .eq("email", user.email || "");
      if (clientsError) throw clientsError;
      const clientIds = (clients || []).map((client) => client.id);
      if (!clientIds.length) return NextResponse.json({ appointments: [] });
      query = query.in("client_id", clientIds);
    }

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ appointments: (data || []).map(toAppointment) });
  } catch (error) {
    console.error("Unable to load appointments:", error);
    return NextResponse.json({ error: "Unable to load appointments." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user?.email) return NextResponse.json({ error: "Sign in is required to complete a booking." }, { status: 401 });

    const body = await request.json();
    const firstName = String(body.firstName || "").trim();
    const lastName = String(body.lastName || "").trim();
    const email = user.email.trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const serviceSlug = String(body.serviceSlug || "").trim();
    const appointmentDate = String(body.appointmentDate || "");
    const appointmentTime = String(body.appointmentTime || "");
    const notes = String(body.notes || "").trim();
    const productIds = Array.isArray(body.productIds) ? body.productIds.filter((value: unknown): value is string => typeof value === "string") : [];

    if (!firstName || !lastName || !email || !phone || !serviceSlug || !appointmentDate || !appointmentTime) {
      return NextResponse.json({ error: "Please complete every required booking field." }, { status: 400 });
    }

    const admin = getAdminClient();
    const { data: service, error: serviceError } = await admin
      .from("services")
      .select("id, price")
      .eq("slug", serviceSlug)
      .eq("is_active", true)
      .single();
    if (serviceError || !service) {
      return NextResponse.json({ error: "That treatment is not currently available." }, { status: 400 });
    }

    const { data: client, error: clientError } = await admin
      .from("clients")
      .upsert({ full_name: `${firstName} ${lastName}`, email, phone, notes: notes || null }, { onConflict: "email" })
      .select("id")
      .single();
    if (clientError || !client) throw clientError || new Error("Unable to save patient details.");

    const { data: referenceNo, error: referenceError } = await admin.rpc("generate_appointment_ref");
    if (referenceError || !referenceNo) throw referenceError || new Error("Unable to generate appointment reference.");

    const { data: appointment, error: appointmentError } = await admin
      .from("appointments")
      .insert({
        reference_no: referenceNo,
        client_id: client.id,
        service_id: service.id,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        total_amount: service.price,
        notes: notes || null,
      })
      .select("id, reference_no")
      .single();
    if (appointmentError || !appointment) throw appointmentError || new Error("Unable to create appointment.");

    const { error: reservationError } = await admin.from("payments").insert({
      appointment_id: appointment.id,
      amount: RESERVATION_FEE_PHP,
      currency: "PHP",
      method: "paymongo_qr_ph",
      status: "awaiting_payment",
      metadata: { kind: "reservation_fee", credited_to_visit: true },
    });
    if (reservationError) throw reservationError;

    if (productIds.length) {
      const { data: products, error: productsError } = await admin
        .from("products")
        .select("id, price")
        .in("id", productIds)
        .eq("is_active", true);
      if (productsError) throw productsError;
      const totalAmount = (products || []).reduce((sum, product) => sum + Number(product.price), 0);
      if (products?.length) {
        const { data: orderReference, error: orderReferenceError } = await admin.rpc("generate_order_ref");
        if (orderReferenceError || !orderReference) throw orderReferenceError || new Error("Unable to create package order.");
        const { data: order, error: orderError } = await admin
          .from("orders")
          .insert({ reference_no: orderReference, client_id: client.id, status: "pending_payment", total_amount: totalAmount, notes: `Booking ${appointment.reference_no}` })
          .select("id")
          .single();
        if (orderError || !order) throw orderError || new Error("Unable to create package order.");
        const { error: itemsError } = await admin.from("order_items").insert(products.map((product) => ({ order_id: order.id, product_id: product.id, quantity: 1, unit_price: product.price })));
        if (itemsError) throw itemsError;
      }
    }

    return NextResponse.json({ appointment, reservationFee: RESERVATION_FEE_PHP });
  } catch (error) {
    console.error("Unable to create appointment:", error);
    return NextResponse.json({ error: "Unable to save the booking. Please try again." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getRequestUser(request);
  if (!user || !isStaff(user.email)) {
    return NextResponse.json({ error: "Only clinic staff can update appointments." }, { status: 403 });
  }

  try {
    const { id, status } = await request.json();
    if (typeof id !== "string" || !allowedStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid appointment update." }, { status: 400 });
    }

    const changes: Record<string, string | null> = { status };
    if (status === "completed") changes.completed_at = new Date().toISOString();
    if (status === "cancelled") changes.cancelled_at = new Date().toISOString();
    const { error } = await getAdminClient().from("appointments").update(changes).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to update appointment:", error);
    return NextResponse.json({ error: "Unable to update the appointment." }, { status: 500 });
  }
}
