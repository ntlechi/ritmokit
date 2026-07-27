import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { BATI_CULTURE_CONSTITUTION } from "@/lib/culture/values";
import { prisma } from "@/lib/prisma";
import {
  AGENT_PLAYBOOK_NAMES,
  DEFAULT_AGENT_PLAYBOOKS,
} from "@/lib/rsi/playbooks";

const STATION_DEFS = [
  { slug: "entretiens", nameFr: "Entretiens", nameEn: "Maintenance", nameEs: "Mantenimiento", colorHex: "#6B7280", tipPoints: 0.8, sortOrder: 1 },
  { slug: "cuisine", nameFr: "Cuisine", nameEn: "Kitchen", nameEs: "Cocina", colorHex: "#EF4444", tipPoints: 0.8, sortOrder: 2 },
  { slug: "services", nameFr: "Services", nameEn: "Services", nameEs: "Servicios", colorHex: "#10B981", tipPoints: 1.2, sortOrder: 3 },
  { slug: "gerants-jour", nameFr: "Gérants (Jour)", nameEn: "Managers (Day)", nameEs: "Gerentes (Día)", colorHex: "#3B82F6", tipPoints: 1.0, sortOrder: 4 },
  { slug: "gerants-soir", nameFr: "Gérants (Soir)", nameEn: "Managers (Night)", nameEs: "Gerentes (Noche)", colorHex: "#1E3A8A", tipPoints: 1.0, sortOrder: 5 },
] as const;

const DEFAULT_CHANNELS: Array<{
  slug: string;
  name: string;
  type: "ANNOUNCEMENTS" | "STATION" | "MANAGEMENT";
  stationSlug?: (typeof STATION_DEFS)[number]["slug"];
  isReadOnly?: boolean;
}> = [
  { slug: "annonces", name: "Annonces", type: "ANNOUNCEMENTS", isReadOnly: true },
  { slug: "cuisine", name: "Cuisine", type: "STATION", stationSlug: "cuisine" },
  { slug: "services", name: "Services", type: "STATION", stationSlug: "services" },
  { slug: "entretiens", name: "Entretiens", type: "STATION", stationSlug: "entretiens" },
  { slug: "gestion", name: "Gestion", type: "MANAGEMENT" },
];

export type ProvisionFranchiseInput = {
  orgName: string;
  orgSlug: string;
  locationName: string;
  locationSlug: string;
  /** Existing `users.id` (= Supabase auth.users.id). Must already exist. */
  ownerUserId: string;
  city?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
  geofenceRadiusMeters?: number;
  /** Station slug assigned to the owner on the floor roster (default services). */
  ownerStationSlug?: string;
};

export type ProvisionFranchiseResult = {
  organizationId: string;
  locationId: string;
  channelsCreated: number;
  agentConfigsCreated: number;
  cultureValuesUpserted: number;
};

