import React, { useState, useRef, useEffect, useCallback  } from 'react';
import { ScrollArea } from './ui/scroll-area';
import { ChatHeader } from './chat/ChatHeader';
import { ChatWelcome } from './chat/ChatWelcome';
import { ChatMessage } from './chat/ChatMessage';
import { ChatInput } from './chat/ChatInput';
import { Upload, X } from 'lucide-react';

type MessageType = 'user' | 'bot' | 'error';

interface Message {
  type: MessageType;
  content: string;
  timestamp?: string;
}

interface ChatContainerProps {
  chatId?: string | null;
  initialMessages?: Message[];
  onMessageSent?: (messages: Message[], chatId: string) => void;
}

function ChatContainer({ chatId, initialMessages = [], onMessageSent }: ChatContainerProps) {
  const [message, setMessage] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<Message[]>(initialMessages);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null); // Ref for the ScrollArea
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const INITIAL_POLL_INTERVAL = 1000; // 1 second
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageTimestampRef = useRef<string | null>(null);
  const isFetchingRef = useRef<boolean>(false); // Prevent concurrent fetches

   // Scroll to the bottom of the chat
  const scrollToBottom = useCallback(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, []);

  // Scroll to the bottom whenever messages change
  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, scrollToBottom]);

  useEffect(() => {
    if (initialMessages.length > 0 && chatMessages.length === 0) {
      setChatMessages(initialMessages);
    }
  }, [initialMessages]);

  useEffect(() => {
    fetchChatHistory();
  }, []);

  // Start polling when chatId changes or component mounts
  useEffect(() => {
    if (chatId) {
      startPolling();
    }

    return () => stopPolling(); // Cleanup on unmount
  }, [chatId]);

  const fetchNewMessages = useCallback(async () => {
     if (!chatId || isFetchingRef.current) return; // Skip if already fetching

    isFetchingRef.current = true; // Mark as fetching

    try {
      const response = await fetch(`/conversations/${chatId}/messages`);
      
      if (!response.ok) {
        const text = await response.text();
        console.error('Response text:', text);
        throw new Error(`Failed to fetch chat history: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.messages && Array.isArray(data.messages)) {
          const formattedMessages: Message[] = data.messages.map((msg: any) => ({
            type: msg.chat_type === 'bot' ? 'bot' : 'user',
            content: msg.message,
            timestamp: msg.TIMESTAMP
          }));
          const sortedMessages: Message[] = formattedMessages.sort((a, b) => {
            const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return dateA - dateB;
         });

        setChatMessages(sortedMessages);
      }
    } catch (error) {
      console.error('Error fetching new messages:', error);
    } finally {
      isFetchingRef.current = false; // Mark as not fetching
    }
  }, [chatId]);

  const startPolling = useCallback(() => {
    stopPolling(); // Ensure no duplicate intervals
    pollIntervalRef.current = setInterval(fetchNewMessages, INITIAL_POLL_INTERVAL);
  }, [fetchNewMessages]);


  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const fetchChatHistory = async () => {
    try {
      const response = await fetch('/chat_history', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const text = await response.text();
        console.error('Response text:', text);
        throw new Error(`Failed to fetch chat history: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.history && Array.isArray(data.history)) {
          const filteredMessage = data.history.filter((msg:any) => msg.conversation_id === chatId);
          const formattedMessages: Message[] = filteredMessage.map((msg: any) => ({
            type: msg.chat_type === 'bot' ? 'bot' : 'user',
            content: msg.message,
            timestamp: msg.TIMESTAMP
          }));
          const sortedMessages: Message[] = formattedMessages.sort((a, b) => {
            const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return dateA - dateB;
         });

        setChatMessages(sortedMessages);
      }

    } catch (error) {
      console.error('Error fetching chat history:', error);
      setError('Failed to load chat history');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!message.trim() && files.length === 0) || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      const messageContent = message.trim();
      formData.append('message', messageContent);
      
      files.forEach((file) => {
        formData.append('videos', file);
      });

      if(chatId){
        formData.append('conversation_id', chatId);
        // Only update title if it's the first message
        if (chatMessages.length === 0) {
          const titleFormData = new FormData();
          titleFormData.append('title', messageContent.slice(0, 30) + (messageContent.length > 30 ? '...' : ''));
          await fetch(`/conversations/${chatId}`, {
            method: 'PUT',
            body: titleFormData,
            credentials: 'include'
          });
          // Force parent component update
          if (onMessageSent) {
            onMessageSent([], chatId);
          }
        }
      }

      const response = await fetch('/send_message', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Let the polling handle message updates
      if (chatId && onMessageSent) {
        onMessageSent(chatMessages, chatId);
      }
      
      setMessage('');
      setFiles([]);
      scrollToBottom();
    } catch (err) {
      console.error('Error:', err);
      setError('Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === dropZoneRef.current) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      file => file.type.startsWith('video/')
    );

    if (droppedFiles.length > 0) {
      setFiles(prevFiles => [...prevFiles, ...droppedFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setFiles(prevFiles => [...prevFiles, ...selectedFiles]);
    }
  };

  return (
    <div className="flex flex-col h-[96vh] rounded-3xl bg-black/10 backdrop-blur-xl border border-white/10">
      <ChatHeader />
      {chatMessages.length === 0 && <ChatWelcome />}
      
      <ScrollArea className="flex-grow px-6" ref={scrollAreaRef}>
        <div className="space-y-6">
          {chatMessages.map((msg, index) => (
            <ChatMessage key={index} message={msg} />
          ))}
        </div>
      </ScrollArea>

      <ChatInput
        message={message}
        isLoading={isLoading}
        onMessageChange={(e) => setMessage(e.target.value)}
        onSubmit={handleSubmit}
      />

      <div className="px-6 pb-4">
        <div
          ref={dropZoneRef}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-3 transition-all duration-200 ${
            isDragging
              ? 'border-white/40 bg-white/5'
              : 'border-white/10 hover:border-white/20'
          }`}
        >
          <div className="flex flex-col items-center justify-center text-white/60">
            <Upload className="w-5 h-5 mb-1.5" />
            <p className="text-sm mb-1">Drag and drop video files here</p>
            <p className="text-xs">or</p>
            <label className="mt-2 px-3 py-1.5 bg-white/10 rounded-lg cursor-pointer hover:bg-white/20 transition-colors">
              <span className="text-sm">Browse files</span>
              <input
                type="file"
                multiple
                accept="video/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {files.length > 0 && (
          <div className="mt-3 space-y-2 max-h-32 overflow-auto">
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between bg-white/5 rounded-lg p-2"
              >
                <div className="flex items-center text-white/80">
                  <span className="text-sm truncate">{file.name}</span>
                  <span className="text-xs text-white/40 ml-2">
                    ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                  </span>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="text-white/40 hover:text-white/80 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatContainer;