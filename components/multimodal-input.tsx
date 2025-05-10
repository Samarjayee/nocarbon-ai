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

import { ArrowUpIcon, StopIcon, CrossIcon, FileIcon } from './icons'; // Assuming './icons' is correct
import { Button } from './ui/button'; // Assuming './ui/button' is correct
import { Textarea } from './ui/textarea'; // Assuming './ui/textarea' is correct
import { SuggestedActions } from './suggested-actions'; // Assuming './suggested-actions' is correct
import { FileAttachmentMenu } from './file-attachment-menu'; // Assuming './file-attachment-menu' is correct

// Types (as you defined them)
type Message = {
  id?: string;
  role: 'user' | 'assistant' | 'data' | 'system';
  content: string;
};

interface AttachmentFile {
  id: string;
  name: string;       // Filename
  type: string;       // MIME type (e.g., "application/pdf")
  size: number;
  from: 'temp' | 'drive';
  content?: File;     // Original File object (optional to keep)
  base64Data?: string; // To store the Base64 encoded content
  driveId?: string;
}

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64String = result.split(',')[1];
      if (base64String) {
        resolve(base64String);
      } else {
        reject(new Error('Failed to extract Base64 string from file reader result.'));
      }
    };
    reader.onerror = (error) => reject(error);
  });
};


