export interface ImpactSources {
  bookings?: {
    items: Array<{
      jobId: string;
      customerId: string;
      source: "voice" | "campaign" | "chat";
      basis:
        | "invoice"
        | "accepted_quote"
        | "job_type_estimate"
        | "unpriced"
        | "cancelled"
        | "unavailable";
      amount: number | null;
      estimateId?: string;
      workingInvoiceIds?: string[];
      invoices: Array<{
        id: string;
        amount: number;
        collected?: number | null;
        adjustmentIds?: string[];
      }>;
      bookedAtMs?: number;
      checkedAtMs?: number;
      unavailable?: boolean;
      paymentsUnavailable?: boolean;
    }>;
    partial: boolean;
    unpriced: number;
    pending: number;
    unavailable: number;
    trackedBookings?: number;
  } | null;
  collected: {
    partial?: boolean;
    items: Array<{
      invoiceRef?: string;
      amount: number;
    }>;
  } | null;
  won: {
    partial?: boolean;
    items: Array<{
      kind: string;
      refId: string;
      amount: number;
      basis?: string;
      jobId?: string;
      invoiceTotal?: number;
    }>;
  } | null;
  voice: {
    items: Array<{
      invoiceId: string;
      jobId?: string;
      amount: number;
    }>;
    trackedBookings: number;
    unpricedBookings: number;
    unreadBookings: number;
    omittedBookings: number;
    asOfMs: number;
  } | null;
}
export type ValueChannel = "voice" | "campaign" | "chat" | "other";
const channelOf = (source: string): ValueChannel =>
  source === "voice" || source === "campaign" || source === "chat" ? source : "other";
