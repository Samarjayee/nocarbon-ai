// components/suggested-actions.tsx
'use client';

import { motion } from 'framer-motion';
import { Button } from './ui/button';
import { memo } from 'react';

// Define types inline to match multimodal-input.tsx
type Message = {
  id?: string;
  role: 'user' | 'assistant' | 'data' | 'system';
  content: string;
};

type CreateMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ChatRequestOptions = {
  experimental_attachments?: { url: string; name: string; contentType: string }[];
};

interface SuggestedActionsProps {
  chatId: string;
  sendMessage: (
    message: Message | CreateMessage,
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
}

function PureSuggestedActions({ chatId, sendMessage }: SuggestedActionsProps) {
  const suggestedActions = [
    {
      title: 'Calculate CO₂e',
      label: 'for a 10 km car trip',
      action: 'How much CO₂e for a 10 km car trip?',
    },
    {
      title: 'Estimate my',
      label: 'daily carbon footprint',
      action: 'What is my daily carbon footprint?',
    },
    {
      title: 'Suggest ways to',
      label: 'reduce my emissions',
      action: 'How can I reduce my carbon emissions?',
    },
    {
      title: 'What is the impact',
      label: 'of flying 1000 km?',
      action: 'What is the carbon impact of flying 1000 km?',
    },
  ];

  return (
    <div className="grid sm:grid-cols-2 gap-2 w-full">
      {suggestedActions.map((suggestedAction, index) => (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.05 * index }}
          key={`suggested-action-${suggestedAction.title}-${index}`}
          className={index > 1 ? 'hidden sm:block' : 'block'}
        >
          <Button
            variant="ghost"
            onClick={async () => {
              window.history.replaceState({}, '', `/chat/${chatId}`);

              await sendMessage({
                role: 'user',
                content: suggestedAction.action,
              });
            }}
            className="text-left border rounded-xl px-4 py-3.5 text-sm flex-1 gap-1 sm:flex-col w-full h-auto justify-start items-start"
          >
            <span className="font-medium">{suggestedAction.title}</span>
            <span className="text-muted-foreground">
              {suggestedAction.label}
            </span>
          </Button>
        </motion.div>
      ))}
    </div>
  );
}

export const SuggestedActions = memo(PureSuggestedActions, () => true);