function slugify(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Provisionne une franchise Bati de façon transactionnelle et idempotente
 * sur les upserts culture / canaux / playbooks.
 */
export async function provisionNewBatiFranchise(
  input: ProvisionFranchiseInput,
): Promise<ProvisionFranchiseResult> {
  const orgSlug = slugify(input.orgSlug || input.orgName);
  const locationSlug = slugify(input.locationSlug || input.locationName);
  if (!orgSlug || !locationSlug) {
    throw new Error("invalid_slug");
  }

  const owner = await prisma.user.findUnique({
    where: { id: input.ownerUserId },
    select: { id: true, role: true },
  });
  if (!owner) throw new Error("owner_not_found");

  const timezone = input.timezone ?? "America/Toronto";
  const geofenceRadiusMeters = input.geofenceRadiusMeters ?? 150;
  const ownerStationSlug = input.ownerStationSlug ?? "services";

  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.upsert({
      where: { slug: orgSlug },
      update: { name: input.orgName },
      create: { name: input.orgName, slug: orgSlug },
    });

    const location = await tx.location.upsert({
      where: {
        organizationId_slug: {
          organizationId: organization.id,
          slug: locationSlug,
        },
      },
      update: {
        name: input.locationName,
        city: input.city,
        timezone,
        latitude: input.latitude,
        longitude: input.longitude,
        geofenceRadiusMeters,
        isActive: true,
      },
      create: {
        organizationId: organization.id,
        name: input.locationName,
        slug: locationSlug,
        city: input.city,
        timezone,
        latitude: input.latitude,
        longitude: input.longitude,
        geofenceRadiusMeters,
      },
    });

    const stationIdBySlug: Record<string, string> = {};
    for (const def of STATION_DEFS) {
      const station = await tx.station.upsert({
        where: { locationId_slug: { locationId: location.id, slug: def.slug } },
        update: {
          nameFr: def.nameFr,
          nameEn: def.nameEn,
          nameEs: def.nameEs,
          colorHex: def.colorHex,
          tipPoints: def.tipPoints,
          sortOrder: def.sortOrder,
          isActive: true,
        },
        create: {
          locationId: location.id,
          slug: def.slug,
          nameFr: def.nameFr,
          nameEn: def.nameEn,
          nameEs: def.nameEs,
          colorHex: def.colorHex,
          tipPoints: def.tipPoints,
          sortOrder: def.sortOrder,
        },
      });
      stationIdBySlug[def.slug] = station.id;
    }

    const ownerStationId = stationIdBySlug[ownerStationSlug] ?? stationIdBySlug.services;

    if (owner.role !== "OWNER" && owner.role !== "ADMIN") {
      await tx.user.update({
        where: { id: owner.id },
        data: { role: "OWNER" },
      });
    }

    await tx.locationMember.upsert({
      where: {
        locationId_userId: {
          locationId: location.id,
          userId: owner.id,
        },
      },
      update: { stationId: ownerStationId, isPrimary: true },
      create: {
        locationId: location.id,
        userId: owner.id,
        stationId: ownerStationId,
        isPrimary: true,
      },
    });

    let cultureValuesUpserted = 0;
    for (const val of BATI_CULTURE_CONSTITUTION) {
      await tx.organizationValue.upsert({
        where: {
          organizationId_valueKey: {
            organizationId: organization.id,
            valueKey: val.valueKey,
          },
        },
        update: {
          titleFr: val.titleFr,
          titleEn: val.titleEn,
          titleEs: val.titleEs,
          behaviorFr: val.behaviorFr,
          behaviorEn: val.behaviorEn,
          behaviorEs: val.behaviorEs,
          sortOrder: val.sortOrder,
          isActive: true,
        },
        create: {
          organizationId: organization.id,
          valueKey: val.valueKey,
          titleFr: val.titleFr,
          titleEn: val.titleEn,
          titleEs: val.titleEs,
          behaviorFr: val.behaviorFr,
          behaviorEn: val.behaviorEn,
          behaviorEs: val.behaviorEs,
          sortOrder: val.sortOrder,
          isActive: true,
        },
      });
      cultureValuesUpserted += 1;
    }

    let channelsCreated = 0;
    for (const ch of DEFAULT_CHANNELS) {
      const stationId = ch.stationSlug ? stationIdBySlug[ch.stationSlug] : null;
      const channel = await tx.chatChannel.upsert({
        where: {
          locationId_slug: { locationId: location.id, slug: ch.slug },
        },
        update: {
          name: ch.name,
          type: ch.type,
          stationId,
          isReadOnly: ch.isReadOnly ?? false,
          isArchived: false,
        },
        create: {
          locationId: location.id,
          slug: ch.slug,
          name: ch.name,
          type: ch.type,
          stationId,
          isReadOnly: ch.isReadOnly ?? false,
        },
      });
      channelsCreated += 1;

      await tx.chatChannelMember.upsert({
        where: {
          channelId_userId: { channelId: channel.id, userId: owner.id },
        },
        update: { canPost: true },
        create: {
          channelId: channel.id,
          userId: owner.id,
          canPost: true,
        },
      });
    }

    let agentConfigsCreated = 0;
    for (const agentName of AGENT_PLAYBOOK_NAMES) {
      const settings = DEFAULT_AGENT_PLAYBOOKS[agentName] as unknown as Prisma.InputJsonValue;
      await tx.locationAgentConfig.upsert({
        where: {
          locationId_agentName: {
            locationId: location.id,
            agentName,
          },
        },
        update: {
          settings,
          updatedById: owner.id,
        },
        create: {
          locationId: location.id,
          agentName,
          settings,
          version: 1,
          updatedById: owner.id,
        },
      });
      agentConfigsCreated += 1;
    }

    await tx.productExperiment.upsert({
      where: {
        organizationId_hypothesisKey: {
          organizationId: organization.id,
          hypothesisKey: "CULTURE_CARD_ABOVE_BUDDY",
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        hypothesisKey: "CULTURE_CARD_ABOVE_BUDDY",
        descriptionFr:
          "Placer la carte Culture au-dessus du buddy augmente le volume de shout-outs de ≥ 15 % vs témoin.",
        descriptionEn:
          "Placing the Culture card above buddy increases shout-out volume by ≥ 15% vs control.",
        descriptionEs:
          "Colocar la tarjeta Culture encima del buddy aumenta el volumen de shout-outs ≥ 15 % vs control.",
        targetMetric: "SHOUTOUT_VOLUME",
        liftThreshold: 0.15,
        durationDays: 28,
        status: "DRAFT",
        configVariantA: { cultureCardAboveBuddy: false },
        configVariantB: { cultureCardAboveBuddy: true },
      },
    });

    return {
      organizationId: organization.id,
      locationId: location.id,
      channelsCreated,
      agentConfigsCreated,
      cultureValuesUpserted,
    };
  });
}
