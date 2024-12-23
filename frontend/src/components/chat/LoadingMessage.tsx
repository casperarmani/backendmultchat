
import React from 'react';
import { Avatar, AvatarFallback } from '../ui/avatar';

export function LoadingMessage() {
  return (
    <div className="flex justify-start">
      <div className="flex items-start max-w-[80%]">
        <Avatar className="w-12 h-12 bg-black/80">
          <AvatarFallback className="text-white/80 bg-black/80">AI</AvatarFallback>
        </Avatar>
        <div className="mx-3 p-4 rounded-2xl bg-black/20 backdrop-blur-lg">
          <div className="flex space-x-2">
            <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" />
          </div>
        </div>
      </div>
    </div>
  );
}
