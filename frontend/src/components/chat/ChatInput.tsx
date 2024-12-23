
import React, { useRef, useEffect } from 'react';
import { Send, Search, Loader2 } from 'lucide-react';

interface ChatInputProps {
  message: string;
  isLoading: boolean;
  tooltip?: string;
  onMessageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function ChatInput({
  message,
  isLoading,
  tooltip,
  onMessageChange,
  onSubmit
}: ChatInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    onSubmit(e);
    // Focus after a short delay to ensure the form submission is complete
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 border-t border-white/10">
      <div className="flex items-center bg-white/5 backdrop-blur-lg rounded-2xl px-4 py-3">
        <input
          ref={inputRef}
          type="text"
          value={message}
          onChange={onMessageChange}
          placeholder="Start with a detailed prompt, ask about angles, pain points, or anything else..."
          className="bg-transparent text-white placeholder-white/40 flex-grow outline-none mx-3 text-sm"
          disabled={isLoading}
          autoFocus
        />
        <button 
          type="submit" 
          className={`text-white/40 transition-colors p-1 relative group ${!message.trim() || tooltip ? 'cursor-not-allowed opacity-50' : 'hover:text-white/80'}`}
          disabled={isLoading || !message.trim()}
          title={tooltip || (!message.trim() ? "Please include a message" : "")}
        >
          {!message.trim() && (
            <div className="fixed bottom-[80px] left-1/2 transform -translate-x-1/2 px-3 py-2 text-sm bg-black/95 backdrop-blur-xl rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity text-white shadow-lg z-[999999]">
              Please include a message
            </div>
          )}
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>
    </form>
  );
}
