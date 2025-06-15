import Link from 'next/link';
import React, { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import DOMPurify from 'isomorphic-dompurify';
import { CodeBlock } from './code-block';

const components: Partial<Components> = {
  code: CodeBlock,
  pre: ({ children }) => <>{children}</>,
  ol: ({ node, children, ...props }) => {
    return (
      <ol className="list-decimal list-outside ml-4" {...props}>
        {children}
      </ol>
    );
  },
  li: ({ node, children, ...props }) => {
    return (
      <li className="py-1" {...props}>
        {children}
      </li>
    );
  },
  ul: ({ node, children, ...props }) => {
    return (
      <ul className="list-decimal list-outside ml-4" {...props}>
        {children}
      </ul>
    );
  },
  strong: ({ node, children, ...props }) => {
    return (
      <span className="font-semibold" {...props}>
        {children}
      </span>
    );
  },
  // Custom component to handle both markdown and HTML anchor tags
  a: ({ node, children, href, ...props }) => {
    const sanitizedHref = DOMPurify.sanitize(href || '');
    const isExternal = sanitizedHref.startsWith('http');

    return isExternal ? (
      <a
        href={sanitizedHref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline"
        {...props}
      >
        {children}
      </a>
    ) : (
      <Link
        href={sanitizedHref}
        className="text-blue-600 hover:underline"
        {...props}
      >
        {children}
      </Link>
    );
  },
  h1: ({ node, children, ...props }) => {
    return (
      <h1 className="text-3xl font-semibold mt-6 mb-2" {...props}>
        {children}
      </h1>
    );
  },
  h2: ({ node, children, ...props }) => {
    return (
      <h2 className="text-2xl font-semibold mt-6 mb-2" {...props}>
        {children}
      </h2>
    );
  },
  h3: ({ node, children, ...props }) => {
    return (
      <h3 className="text-xl font-semibold mt-6 mb-2" {...props}>
        {children}
      </h3>
    );
  },
  h4: ({ node, children, ...props }) => {
    return (
      <h4 className="text-lg font-semibold mt-6 mb-2" {...props}>
        {children}
      </h4>
    );
  },
  h5: ({ node, children, ...props }) => {
    return (
      <h5 className="text-base font-semibold mt-6 mb-2" {...props}>
        {children}
      </h5>
    );
  },
  h6: ({ node, children, ...props }) => {
    return (
      <h6 className="text-sm font-semibold mt-6 mb-2" {...props}>
        {children}
      </h6>
    );
  },
};

export const Markdown = memo(
  ({ children }: { children: string }) => {
    // Sanitize the entire content
    const sanitizedContent = DOMPurify.sanitize(children);

    return (
      <ReactMarkdown
        components={components}
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]} // Enable HTML parsing
        className="prose dark:prose-invert max-w-none"
      >
        {sanitizedContent}
      </ReactMarkdown>
    );
  },
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);

Markdown.displayName = 'Markdown';
