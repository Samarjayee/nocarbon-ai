'use client';

import cx from 'classnames';
import type React from 'react';
import {
  useRef,
  useEffect,
  useState,
  useCallback,
  type Dispatch,
  type SetStateAction,
  memo,
} from 'react';
import { toast } from 'sonner';
import { useLocalStorage, useWindowSize } from 'usehooks-ts';

import { ArrowUpIcon, StopIcon } from './icons';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { SuggestedActions } from './suggested-actions';
import equal from 'fast-deep-equal';

type Message = {
  id?: string;
  role: 'user' | 'assistant' | 'data' | 'system';
  content: string;
};

type CreateMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type SendMessageFunction = (message: Message | CreateMessage) => Promise<string | null | undefined>;

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  isLoading,
  stop,
  messages,
  setMessages,
  className,
  handleSubmit, // Add handleSubmit to props
  append, // Add append to props
  ...props // Allow extra props like attachments, setAttachments
}: {
  chatId: string;
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  stop: () => void;
  messages: Array<Message>;
  setMessages: Dispatch<SetStateAction<Array<Message>>>;
  className?: string;
  handleSubmit?: (event?: { preventDefault?: () => void }, chatRequestOptions?: any) => void; // Type for handleSubmit
  append?: (message: Message | CreateMessage, chatRequestOptions?: any) => void; // Type for append
  [key: string]: any; // Allow extra props
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, []);

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight + 2}px`;
    }
  };

  const resetHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = '98px';
    }
  };

  const [localStorageInput, setLocalStorageInput] = useLocalStorage('input', '');

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      const finalValue = domValue || localStorageInput || '';
      setInput(finalValue);
      adjustHeight();
    }
  }, [localStorageInput, setInput]); // Add dependencies to fix ESLint warning

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    adjustHeight();
  };

  const sendMessage: SendMessageFunction = useCallback(
    async (message: Message | CreateMessage) => {
      try {
        // Add the user's message to the chat interface
        const userMessageId = `${Date.now()}-${Math.random()}`;
        console.log('Query sent from frontend:', message.content);
        setMessages((prevMessages) => [
          ...prevMessages,
          { ...message, id: userMessageId } as Message,
        ]);

        // Send the query to the backend API, which proxies to the Lambda
        console.log('Sending request to /api/chat with chatId:', chatId);
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: chatId,
            messages: [...messages, message],
          }),
        });

        if (!response.ok) {
          throw new Error(`Backend request failed with status ${response.status}`);
        }

        if (!response.body) {
          throw new Error('No response body to stream');
        }

        // Handle the streaming response (NDJSON format)
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        let assistantMessageId: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // Add the full assistant message to the messages array
            setMessages((prevMessages) => {
              const updatedMessages = [...prevMessages];
              const lastMessage = updatedMessages[updatedMessages.length - 1];
              if (lastMessage.role === 'assistant' && lastMessage.id === assistantMessageId) {
                // Update the existing assistant message with the full content
                updatedMessages[updatedMessages.length - 1] = {
                  ...lastMessage,
                  content: fullResponse,
                };
              } else {
                // Add a new assistant message
                updatedMessages.push({
                  role: 'assistant',
                  content: fullResponse,
                  id: assistantMessageId || `${Date.now()}-${Math.random()}`,
                });
              }
              console.log('Response displayed on frontend:', fullResponse);
              return updatedMessages;
            });
            break;
          }

          // Decode the chunk and split into lines (NDJSON format)
          const chunkText = decoder.decode(value, { stream: true });
          const lines = chunkText.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            try {
              const chunkData = JSON.parse(line);
              const text = chunkData.result || '';
              assistantMessageId = chunkData.assistantMessageId || assistantMessageId;

              fullResponse += text;

              // Update the UI incrementally by updating the last assistant message
              setMessages((prevMessages) => {
                const updatedMessages = [...prevMessages];
                const lastMessage = updatedMessages[updatedMessages.length - 1];

                if (lastMessage.role === 'assistant' && lastMessage.id === assistantMessageId) {
                  // Update the existing assistant message
                  updatedMessages[updatedMessages.length - 1] = {
                    ...lastMessage,
                    content: fullResponse,
                  };
                } else {
                  // Add a new assistant message
                  updatedMessages.push({
                    role: 'assistant',
                    content: fullResponse,
                    id: assistantMessageId || `${Date.now()}-${Math.random()}`,
                  });
                }
                return updatedMessages;
              });
            } catch (e) {
              console.error('Error parsing chunk:', e);
            }
          }
        }

        return userMessageId;
      } catch (error: any) {
        console.error('Error processing query:', error.message);
        toast.error('Failed to get response from server.');
        setMessages((prevMessages) => [
          ...prevMessages,
          { role: 'assistant', content: 'Error: Unable to process your query.', id: `${Date.now()}-${Math.random()}` } as Message,
        ]);
        return null;
      }
    },
    [chatId, messages, setMessages]
  );

  const submitForm = useCallback(() => {
    window.history.replaceState({}, '', `/chat/${chatId}`);

    const message: CreateMessage = {
      role: 'user',
      content: input,
    };

    sendMessage(message);
    setInput('');
    setLocalStorageInput('');
    resetHeight();

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [input, sendMessage, setInput, setLocalStorageInput, width, chatId]);

  return (
    <div className="relative w-full flex flex-col gap-4">
      {messages.length === 0 && (
        <SuggestedActions sendMessage={sendMessage} chatId={chatId} />
      )}

      <Textarea
        ref={textareaRef}
        placeholder="Send a message..."
        value={input}
        onChange={handleInput}
        className={cx(
          'min-h-[24px] max-h-[calc(75dvh)] overflow-hidden resize-none rounded-2xl !text-base bg-muted pb-10 dark:border-zinc-700',
          className,
        )}
        rows={2}
        autoFocus
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();

            if (isLoading) {
              toast.error('Please wait for the response!');
            } else {
              submitForm();
            }
          }
        }}
      />

      <div className="absolute bottom-0 right-0 p-2 w-fit flex flex-row justify-end">
        {isLoading ? (
          <StopButton stop={stop} setMessages={setMessages} />
        ) : (
          <SendButton
            input={input}
            submitForm={submitForm}
          />
        )}
      </div>
    </div>
  );
}

export const MultimodalInput = memo(PureMultimodalInput, (prevProps, nextProps) => {
  if (prevProps.input !== nextProps.input) return false;
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  return true;
});

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: Dispatch<SetStateAction<Array<Message>>>;
}) {
  return (
    <Button
      className="rounded-full p-1.5 h-fit border dark:border-zinc-600"
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => messages);
      }}
    >
      <StopIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);

function PureSendButton({
  submitForm,
  input,
}: {
  submitForm: () => void;
  input: string;
}) {
  return (
    <Button
      className="rounded-full p-1.5 h-fit border dark:border-zinc-600"
      onClick={(event) => {
        event.preventDefault();
        submitForm();
      }}
      disabled={input.length === 0}
    >
      <ArrowUpIcon size={14} />
    </Button>
  );
}

const SendButton = memo(PureSendButton, (prevProps, nextProps) => {
  if (prevProps.input !== nextProps.input) return false;
  return true;
});