function PureMultimodalInput({
  chatId,
  input,
  setInput,
  isLoading,
  stop,
  messages,
  setMessages,
  className,
  ...props
}: {
  chatId: string;
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  stop: () => void;
  messages: Array<Message>;
  setMessages: Dispatch<SetStateAction<Array<Message>>>;
  className?: string;
  [key: string]: any;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const [localStorageInput, setLocalStorageInput] = useLocalStorage('input', '');
  const [attachment, setAttachment] = useState<AttachmentFile | null>(null);

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight + 2}px`;
    }
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, [adjustHeight]);

  const resetHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      adjustHeight();
    }
  }, [adjustHeight]);

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      const finalValue = domValue || localStorageInput || '';
      if (input !== finalValue) {
        setInput(finalValue);
      }
      adjustHeight();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStorageInput, adjustHeight]);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    adjustHeight();
  };

  const handleFileSelect = async (file: File | null) => {
    if (file) {
      try {
        toast.info(`Processing file: ${file.name}...`);
        const base64DataValue = await fileToBase64(file);
        setAttachment({
          id: `temp-${Date.now()}`,
          name: file.name,
          type: file.type,
          size: file.size,
          from: 'temp',
          content: file,
          base64Data: base64DataValue
        });
        toast.success(`File "${file.name}" attached and ready.`);
      } catch (error) {
        console.error("Error converting file to Base64 or setting attachment:", error);
        toast.error(`Failed to process file "${file.name}". Please try again.`);
        setAttachment(null);
      }
    }
  };

  const handleDriveSelect = () => {
    window.open('https://drive-module-deployed.vercel.app', '_blank');
    toast.info('NoCarbon Drive opened. After selecting, you may need to re-attach if not automatically handled.');
  };

  const removeAttachment = () => {
    setAttachment(null);
    toast.info("Attachment removed.");
  };

  const sendMessage = useCallback(
    async (message: Message | string) => {
      const messageContent = typeof message === 'string' ? message : message.content;
      const userMessageId = `user-${Date.now()}-${Math.random()}`;
      // Log the content that will be displayed in UI and sent as 'input' via route.ts
      console.log('User message content for UI and Lambda "input":', messageContent);

      const newUserMessage: Message = {
        id: userMessageId,
        role: 'user',
        content: messageContent, // This now includes "Attached: filename.pdf" if no other text
      };

      setMessages((prevMessages) => [...prevMessages, newUserMessage]);

      const payloadForApiChat: {
        id: string;
        messages: Array<Message>;
        attachment?: {
          filename: string;
          mime_type: string;
          data: string;
        };
      } = {
        id: chatId,
        messages: [...messages, newUserMessage],
      };

      if (attachment && attachment.base64Data) {
        payloadForApiChat.attachment = {
          filename: attachment.name,
          mime_type: attachment.type,
          data: attachment.base64Data,
        };
        console.log('Attachment prepared for sending:', payloadForApiChat.attachment.filename);
      } else if (attachment) {
        console.warn('Attachment object exists but base64Data is missing. Attachment will not be sent.');
      }

      try {
        console.log(
          'Sending request to /api/chat with payload:',
          JSON.stringify(payloadForApiChat, (key, value) =>
            key === 'data' && typeof value === 'string' && value.length > 30
              ? value.substring(0, 30) + "...[truncated]"
              : value
          )
        );

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadForApiChat),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Backend /api/chat request failed:', response.status, errorText);
          throw new Error(`Backend request failed with status ${response.status}: ${errorText}`);
        }

        if (!response.body) {
          throw new Error('No response body to stream from /api/chat');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullAssistantResponse = '';
        let currentAssistantMessageId: string | null = null;
        let assistantMessagePlaceholderAdded = false;
        let buffer = '';

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (buffer.trim()) {
              try {
                const chunkData = JSON.parse(buffer.trim());
                const textChunk = chunkData.result || '';
                if (textChunk) fullAssistantResponse += textChunk;
              } catch (e) {
                console.error('Error parsing remaining final NDJSON buffer:', buffer.trim(), e);
              }
            }
            if (currentAssistantMessageId && assistantMessagePlaceholderAdded) {
                 setMessages((prevMessages) =>
                    prevMessages.map((msg) =>
                        msg.id === currentAssistantMessageId
                        ? { ...msg, content: fullAssistantResponse }
                        : msg
                    )
                );
            }
            console.log('Streaming finished. Full assistant response:', fullAssistantResponse);
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          let EOL_index;

          while ((EOL_index = buffer.indexOf('\n')) >= 0) {
            const line = buffer.substring(0, EOL_index).trim();
            buffer = buffer.substring(EOL_index + 1);

            if (line) {
              try {
                const chunkData = JSON.parse(line);
                const textChunk = chunkData.result || '';
                
                if (!currentAssistantMessageId && chunkData.assistantMessageId) {
                  currentAssistantMessageId = chunkData.assistantMessageId;
                }
                
                if (textChunk) {
                    fullAssistantResponse += textChunk;
                    if (!assistantMessagePlaceholderAdded && currentAssistantMessageId) {
                    setMessages((prevMessages) => [
                        ...prevMessages,
                        {
                        role: 'assistant',
                        content: fullAssistantResponse,
                        id: currentAssistantMessageId,
                        },
                    ]);
                    assistantMessagePlaceholderAdded = true;
                    } else if (assistantMessagePlaceholderAdded && currentAssistantMessageId) {
                    setMessages((prevMessages) =>
                        prevMessages.map((msg) =>
                        msg.id === currentAssistantMessageId
                            ? { ...msg, content: fullAssistantResponse }
                            : msg
                        )
                    );
                    }
                }
              } catch (e) {
                console.error('Error parsing stream chunk line:', line, e);
              }
            }
          }
        }
        return userMessageId;
      } catch (error: any) {
        console.error('Error sending message or processing stream:', error.message, error.stack);
        toast.error(`Failed to get response: ${error.message}`);
        setMessages((prevMessages) => [
          ...prevMessages,
          { role: 'assistant', content: `Error: ${error.message || 'Unable to process your query.'}`, id: `error-${Date.now()}` } as Message,
        ]);
        return null;
      }
    },
    [chatId, messages, setMessages, attachment]
  );

  const submitForm = useCallback(() => {
    if (isLoading || (!input.trim() && !attachment)) {
      if (isLoading) toast.error('Please wait for the current response to finish!');
      if (!input.trim() && !attachment) toast.info('Please type a message or attach a file.');
      return;
    }

    window.history.replaceState({}, '', `/chat/${chatId}`);
    
    // CHANGED: Logic to set messageContentToSend
    let messageContentToSend = input.trim();
    if (!input.trim() && attachment && attachment.name) {
      messageContentToSend = `Attached: ${attachment.name}`;
      console.log(`No text input from user, using attachment name as message content for UI and Lambda input: "${messageContentToSend}"`);
    }
    // END OF CHANGE

    sendMessage(messageContentToSend);

    setInput('');
    setLocalStorageInput('');
    resetHeight();
    setAttachment(null);

    if (width && width > 768 && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [input, sendMessage, setInput, setLocalStorageInput, width, chatId, attachment, isLoading, resetHeight]);

  return (
    <div className="relative w-full flex flex-col gap-4">
      {messages.length === 0 && !input && !attachment && (
        <SuggestedActions sendMessage={sendMessage} chatId={chatId} />
      )}

      {attachment && (
        <div className="flex items-center gap-2 p-2 bg-green-100 dark:bg-green-900/20 rounded-md text-sm">
          <FileIcon size={14} className="text-green-700 dark:text-green-400" />
          <span className="flex-1 truncate text-green-800 dark:text-green-300">{attachment.name} ({Math.round(attachment.size / 1024)} KB)</span>
          <Button
            variant="ghost"
            size="sm"
            className="p-1 h-6 w-6 rounded-full text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800"
            onClick={removeAttachment}
            aria-label="Remove attachment"
          >
            <CrossIcon size={10} />
          </Button>
        </div>
      )}

      <Textarea
        ref={textareaRef}
        placeholder="Send a message (or attach a file)..."
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
            submitForm();
          }
        }}
      />

      <div className="absolute bottom-0 right-0 p-2 w-fit flex flex-row justify-end items-center gap-2">
        <FileAttachmentMenu
          onFileSelect={handleFileSelect}
          onDriveSelect={handleDriveSelect}
        />
        {isLoading ? (
          <StopButton stop={stop} />
        ) : (
          <SendButton
            input={input}
            attachment={attachment}
            submitForm={submitForm}
          />
        )}
      </div>
    </div>
  );
}

export const MultimodalInput = memo(PureMultimodalInput);

function PureStopButton({ stop }: { stop: () => void; }) {
  return (
    <Button
      aria-label="Stop generating"
      className="rounded-full p-1.5 h-fit border dark:border-zinc-600"
      onClick={(event) => {
        event.preventDefault();
        stop();
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
  attachment,
}: {
  submitForm: () => void;
  input: string;
  attachment: AttachmentFile | null;
}) {
  return (
    <Button
      aria-label="Send message"
      className="rounded-full p-1.5 h-fit border dark:border-zinc-600"
      onClick={(event) => {
        event.preventDefault();
        submitForm();
      }}
      disabled={!input.trim() && !attachment}
    >
      <ArrowUpIcon size={14} />
    </Button>
  );
}
const SendButton = memo(PureSendButton, (prevProps, nextProps) => {
  if (prevProps.input !== nextProps.input) return false;
  if (prevProps.attachment !== nextProps.attachment) return false;
  return true;
});