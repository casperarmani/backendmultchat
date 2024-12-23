
import React from 'react';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Message } from '@/types';
import ReactMarkdown from 'react-markdown';

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  return (
    <div className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex items-start max-w-[80%] ${message.type === 'user' ? 'flex-row-reverse' : ''}`}>
        <Avatar className={`w-12 h-12 ${message.type === 'user' ? 'bg-slate-700/90' : 'bg-black/80'}`}>
          <AvatarFallback className={`text-white/80 ${message.type === 'user' ? 'bg-slate-700/90' : 'bg-black/80'}`}>
            {message.type === 'user' ? 'ME' : message.type === 'bot' ? 'AI' : '!'}
          </AvatarFallback>
        </Avatar>
        <div className={`mx-3 p-4 rounded-2xl ${
          message.type === 'user' 
            ? 'bg-white/10 backdrop-blur-lg' 
            : message.type === 'error'
            ? 'bg-red-500/10 backdrop-blur-lg'
            : 'bg-black/20 backdrop-blur-lg'
        }`}>
          <div className="text-white/90 text-sm leading-relaxed prose prose-invert">
            {message.type === 'user' ? (
              <p>{message.content}</p>
            ) : (
              <ReactMarkdown>{message.content}</ReactMarkdown>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
