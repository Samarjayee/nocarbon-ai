// app/api/chat/route.ts
import { NextRequest } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { generateUUID } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';

// Define the Message type locally
type Message = {
  id?: string;
  role: 'user' | 'assistant' | 'data' | 'system';
  content: string;
  createdAt?: Date;
  chatId?: string;
};

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // Validate LAMBDA_URL environment variable
    const lambdaUrl = process.env.LAMBDA_URL;
    if (!lambdaUrl) {
      throw new Error('LAMBDA_URL environment variable is not set');
    }

    const json = await req.json();
    const { id, messages }: { id: string; messages: Array<Message> } = json;

    // Authenticate the user
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      console.error('Unauthorized access attempt');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get the latest user message
    const latestMessage = messages[messages.length - 1];
    if (!latestMessage || latestMessage.role !== 'user') {
      console.error('No user message found in request');
      return new Response(JSON.stringify({ error: 'No user message found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log('Received query from frontend:', latestMessage.content);

    // Check if the chat exists; if not, create it
    const chat = await getChatById({ id });
    if (!chat) {
      const title = await generateTitleFromUserMessage({ message: { ...latestMessage, role: 'user' } });
      await saveChat({ id, userId: session.user.id, title });
      console.log('Created new chat with ID:', id, 'and title:', title);
    }

    // Save the user message
    const userMessageId = generateUUID();
    await saveMessages({
      messages: [
        { ...latestMessage, id: userMessageId, createdAt: new Date(), chatId: id },
      ],
    });
    console.log('Saved user message with ID:', userMessageId);

    // Call Lambda function
    const response = await fetch(lambdaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        input: latestMessage.content, 
        conversationId: id,
        userEmail: session.user.email // Include user email in the payload
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Lambda error response:', errorData);
      throw new Error(`Lambda request failed with status ${response.status}: ${errorData.error || 'Unknown error'}`);
    }

    const result = await response.json();
    console.log('Lambda response:', result);
    const lambdaResponse = result.response || 'Error: No response from Lambda';

    // Create a stream to send the response incrementally
    const stream = new ReadableStream({
      async start(controller) {
        const assistantMessageId = generateUUID();
        let fullResponse = '';

        // Split the response into words (or characters) for streaming
        const words = lambdaResponse.split(' '); // Split by words for a word-by-word effect
        for (const word of words) {
          fullResponse += word + ' ';
          const chunk = JSON.stringify({
            result: word + ' ', // Add space to reconstruct the sentence
            userMessageId,
            assistantMessageId,
          }) + '\n';
          controller.enqueue(new TextEncoder().encode(chunk));
          // Add a small delay to simulate streaming (adjust as needed)
          await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay per word
        }

        // Save the full assistant response to the database after streaming
        await saveMessages({
          messages: [
            {
              id: assistantMessageId,
              chatId: id,
              role: 'assistant',
              content: fullResponse.trim(),
              createdAt: new Date(),
            },
          ],
        });
        console.log('Saved assistant message with ID:', assistantMessageId);

        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson', // Use NDJSON for streaming
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    console.error('Error in chat API:', error.message);
    return new Response(
      JSON.stringify({
        error: error.message || 'An error occurred while processing your request',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      console.error('No chat ID provided for deletion');
      return new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const session = await auth();
    if (!session || !session.user) {
      console.error('Unauthorized attempt to delete chat:', id);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const chat = await getChatById({ id });
    if (chat.userId !== session.user.id) {
      console.error('User not authorized to delete chat:', id);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await deleteChatById({ id });
    console.log('Successfully deleted chat with ID:', id);

    return new Response(JSON.stringify({ message: 'Chat deleted' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error deleting chat:', error.message);
    return new Response(
      JSON.stringify({
        error: error.message || 'An error occurred while processing your request',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}