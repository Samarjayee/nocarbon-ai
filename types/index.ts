export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ProcessedResponse {
  response: string;
  downloadLink?: string;
  conversationId: string;
  calculation_details?: any;
}

JSON.stringify({
  response: "Text message to display",
  downloadLink: "URL to download file",
  // ...other properties
})