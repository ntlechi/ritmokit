"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { BATI_VALUE_KEYS } from "@/lib/culture/values";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";

export type ShoutOutActionResult =
  | { ok: true; channelId: string | null }
  | { ok: false; error: string };

function isValueKey(value: string): boolean {
  return (BATI_VALUE_KEYS as readonly string[]).includes(value);
}

/**
 * Shout-out station : enregistrement Culture Health + miroir sur le canal #station.
 */
export async function sendStationShoutOutAction(input: {
  locationId: string;
  receiverId: string;
  stationId: string;
  valueKey: string;
  message: string;
  lang?: string;
}): Promise<ShoutOutActionResult> {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) return { ok: false, error: "unauthorized" };
    if (sessionUser.id === input.receiverId) {
      return { ok: false, error: "auto_shout_out_forbidden" };
    }

    const message = input.message.trim().slice(0, 140);
    if (message.length < 3) return { ok: false, error: "message_too_short" };
    if (!isValueKey(input.valueKey)) return { ok: false, error: "invalid_value" };

    const senderMembership = await prisma.locationMember.findUnique({
      where: {
        locationId_userId: { locationId: input.locationId, userId: sessionUser.id },
      },
      include: { location: { select: { organizationId: true } } },
    });
    if (!senderMembership) return { ok: false, error: "unauthorized" };

    const station = await prisma.station.findFirst({
      where: { id: input.stationId, locationId: input.locationId, isActive: true },
      select: { id: true, slug: true },
    });
    if (!station) return { ok: false, error: "invalid_station" };

    const receiverMembership = await prisma.locationMember.findUnique({
      where: {
        locationId_userId: { locationId: input.locationId, userId: input.receiverId },
      },
      include: { user: { select: { fullName: true } } },
    });
    if (!receiverMembership) return { ok: false, error: "receiver_not_found" };

    const value = await prisma.organizationValue.findUnique({
      where: {
        organizationId_valueKey: {
          organizationId: senderMembership.location.organizationId,
          valueKey: input.valueKey,
        },
      },
    });
    if (!value || !value.isActive) return { ok: false, error: "invalid_value" };

    const channelSlug =
      station.slug === "services" ? "comptoir" : (station.slug ?? station.id);
    const channel = await prisma.chatChannel.findFirst({
      where: {
        locationId: input.locationId,
        OR: [{ stationId: station.id }, { slug: channelSlug }],
      },
      select: { id: true, isReadOnly: true, isArchived: true },
    });

    const body = `🙌 Shout-out à ${receiverMembership.user.fullName} — #${value.valueKey}: « ${message} »`;

    const result = await prisma.$transaction(async (tx) => {
      let chatMessageId: string | null = null;
      let channelId: string | null = null;

      if (channel && !channel.isArchived && !channel.isReadOnly) {
        await tx.chatChannelMember.upsert({
          where: {
            channelId_userId: { channelId: channel.id, userId: sessionUser.id },
          },
          create: {
            channelId: channel.id,
            userId: sessionUser.id,
            canPost: true,
          },
          update: {},
        });

        const msg = await tx.chatMessage.create({
          data: {
            channelId: channel.id,
            authorId: sessionUser.id,
            contentType: "TEXT",
            body,
            metadata: {
              source: "ui.shoutout",
              shoutOut: true,
              valueKey: input.valueKey,
              receiverId: input.receiverId,
              stationId: station.id,
            },
          },
        });
        chatMessageId = msg.id;
        channelId = channel.id;
      }

      await tx.stationShoutOut.create({
        data: {
          locationId: input.locationId,
          senderId: sessionUser.id,
          receiverId: input.receiverId,
          stationId: station.id,
          valueKey: input.valueKey,
          message,
          chatMessageId,
        },
      });

      return { channelId };
    });

    const lang = input.lang ?? "fr";
    revalidatePath(`/${lang}/calendar/mobile`, "page");
    revalidatePath(`/${lang}/settings/manager/culture`, "page");
    revalidatePath(`/${lang}/messages`, "layout");
    if (result.channelId) {
      revalidatePath(`/${lang}/messages/${result.channelId}`, "page");
    }

    return { ok: true, channelId: result.channelId };
  } catch (error) {
    return actionDatabaseError("shoutouts", error);
  }
}
