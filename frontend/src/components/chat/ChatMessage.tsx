
import React from 'react';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Message } from '@/types';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '@/context/AuthContext';

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const { user } = useAuth();
  const userInitial = user?.email ? user.email[0].toUpperCase() : 'U';
  return (
    <div 
      className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
      style={{
        animation: 'fadeInMessage 0.15s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        transform: 'translateZ(0)',
        willChange: 'transform, opacity',
        opacity: 0
      }}
    >
      <div className={`flex items-start max-w-[80%] ${message.type === 'user' ? 'flex-row-reverse' : ''}`}>
        <Avatar className={`w-12 h-12 ${message.type === 'user' ? 'bg-slate-700/90' : 'bg-black/80'}`}>
          <AvatarFallback className={`text-white/80 ${message.type === 'user' ? 'bg-slate-700/90' : 'bg-black/80'}`}>
            {message.type === 'user' ? userInitial : message.type === 'bot' ? 'AI' : '!'}
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
