import { notFound } from "next/navigation";
import { BookLayoutHeader } from "@/components/booking/book-chrome";
import { BookingReturnTicket, PublicBookingBoard } from "@/components/booking/public-booking";
import { DbErrorBanner } from "@/components/db-error-banner";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";
import { publicPaymentStatus } from "@/lib/payments/interac-status";
import { prisma } from "@/lib/prisma";
import { listPublicPaymentMethods, publicBookingPath } from "@/lib/public-api/directory";
import { getPublicSchedule } from "@/lib/public-api/schedule";
import { resolvePublicLocation } from "@/lib/public-api/tenant";

export const dynamic = "force-dynamic";

export default async function StudioBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; orgSlug: string; locationSlug: string }>;
  searchParams: Promise<{ enrollmentId?: string; paid?: string; cancelled?: string }>;
}) {
  const { lang, orgSlug, locationSlug } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, { data: location, dbError: locationError }] = await Promise.all([
    getDictionary(lang),
    safeQuery(
      () =>
        resolvePublicLocation({
          organizationSlug: orgSlug,
          locationSlug,
        }),
      null,
    ),
  ]);
  const t = dict.booking;

  if (!location && !locationError) notFound();

  const path = publicBookingPath(lang, orgSlug, locationSlug);
  const studioName = location
    ? `${location.organizationName} · ${location.name}`
    : undefined;

  const [{ enrollmentId }, scheduleResult, methodsResult, returnedResult] = await Promise.all([
    searchParams,
    location
      ? safeQuery(
          () => getPublicSchedule({ locationId: location.id, locale: lang }),
          { locationId: location.id, season: null, classes: [] },
        )
      : Promise.resolve({
          data: { locationId: "", season: null, classes: [] },
          dbError: locationError,
        }),
    location
      ? safeQuery(() => listPublicPaymentMethods(location.organizationId), ["interac"] as const)
      : Promise.resolve({ data: ["interac"] as const, dbError: locationError }),
    Promise.resolve(null as { ticketCode: string | null; paid: boolean; waitlisted: boolean } | null),
  ]);

  let returned = returnedResult;
  if (enrollmentId && /^[0-9a-f-]{36}$/i.test(enrollmentId)) {
    const { data: row } = await safeQuery(
      () =>
        prisma.enrollment.findUnique({
          where: { id: enrollmentId },
          select: {
            ticketCode: true,
            paid: true,
            waitlisted: true,
            paymentStatus: true,
            paymentProvider: true,
          },
        }),
      null,
    );
    if (row) {
      const status = publicPaymentStatus(row.paymentStatus, row.paymentProvider);
      returned = {
        ticketCode: row.ticketCode,
        paid: row.paid || status === "paid",
        waitlisted: row.waitlisted,
      };
    }
  }

  const schedule = scheduleResult.data;
  const bookingOpen = Boolean(schedule.season) || schedule.classes.length > 0;
  const dbError = locationError || scheduleResult.dbError || methodsResult.dbError;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <BookLayoutHeader
        lang={lang}
        kicker={t.kicker}
        title={t.title}
        subtitle={t.subtitle}
        studioName={studioName}
        pathAfterLang={`/book/${orgSlug}/${locationSlug}`}
      />
      {dbError ? <DbErrorBanner label={dict.common.dbDisconnected} /> : null}
      {returned ? (
        <BookingReturnTicket
          ticketCode={returned.ticketCode}
          paid={returned.paid}
          waitlisted={returned.waitlisted}
          dict={dict}
          backHref={path}
        />
      ) : (
        <PublicBookingBoard
          lang={lang}
          studioName={location?.organizationName ?? ""}
          seasonName={schedule.season?.name ?? null}
          bookingOpen={bookingOpen && !dbError}
          classes={schedule.classes}
          paymentMethods={[...methodsResult.data]}
          returnUrl={`${path}?paid=1`}
          cancelUrl={`${path}?cancelled=1`}
          dict={dict}
        />
      )}
    </div>
  );
}