export function scoutImpact(sources: ImpactSources) {
  type Document = {
    recovered: number;
    campaign: number;
    voice: number;
    channel: ValueChannel;
  };
  const documents = new Map<string, Document>();
  const channels = Object.fromEntries(
    (["voice", "campaign", "chat", "other"] as const).map((channel) => [
      channel,
      { cents: 0, collectedCents: 0 },
    ]),
  ) as Record<
    ValueChannel,
    {
      cents: number;
      collectedCents: number;
    }
  >;
  let unverifiedRows = 0;
  const add = (
    id: string | undefined,
    amount: number,
    source: "recovered" | "campaign" | "voice",
  ) => {
    if (!id || !Number.isFinite(amount) || amount < 0) {
      unverifiedRows++;
      return;
    }
    const row: Document = documents.get(id) ?? {
      recovered: 0,
      campaign: 0,
      voice: 0,
      channel: source === "voice" ? "voice" : "campaign",
    };
    if (source === "voice") row.channel = "voice";
    row[source] = Math.max(row[source], Math.round(amount * 100));
    documents.set(id, row);
  };
  sources.collected?.items.forEach((row) => add(row.invoiceRef, row.amount, "recovered"));
  const canonicalJobs = new Set(
    (sources.bookings?.items ?? [])
      .filter((row) => row.basis !== "unavailable")
      .map((row) => row.jobId),
  );
  const canonicalInvoices = new Set(
    (sources.bookings?.items ?? [])
      .filter((row) => row.basis !== "unavailable")
      .flatMap((row) =>
        row.invoices.map((invoice) => invoice.id).concat(row.workingInvoiceIds ?? []),
      ),
  );
  const bookedJobs = new Set([
    ...(sources.bookings?.items ?? []).map((row) => row.jobId),
    ...(sources.voice?.items ?? []).flatMap((row) => (row.jobId ? [row.jobId] : [])),
  ]);
  const bookedInvoices = new Set([
    ...(sources.bookings?.items ?? []).flatMap((row) => row.invoices.map((invoice) => invoice.id)),
    ...(sources.voice?.items ?? []).map((row) => row.invoiceId),
  ]);
  const afterOutreach = new Map<
    string,
    {
      cents: number;
      rows: number;
    }
  >();
  sources.won?.items.forEach((row) => {
    if (row.kind === "estimate" && row.basis === "accepted_quote") {
      return;
    }
    if (row.kind === "job" && row.basis === "converted_estimate") {
      return;
    }
    if (row.kind !== "invoice") {
      unverifiedRows++;
      return;
    }
    if (!bookedInvoices.has(row.refId) && !(row.jobId && bookedJobs.has(row.jobId))) {
      if (!documents.has(row.refId) && row.amount > 0) {
        unverifiedRows++;
        const seen = afterOutreach.get(row.refId);
        afterOutreach.set(row.refId, {
          cents: Math.max(seen?.cents ?? 0, Math.round(row.amount * 100)),
          rows: (seen?.rows ?? 0) + 1,
        });
      }
      return;
    }
    const payments = ["payments_since_first_text", "invoice_settled", "balance_drop"].includes(
      row.basis ?? "",
    );
    if (
      !payments &&
      (canonicalInvoices.has(row.refId) || (row.jobId && canonicalJobs.has(row.jobId)))
    ) {
      return;
    }
    add(row.refId, row.amount, payments ? "recovered" : "campaign");
  });
  sources.voice?.items.forEach((row) => {
    if (!canonicalInvoices.has(row.invoiceId) && (!row.jobId || !canonicalJobs.has(row.jobId))) {
      add(row.invoiceId, row.amount, "voice");
    }
  });
  for (const booking of sources.bookings?.items ?? []) {
    if (booking.basis === "unavailable") continue;
    for (const invoice of booking.invoices) {
      for (const id of invoice.adjustmentIds ?? []) {
        documents.delete(id);
        afterOutreach.delete(id);
      }
    }
  }
  let estimated = 0;
  let bookingInvoiced = 0;
  const seenJobs = new Set<string>();
  const seenQuotes = new Set(
    (sources.bookings?.items ?? [])
      .filter((row) => row.basis === "invoice" || row.basis === "cancelled")
      .flatMap((row) => (row.estimateId ? [row.estimateId] : [])),
  );
  const seenBookingInvoices = new Set<string>();
  for (const booking of sources.bookings?.items ?? []) {
    if (!booking.jobId || seenJobs.has(booking.jobId)) {
      continue;
    }
    seenJobs.add(booking.jobId);
    const channel = channels[channelOf(booking.source)];
    const invoiced = booking.basis === "invoice" || booking.basis === "cancelled";
    if (booking.basis !== "unavailable") {
      for (const invoice of booking.invoices) {
        if (seenBookingInvoices.has(invoice.id)) {
          continue;
        }
        seenBookingInvoices.add(invoice.id);
        if (!invoice.id || !Number.isFinite(invoice.amount) || invoice.amount < 0) {
          unverifiedRows++;
          continue;
        }
        const value = Math.round(invoice.amount * 100);
        const previous = documents.get(invoice.id);
        const collected =
          typeof invoice.collected === "number" && Number.isFinite(invoice.collected)
            ? Math.max(0, Math.round(invoice.collected * 100))
            : null;
        if (collected === null) {
          unverifiedRows++;
        }
        if (previous) {
          if (collected !== null) {
            previous.recovered = collected;
          }
          previous.campaign = 0;
          previous.voice = 0;
          previous.channel = channelOf(booking.source);
          if (invoiced) {
            bookingInvoiced += Math.max(0, value - previous.recovered);
            channel.cents += Math.max(0, value - previous.recovered);
          }
        } else {
          if (invoiced || (collected !== null && collected > 0)) {
            documents.set(invoice.id, {
              recovered: collected ?? 0,
              campaign: 0,
              voice: 0,
              channel: channelOf(booking.source),
            });
          }
          if (invoiced) {
            bookingInvoiced += Math.max(0, value - (collected ?? 0));
            channel.cents += Math.max(0, value - (collected ?? 0));
          }
        }
      }
    }
    if (booking.basis === "accepted_quote" || booking.basis === "job_type_estimate") {
      if (booking.basis === "accepted_quote" && booking.estimateId) {
        if (seenQuotes.has(booking.estimateId)) {
          continue;
        }
        seenQuotes.add(booking.estimateId);
      }
      if (booking.amount === null || !Number.isFinite(booking.amount) || booking.amount < 0) {
        unverifiedRows++;
      } else {
        const linkedIds = new Set([
          ...(booking.workingInvoiceIds ?? []),
          ...(sources.won?.items ?? [])
            .filter((row) => row.kind === "invoice" && row.jobId === booking.jobId)
            .map((row) => row.refId),
        ]);
        const collected = [...linkedIds].reduce(
          (sum, id) => sum + (documents.get(id)?.recovered ?? 0),
          0,
        );
        estimated += Math.max(0, Math.round(booking.amount * 100) - collected);
        channel.cents += Math.max(0, Math.round(booking.amount * 100) - collected);
      }
    }
  }
  for (const quote of sources.won?.items ?? []) {
    if (
      quote.kind !== "estimate" ||
      quote.basis !== "accepted_quote" ||
      seenQuotes.has(quote.refId)
    ) {
      continue;
    }
    if (!quote.refId || !Number.isFinite(quote.amount) || quote.amount < 0) {
      unverifiedRows++;
      continue;
    }
    seenQuotes.add(quote.refId);
    estimated += Math.round(quote.amount * 100);
    channels.campaign.cents += Math.round(quote.amount * 100);
  }
  let recovered = 0,
    campaign = 0,
    voice = 0;
  for (const row of documents.values()) {
    recovered += row.recovered;
    campaign += Math.max(0, row.campaign - row.recovered);
    voice += Math.max(0, row.voice - Math.max(row.recovered, row.campaign));
    channels[row.channel].collectedCents += row.recovered;
    channels[row.channel].cents += Math.max(row.recovered, row.campaign, row.voice);
  }
  const bookedChannels = new Map<string, ValueChannel>();
  for (const row of sources.bookings?.items ?? []) {
    if (row.basis !== "cancelled" && !bookedChannels.has(row.jobId)) {
      bookedChannels.set(row.jobId, channelOf(row.source));
    }
  }
  const bookingsFrom = (channel: ValueChannel) =>
    sources.bookings
      ? [...bookedChannels.values()].filter((booked) => booked === channel).length
      : channel === "voice"
        ? (sources.voice?.trackedBookings ?? null)
        : null;
  return {
    total: (recovered + campaign + voice + estimated + bookingInvoiced) / 100,
    estimated: estimated / 100,
    bookingInvoiced: bookingInvoiced / 100,
    recovered: recovered / 100,
    campaign: campaign / 100,
    voice: voice / 100,
    invoiceCount: documents.size,
    partial:
      sources.bookings === null ||
      Boolean(sources.bookings?.partial || sources.bookings?.unpriced) ||
      Boolean(sources.collected?.partial || sources.won?.partial) ||
      !sources.collected ||
      !sources.won ||
      !sources.voice ||
      unverifiedRows > 0 ||
      Boolean(sources.voice.unreadBookings || sources.voice.omittedBookings),
    sources: {
      collected: sources.collected !== null,
      won: sources.won !== null,
      voice: sources.voice !== null,
      bookings: sources.bookings != null,
    },
    bySource: Object.fromEntries(
      (Object.keys(channels) as ValueChannel[]).map((channel) => [
        channel,
        {
          total: channels[channel].cents / 100,
          collected: channels[channel].collectedCents / 100,
          bookings: bookingsFrom(channel),
        },
      ]),
    ) as Record<
      ValueChannel,
      {
        total: number;
        collected: number;
        bookings: number | null;
      }
    >,
    afterOutreach: sources.won
      ? [...afterOutreach.values()].reduce((sum, row) => sum + row.cents, 0) / 100
      : null,
    afterOutreachRows: [...afterOutreach.values()].reduce((sum, row) => sum + row.rows, 0),
    pendingBookings: sources.bookings?.pending ?? 0,
    unpricedBookings: sources.bookings?.unpriced ?? sources.voice?.unpricedBookings ?? null,
    trackedBookings: sources.bookings
      ? new Set(
          sources.bookings.items.filter((row) => row.basis !== "cancelled").map((row) => row.jobId),
        ).size
      : (sources.voice?.trackedBookings ?? null),
    unreadBookings: sources.bookings
      ? sources.bookings.unavailable
      : sources.voice
        ? sources.voice.unreadBookings + sources.voice.omittedBookings
        : null,
    voiceAsOfMs: sources.voice?.asOfMs ?? null,
    unverifiedRows,
  };
}
export type ScoutImpact = ReturnType<typeof scoutImpact>;
