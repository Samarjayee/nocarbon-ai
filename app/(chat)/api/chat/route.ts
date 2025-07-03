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

// Define the Message type
type Message = {
  id?: string;
  role: 'user' | 'assistant' | 'data' | 'system';
  content: string;
  createdAt?: Date;
  chatId?: string;
};

// Define the Attachment type
type Attachment = {
  filename: string;
  mime_type: string;
  data: string;
};

// Define the structure of the request body from the client
type ClientRequestBody = {
  id: string;
  messages: Array<Message>;
  attachment?: Attachment;
};

// Define the structure of the payload for the Lambda
type LambdaPayload = {
  input: string;
  conversationId: string;
  userEmail?: string | null;
  attachment?: Attachment;
};

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const lambdaUrl = process.env.LAMBDA_URL;
    if (!lambdaUrl) {
      console.error('LAMBDA_URL environment variable is not set');
      throw new Error('LAMBDA_URL environment variable is not set');
    }

    // Capture the real user's IP from the incoming request headers
    const userIp = req.headers.get('x-forwarded-for') || '127.0.0.1';
    console.log(`Request received from User IP: ${userIp}`);

    const requestBodyFromClientUI: ClientRequestBody = await req.json();
    const { id, messages, attachment } = requestBodyFromClientUI;

    const session = await auth();
    if (!session || !session.user || !session.user.id || !session.user.email) {
      console.error('Unauthorized access attempt or missing user details in session');
      return new Response(JSON.stringify({ error: 'Unauthorized or session invalid' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const latestMessage = messages[messages.length - 1];
    if (!latestMessage || latestMessage.role !== 'user') {
      console.error('No user message found in request');
      return new Response(JSON.stringify({ error: 'No user message found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log('Received query from frontend UI:', latestMessage.content);
    if (attachment) {
      console.log('Received attachment from frontend UI in /api/chat route:', attachment.filename);
    } else {
      console.log('No attachment received from frontend UI in /api/chat route.');
    }

    const chat = await getChatById({ id });
    if (!chat) {
      const title = await generateTitleFromUserMessage({ message: { ...latestMessage, role: 'user' } });
      await saveChat({ id, userId: session.user.id, title });
      console.log('Created new chat with ID:', id, 'and title:', title);
    }

    const userMessageId = generateUUID();
    await saveMessages({
      messages: [
        { ...latestMessage, id: userMessageId, createdAt: new Date(), chatId: id },
      ],
    });
    console.log('Saved user message with ID:', userMessageId);

    const payloadForLambda: LambdaPayload = {
      input: latestMessage.content,
      conversationId: id,
      userEmail: session.user.email,
    };

    if (attachment) {
      payloadForLambda.attachment = attachment;
    }

    console.log(
      'Sending payload to Lambda:',
      JSON.stringify(payloadForLambda, (key, value) =>
        key === 'data' && typeof value === 'string' && value.length > 30
          ? value.substring(0, 30) + '... [truncated]'
          : value
      )
    );

    const responseFromLambda = await fetch(lambdaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward the real user's IP in the custom 'X-User-IP' header
        'X-User-IP': userIp
      },
      body: JSON.stringify(payloadForLambda),
    });

    if (!responseFromLambda.ok) {
      let errorData;
      try {
        errorData = await responseFromLambda.json();
      } catch (e) {
        errorData = { error: await responseFromLambda.text() };
      }
      console.error('Lambda error response:', errorData);
      throw new Error(
        `Lambda request failed with status ${responseFromLambda.status}: ${errorData.error || 'Unknown error from Lambda'}`
      );
    }

    const resultFromLambda = await responseFromLambda.json();
    console.log('Lambda response:', resultFromLambda);

    let messageContent = resultFromLambda.response || 'Error: No response content from Lambda';
    if (resultFromLambda.downloadLink) {
      messageContent = `${messageContent}\n\n[Click here to download](${resultFromLambda.downloadLink})`;
    }

    const stream = new ReadableStream({
      async start(controller) {
        const assistantMessageId = generateUUID();
        let fullResponse = '';
        const words = messageContent.split(' ');
        for (const word of words) {
          fullResponse += word + ' ';
          const chunk = JSON.stringify({
            result: word + ' ',
            userMessageId,
            assistantMessageId,
          }) + '\n';
          controller.enqueue(new TextEncoder().encode(chunk));
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        console.log('Formatted response for streaming:', fullResponse.trim());

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
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    console.error('Error in chat API (/api/chat/route.ts):', error.message, error.stack);
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
    if (!session || !session.user || !session.user.id) {
      console.error('Unauthorized attempt to delete chat:', id);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const chat = await getChatById({ id });
    if (!chat || chat.userId !== session.user.id) {
      console.error('User not authorized to delete chat or chat not found:', id);
      return new Response(JSON.stringify({ error: 'Unauthorized or Chat not found' }), {
        status: chat ? 401 : 404,
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
    console.error('Error deleting chat:', error.message, error.stack);
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