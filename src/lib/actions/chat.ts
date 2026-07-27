"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { logActionError } from "@/lib/actions/result";
import { getOrCreateDirectConversation } from "@/lib/hr/buddy";
import { prisma } from "@/lib/prisma";

export type ChatActionResult = { ok: true } | { ok: false; error: string };

export type StartDirectResult =
  | { ok: true; conversationId: string }
  | { ok: false; error: string };

export type CreateGroupResult =
  | { ok: true; channelId: string }
  | { ok: false; error: string };

function slugifyGroupName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "groupe";
}

export async function sendMessageAction(input: {
  lang: string;
  channelId: string;
  body: string;
}): Promise<ChatActionResult> {
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Message vide." };

  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const membership = await prisma.chatChannelMember.findUnique({
    where: { channelId_userId: { channelId: input.channelId, userId: user.id } },
    include: { channel: true },
  });

  if (!membership) {
    return { ok: false, error: "Accès refusé à ce canal." };
  }
  if (!membership.canPost || membership.channel.isReadOnly) {
    return { ok: false, error: "Ce canal est en lecture seule." };
  }

  await prisma.chatMessage.create({
    data: {
      channelId: input.channelId,
      authorId: user.id,
      contentType: "TEXT",
      body,
      metadata: { source: "ui.chat" },
    },
  });

  revalidatePath(`/${input.lang}/messages/${input.channelId}`);
  revalidatePath(`/${input.lang}/messages`);
  return { ok: true };
}

export async function sendDirectMessageAction(input: {
  lang: string;
  conversationId: string;
  body: string;
}): Promise<ChatActionResult> {
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Message vide." };

  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const participant = await prisma.conversationParticipant.findUnique({
    where: {
      conversationId_userId: { conversationId: input.conversationId, userId: user.id },
    },
  });
  if (!participant) return { ok: false, error: "Accès refusé à cette conversation." };

  await prisma.chatMessage.create({
    data: {
      conversationId: input.conversationId,
      authorId: user.id,
      contentType: "TEXT",
      body,
      metadata: { source: "ui.direct" },
    },
  });

  // Touch conversation updatedAt for sidebar ordering
  await prisma.directConversation.update({
    where: { id: input.conversationId },
    data: { updatedAt: new Date() },
  });

  revalidatePath(`/${input.lang}/messages/dm/${input.conversationId}`);
  revalidatePath(`/${input.lang}/messages`);
  return { ok: true };
}

/**
 * Ouvre (ou crée) une conversation 1:1 sécurisée avec un collègue de la même succursale.
 */
export async function startDirectConversationAction(input: {
  lang: string;
  peerUserId: string;
}): Promise<StartDirectResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "session" };

  if (input.peerUserId === user.id) {
    return { ok: false, error: "cannotMessageSelf" };
  }

  const myMembership = await prisma.locationMember.findFirst({
    where: { userId: user.id },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { locationId: true },
  });
  if (!myMembership) return { ok: false, error: "peerNotSameLocation" };

  const peerMembership = await prisma.locationMember.findFirst({
    where: {
      userId: input.peerUserId,
      locationId: myMembership.locationId,
    },
    select: { userId: true },
  });
  if (!peerMembership) return { ok: false, error: "peerNotSameLocation" };

  const peer = await prisma.user.findUnique({
    where: { id: input.peerUserId },
    select: { id: true },
  });
  if (!peer) return { ok: false, error: "peerNotFound" };

  try {
    const conversationId = await getOrCreateDirectConversation({
      locationId: myMembership.locationId,
      userIdA: user.id,
      userIdB: input.peerUserId,
    });

    revalidatePath(`/${input.lang}/messages`);
    return { ok: true, conversationId };
  } catch (error) {
    logActionError("chat", error);
    return { ok: false, error: "createFailed" };
  }
}

/**
 * Crée un canal CUSTOM_GROUP privé — seuls les membres sélectionnés y ont accès.
 */
export async function createGroupChannelAction(input: {
  lang: string;
  name: string;
  memberUserIds: string[];
}): Promise<CreateGroupResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "session" };

  const name = input.name.trim().slice(0, 60);
  if (!name) return { ok: false, error: "groupNameRequired" };

  const uniqueMemberIds = [...new Set(input.memberUserIds.filter((id) => id !== user.id))];
  if (uniqueMemberIds.length === 0) return { ok: false, error: "membersRequired" };

  const myMembership = await prisma.locationMember.findFirst({
    where: { userId: user.id },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { locationId: true },
  });
  if (!myMembership) return { ok: false, error: "createFailed" };

  const validPeers = await prisma.locationMember.findMany({
    where: {
      locationId: myMembership.locationId,
      userId: { in: uniqueMemberIds },
    },
    select: { userId: true },
  });
  if (validPeers.length !== uniqueMemberIds.length) {
    return { ok: false, error: "membersInvalid" };
  }

  const slugBase = slugifyGroupName(name);
  const slug = `${slugBase}-${Date.now().toString(36)}`;

  try {
    const channel = await prisma.chatChannel.create({
      data: {
        locationId: myMembership.locationId,
        type: "CUSTOM_GROUP",
        name,
        slug,
        isReadOnly: false,
        members: {
          create: [
            { userId: user.id, canPost: true },
            ...validPeers.map((p) => ({ userId: p.userId, canPost: true })),
          ],
        },
        messages: {
          create: {
            authorId: user.id,
            contentType: "SYSTEM",
            body: `Groupe « ${name} » créé.`,
            metadata: { source: "ui.group.create" },
          },
        },
      },
      select: { id: true },
    });

    revalidatePath(`/${input.lang}/messages`);
    revalidatePath(`/${input.lang}/messages/${channel.id}`);
    return { ok: true, channelId: channel.id };
  } catch (error) {
    logActionError("chat", error);
    return { ok: false, error: "createFailed" };
  }
}

/** Marque une conversation DM comme lue (lastReadAt). */
export async function markDirectReadAction(conversationId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;

  await prisma.conversationParticipant.updateMany({
    where: { conversationId, userId: user.id },
    data: { lastReadAt: new Date() },
  });
}
