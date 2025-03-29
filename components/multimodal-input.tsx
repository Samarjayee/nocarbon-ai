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
  type ChangeEvent,
  memo,
} from 'react';
import { toast } from 'sonner';
import { useLocalStorage, useWindowSize } from 'usehooks-ts';
import type { Attachment, Message, CreateMessage } from 'ai'; // Import from 'ai'

import { ArrowUpIcon, PaperclipIcon, StopIcon } from './icons';
import { PreviewAttachment } from './preview-attachment';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { SuggestedActions } from './suggested-actions';
import equal from 'fast-deep-equal';

// Remove local Attachment definition, use imported one
type LocalChatRequestOptions = {
  experimental_attachments?: Attachment[];
};

type SendMessageFunction = (
  message: Message | CreateMessage,
  chatRequestOptions?: LocalChatRequestOptions
) => Promise<string | null | undefined>;

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  isLoading,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  className,
}: {
  chatId: string;
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  stop: () => void;
  attachments: Array<Attachment>; // From 'ai'
  setAttachments: Dispatch<SetStateAction<Array<Attachment>>>;
  messages: Array<Message>;
  setMessages: Dispatch<SetStateAction<Array<Message>>>;
  className?: string;
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
  }, []); // ESLint warning here, addressed below

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    adjustHeight();
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<Array<string>>([]);

  const sendMessage: SendMessageFunction = useCallback(
    async (message: Message | CreateMessage, chatRequestOptions?: LocalChatRequestOptions) => {
      try {
        const userMessageId = `${Date.now()}-${Math.random()}`;
        console.log('Query sent from frontend:', message.content);
        setMessages((prevMessages) => [
          ...prevMessages,
          { ...message, id: userMessageId } as Message,
        ]);

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

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        let assistantMessageId: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            setMessages((prevMessages) => {
              const updatedMessages = [...prevMessages];
              const lastMessage = updatedMessages[updatedMessages.length - 1];
              if (lastMessage.role === 'assistant' && lastMessage.id === assistantMessageId) {
                updatedMessages[updatedMessages.length - 1] = {
                  ...lastMessage,
                  content: fullResponse,
                };
              } else {
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

          const chunkText = decoder.decode(value, { stream: true });
          const lines = chunkText.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            try {
              const chunkData = JSON.parse(line);
              const text = chunkData.result || '';
              assistantMessageId = chunkData.assistantMessageId || assistantMessageId;

              fullResponse += text;

              setMessages((prevMessages) => {
                const updatedMessages = [...prevMessages];
                const lastMessage = updatedMessages[updatedMessages.length - 1];

                if (lastMessage.role === 'assistant' && lastMessage.id === assistantMessageId) {
                  updatedMessages[updatedMessages.length - 1] = {
                    ...lastMessage,
                    content: fullResponse,
                  };
                } else {
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
    setAttachments([]);
    setLocalStorageInput('');
    resetHeight();

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [input, sendMessage, setInput, setAttachments, setLocalStorageInput, width, chatId]);

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const { url, pathname, contentType } = data;

        return {
          url,
          name: pathname,
          contentType: contentType,
        };
      }
      const { error } = await response.json();
      toast.error(error);
    } catch (error) {
      toast.error('Failed to upload file, please try again!');
    }
  };

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);

      setUploadQueue(files.map((file) => file.name));

      try {
        const uploadPromises = files.map((file) => uploadFile(file));
        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) => attachment !== undefined,
        ) as Attachment[]; // Type assertion since uploadFile matches Attachment

        setAttachments((currentAttachments) => [
          ...currentAttachments,
          ...successfullyUploadedAttachments,
        ]);
      } catch (error) {
        console.error('Error uploading files:', error);
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments],
  );

  return (
    <div className="relative w-full flex flex-col gap-4">
      {messages.length === 0 && attachments.length === 0 && uploadQueue.length === 0 && (
        <SuggestedActions sendMessage={sendMessage} chatId={chatId} />
      )}

      <input
        type="file"
        className="fixed -top-4 -left-4 size-0.5 opacity-0 pointer-events-none"
        ref={fileInputRef}
        multiple
        onChange={handleFileChange}
        tabIndex={-1}
      />

      {(attachments.length > 0 || uploadQueue.length > 0) && (
        <div className="flex flex-row gap-2 overflow-x-scroll items-end">
          {attachments.map((attachment) => (
            <PreviewAttachment key={attachment.url} attachment={attachment} />
          ))}

          {uploadQueue.map((filename) => (
            <PreviewAttachment
              key={filename}
              attachment={{
                url: '',
                name: filename,
                contentType: '',
              }}
              isUploading={true}
            />
          ))}
        </div>
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

      <div className="absolute bottom-0 p-2 w-fit flex flex-row justify-start">
        <AttachmentsButton fileInputRef={fileInputRef} isLoading={isLoading} />
      </div>

      <div className="absolute bottom-0 right-0 p-2 w-fit flex flex-row justify-end">
        {isLoading ? (
          <StopButton stop={stop} setMessages={setMessages} />
        ) : (
          <SendButton
            input={input}
            submitForm={submitForm}
            uploadQueue={uploadQueue}
          />
        )}
      </div>
    </div>
  );
}

export const MultimodalInput = memo(PureMultimodalInput, (prevProps, nextProps) => {
  if (prevProps.input !== nextProps.input) return false;
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  if (!equal(prevProps.attachments, nextProps.attachments)) return false;
  return true;
});

function AttachmentsButton({
  fileInputRef,
  isLoading,
}: {
  fileInputRef: React.RefObject<HTMLInputElement>;
  isLoading: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={isLoading}
      onClick={() => fileInputRef.current?.click()}
    >
      <PaperclipIcon size={16} />
    </Button>
  );
}

function SendButton({
  input,
  submitForm,
  uploadQueue,
}: {
  input: string;
  submitForm: () => void;
  uploadQueue: Array<string>;
}) {
  return (
    <Button
      variant="default"
      size="icon"
      disabled={!input.trim() && uploadQueue.length === 0}
      onClick={submitForm}
    >
      <ArrowUpIcon size={16} />
    </Button>
  );
}

function StopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: Dispatch<SetStateAction<Array<Message>>>;
}) {
  return (
    <Button
      variant="default"
      size="icon"
      onClick={() => {
        stop();
        setMessages((prevMessages) => [
          ...prevMessages,
          { role: 'assistant', content: 'Stopped by user.', id: `${Date.now()}-${Math.random()}` } as Message,
        ]);
      }}
    >
      <StopIcon size={16} />
    </Button>
  );
}