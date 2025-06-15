import { Message } from '@/types';
import { Markdown } from './markdown';

export function ChatMessage({ message }: { message: Message }) {
  // Parse the message content if it's a JSON string
  let content = message.content;
  let downloadLink = null;

  try {
    const parsedContent = JSON.parse(content);
    if (parsedContent.downloadLink) {
      downloadLink = parsedContent.downloadLink;
      content = parsedContent.response; // Use the response text
    }
  } catch (e) {
    // Not JSON, use content as-is
  }

  return (
    <div className="flex flex-col space-y-2 pb-4">
      <div className="prose prose-sm max-w-none">
        <Markdown>{content}</Markdown>
        {downloadLink && (
          <div className="mt-2">
            <a 
              href={downloadLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Download Processed File
            </a>
          </div>
        )}
      </div>
    </div>
  );
}