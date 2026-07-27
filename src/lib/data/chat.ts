import "server-only";

import { cache } from "react";
import type { ChatChannelType, MessageContentType, Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

export type SidebarChannel = {
  id: string;
  name: string;
  type: ChatChannelType;
  stationId: string | null;
  isReadOnly: boolean;
  lastMessageAt: string | null;
};

export type SidebarConversation = {
  id: string;
  peerName: string;
  peerPictureUrl: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
};

export type MessagingPeer = {
  userId: string;
  fullName: string;
  role: Role;
  profilePictureUrl: string | null;
  stationName: string | null;
  stationColorHex: string | null;
};

export type MessagingHome = {
  locationId: string;
  channels: SidebarChannel[];
  conversations: SidebarConversation[];
  peers: MessagingPeer[];
};

export type ThreadMessage = {
  id: string;
  channelId: string;
  body: string;
  contentType: MessageContentType;
  metadata: Record<string, unknown>;
  createdAt: string;
  author: {
    id: string;
    fullName: string;
    role: Role;
  };
};

export type DirectThreadMessage = ThreadMessage & { conversationId: string };

export type SopPinSummary = {
  sopId: string;
  title: string;
  body: string;
  pinnedAt: string;
};

export type ChannelThread = {
  channel: SidebarChannel;
  canPost: boolean;
  messages: ThreadMessage[];
  sopPin: SopPinSummary | null;
};

export type DirectConversationThread = {
  conversationId: string;
  peerName: string;
  canPost: boolean;
  messages: DirectThreadMessage[];
};

export async function getDirectConversationThreadForUser(
  userId: string,
  conversationId: string,
): Promise<DirectConversationThread | null> {
  const participant = await prisma.conversationParticipant.findFirst({
    where: { conversationId, userId },
    include: {
      conversation: {
        include: {
          participants: { include: { user: true } },
          messages: {
            include: { author: true },
            orderBy: { createdAt: "asc" },
            take: 200,
          },
        },
      },
    },
  });
  if (!participant) return null;

  const peer = participant.conversation.participants.find((p) => p.userId !== userId)?.user;

  const messages: DirectThreadMessage[] = participant.conversation.messages.map((m) => ({
    id: m.id,
    channelId: m.channelId ?? "",
    conversationId: m.conversationId ?? conversationId,
    body: m.body,
    contentType: m.contentType,
    metadata: (m.metadata ?? {}) as Record<string, unknown>,
    createdAt: m.createdAt.toISOString(),
    author: {
      id: m.author.id,
      fullName: m.author.fullName,
      role: m.author.role,
    },
  }));

  return {
    conversationId,
    peerName: peer?.fullName ?? "Direct",
    canPost: true,
    messages,
  };
}

/** Deduped per request — layout + page both call this on `/messages`. */
export const getMessagingHomeForUser = cache(async function getMessagingHomeForUser(
  userId: string,
): Promise<MessagingHome | null> {
  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  if (!membership) return null;

  const [channelRows, conversationsRows, peerRows] = await Promise.all([
    prisma.chatChannelMember.findMany({
      where: {
        userId,
        channel: {
          locationId: membership.locationId,
          isArchived: false,
        },
      },
      include: {
        channel: {
          include: {
            messages: {
              select: { createdAt: true },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    }),
    prisma.conversationParticipant.findMany({
      where: {
        userId,
        conversation: { locationId: membership.locationId },
      },
      include: {
        conversation: {
          include: {
            participants: { include: { user: true } },
            messages: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
    }),
    prisma.locationMember.findMany({
      where: {
        locationId: membership.locationId,
        userId: { not: userId },
      },
      include: {
        user: { select: { id: true, fullName: true, role: true, profilePictureUrl: true } },
        station: { select: { nameFr: true, colorHex: true } },
      },
      orderBy: [{ user: { fullName: "asc" } }],
    }),
  ]);

  const typeRank: Record<ChatChannelType, number> = {
    ANNOUNCEMENTS: 0,
    MANAGEMENT: 1,
    STATION: 2,
    SHIFT_GROUP: 3,
    CUSTOM_GROUP: 4,
    DIRECT: 5,
  };

  const channels: SidebarChannel[] = channelRows
    .map(({ channel }) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      stationId: channel.stationId,
      isReadOnly: channel.isReadOnly,
      lastMessageAt: channel.messages[0]?.createdAt.toISOString() ?? null,
    }))
    .sort((a, b) => {
      const typeDiff = typeRank[a.type] - typeRank[b.type];
      if (typeDiff !== 0) return typeDiff;
      return a.name.localeCompare(b.name, "fr");
    });

  const conversations: SidebarConversation[] = conversationsRows
    .map(({ conversation }) => {
      const peer = conversation.participants.find((p) => p.userId !== userId)?.user;
      const last = conversation.messages[0];
      return {
        id: conversation.id,
        peerName: peer?.fullName ?? "Direct",
        peerPictureUrl: peer?.profilePictureUrl ?? null,
        lastMessagePreview: last?.body?.slice(0, 80) ?? null,
        lastMessageAt: last?.createdAt.toISOString() ?? conversation.updatedAt.toISOString(),
      };
    })
    .sort((a, b) => {
      const aAt = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
      const bAt = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
      return bAt - aAt;
    });

  const peers: MessagingPeer[] = peerRows.map((row) => ({
    userId: row.user.id,
    fullName: row.user.fullName,
    role: row.user.role,
    profilePictureUrl: row.user.profilePictureUrl,
    stationName: row.station?.nameFr ?? null,
    stationColorHex: row.station?.colorHex ?? null,
  }));

  return { locationId: membership.locationId, channels, conversations, peers };
});

export async function getChannelThreadForUser(userId: string, channelId: string): Promise<ChannelThread | null> {
  const memberRow = await prisma.chatChannelMember.findUnique({
    where: { channelId_userId: { channelId, userId } },
    include: {
      channel: {
        include: {
          messages: {
            include: { author: true },
            orderBy: { createdAt: "asc" },
            take: 200,
          },
          sopPins: {
            include: { sop: true },
            orderBy: { pinnedAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });
  if (!memberRow) return null;

  const { channel } = memberRow;
  const sopPin = channel.sopPins[0]
    ? {
        sopId: channel.sopPins[0].sopId,
        title: channel.sopPins[0].sop.title,
        body: channel.sopPins[0].sop.body,
        pinnedAt: channel.sopPins[0].pinnedAt.toISOString(),
      }
    : null;

  const messages: ThreadMessage[] = channel.messages.map((m) => ({
    id: m.id,
    channelId: m.channelId ?? channelId,
    body: m.body,
    contentType: m.contentType,
    metadata: (m.metadata ?? {}) as Record<string, unknown>,
    createdAt: m.createdAt.toISOString(),
    author: {
      id: m.author.id,
      fullName: m.author.fullName,
      role: m.author.role,
    },
  }));

  return {
    channel: {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      stationId: channel.stationId,
      isReadOnly: channel.isReadOnly,
      lastMessageAt: channel.messages.at(-1)?.createdAt.toISOString() ?? null,
    },
    canPost: memberRow.canPost,
    messages,
    sopPin,
  };
}
