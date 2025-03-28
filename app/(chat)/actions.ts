// app/actions.ts
'use server';

import { cookies } from 'next/headers';
import {
  deleteMessagesByChatIdAfterTimestamp,
  getMessageById,
  updateChatVisiblityById,
} from '@/lib/db/queries';
import { VisibilityType } from '@/components/visibility-selector';

// Define the Message type locally to match other files
type Message = {
  id?: string;
  role: 'user' | 'assistant' | 'data' | 'system';
  content: string;
  createdAt?: Date;
  chatId?: string;
};

export async function saveModelId(model: string) {
  const cookieStore = await cookies();
  cookieStore.set('model-id', model);
}

export async function generateTitleFromUserMessage({
  message,
}: {
  message: Message;
}) {
  // Generate a title by truncating the message
  const maxLength = 80;
  let title = message.content.trim();

  // If the message is too long, truncate it and add ellipsis
  if (title.length > maxLength) {
    title = title.substring(0, maxLength - 3) + '...';
  }

  // If the message is empty, use a default title
  if (!title) {
    title = 'Untitled Chat';
  }

  // Ensure the title does not contain quotes or colons
  title = title.replace(/['":]/g, '');

  return title;
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const [message] = await getMessageById({ id });

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  await updateChatVisiblityById({ chatId, visibility });
}