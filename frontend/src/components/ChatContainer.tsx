import React, { useState, useRef, useEffect, useCallback  } from 'react';
import { ScrollArea } from './ui/scroll-area';
import { ChatHeader } from './chat/ChatHeader';
import { ChatWelcome } from './chat/ChatWelcome';
import { ChatMessage } from './chat/ChatMessage';
import { ChatInput } from './chat/ChatInput';
import { LoadingMessage } from './chat/LoadingMessage';
import { Upload } from 'lucide-react';
import { FilePreview } from './chat/FilePreview';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<Message[]>(initialMessages);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showWelcome, setShowWelcome] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const progressRef = useRef<NodeJS.Timeout | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const INITIAL_POLL_INTERVAL = 1000;
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageTimestampRef = useRef<string | null>(null);
  const isFetchingRef = useRef<boolean>(false);

  const scrollToBottom = useCallback(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, []);

  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [isNearBottom, setIsNearBottom] = useState(true);

  const handleScroll = useCallback(() => {
    if (scrollAreaRef.current) {
      requestAnimationFrame(() => {
        const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current;
        const scrollPosition = scrollHeight - scrollTop - clientHeight;
        setIsNearBottom(scrollPosition < 100);
      });
    }
  }, []);

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (scrollArea) {
      scrollArea.addEventListener('scroll', handleScroll);
      return () => scrollArea.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  useEffect(() => {
    if (chatMessages.length > 0) {
      if (isLoading || chatMessages[chatMessages.length - 1].type === 'user') {
        scrollToBottom();
      } else if (isNearBottom) {
        scrollToBottom();
      }
    }
  }, [chatMessages, isLoading, isNearBottom]);

  useEffect(() => {
    if (initialMessages.length > 0 && chatMessages.length === 0) {
      setChatMessages(initialMessages);
    }
  }, [initialMessages]);

  useEffect(() => {
    fetchChatHistory();
  }, []);

  useEffect(() => {
    if (chatId) {
      startPolling();
    }
    return () => stopPolling();
  }, [chatId]);

  const fetchNewMessages = useCallback(async () => {
    if (!chatId || isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const response = await fetch(`/conversations/${chatId}/messages`);
      if (!response.ok) {
        throw new Error(`Failed to fetch chat history: ${response.status}`);
      }

      const data = await response.json();
      if (data.messages && Array.isArray(data.messages)) {
        const formattedMessages: Message[] = data.messages.map((msg: any) => ({
          type: msg.chat_type === 'bot' ? 'bot' : 'user',
          content: msg.message,
          timestamp: msg.TIMESTAMP
        }));

        // Sort messages by timestamp
        const sortedMessages = formattedMessages.sort((a, b) => {
          const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
          const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
          return dateA - dateB;
        });

        // Update messages and clear loading state if we got a new bot message
        const lastMessage = sortedMessages[sortedMessages.length - 1];
        if (lastMessage && lastMessage.type === 'bot') {
          setChatMessages(sortedMessages);
          setIsLoading(false);
          stopPolling();
        }
      }
    } catch (error) {
      console.error('Error fetching new messages:', error);
    } finally {
      isFetchingRef.current = false;
    }
  }, [chatId]);

  const startPolling = useCallback(() => {
    stopPolling();
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
    if ((!message.trim() && files.length === 0) || isLoading || (tokenCost > (currentTokens || 0))) return;

    if (showWelcome) {
      setTimeout(() => setShowWelcome(false), 500);
    }

    // Set loading state and add user message immediately
    setIsLoading(true);
    setShouldAutoScroll(true);
    setError(null);
    
    // Start progress animation only for video uploads
    if (files.length > 0) {
      setUploadProgress(0);
      if (progressRef.current) clearInterval(progressRef.current);
      progressRef.current = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 98) return 98;
          return prev + (98 - prev) * 0.05;
        });
      }, 100);
    }

    const userMessage = { type: 'user' as MessageType, content: message };
    setChatMessages(prev => [...prev, userMessage]);
    scrollToBottom();

    try {
      const formData = new FormData();
      const messageContent = message.trim();
      formData.append('message', messageContent);

      files.forEach((file) => {
        formData.append('videos', file);
      });

      // If no chat exists, create one first
      let chatIdToUse = chatId;
      if (!chatIdToUse) {
        const newChatFormData = new FormData();
        newChatFormData.append('title', messageContent.slice(0, 30) + (messageContent.length > 30 ? '...' : ''));
        const newChatResponse = await fetch('/conversations', {
          method: 'POST',
          body: newChatFormData,
          credentials: 'include'
        });
        const newChatData = await newChatResponse.json();
        if (newChatData.success && newChatData.conversation) {
          chatIdToUse = newChatData.conversation.id;
          if (onMessageSent) {
            onMessageSent([userMessage], chatIdToUse);
          }
        } else {
          throw new Error("Failed to create new chat");
        }
      }

      formData.append('conversation_id', chatIdToUse);

      const response = await fetch('/send_message', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Update title if this is the first message
      if (chatMessages.length === 0 && chatIdToUse) {
        try {
          await fetch(`/conversations/${chatIdToUse}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `title=${encodeURIComponent(messageContent.slice(0, 30))}${messageContent.length > 30 ? '...' : ''}`
          });
          if (onMessageSent) {
            onMessageSent(chatMessages, chatIdToUse);
          }
        } catch (error) {
          console.error('Failed to update title:', error);
        }
      }

      // Clear message and files immediately after successful send
      setMessage('');
      setFiles([]);
      if (progressRef.current) {
        clearInterval(progressRef.current);
        progressRef.current = null;
      }
      setUploadProgress(100);

      // Start polling for the bot's response
      startPolling();
    } catch (err) {
      console.error('Error:', err);
      const errorMessage = { type: 'error' as MessageType, content: 'Failed to send message. Please try again.' };
      setChatMessages(prev => [...prev, errorMessage]);
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
    const container = containerRef.current;
    const relatedTarget = e.relatedTarget as Node;
    if (container && !container.contains(relatedTarget)) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
  };

  const [tokenCost, setTokenCost] = useState<number>(0);
  const [currentTokens, setCurrentTokens] = useState<number>(0);

  useEffect(() => {
    const fetchTokenBalance = async () => {
      try {
        const response = await fetch('/user/tokens');
        const data = await response.json();
        setCurrentTokens(data.token_balance);
      } catch (error) {
        console.error('Error fetching token balance:', error);
      }
    };
    fetchTokenBalance();
  }, []);

  const calculateVideoTokens = async (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(Math.ceil(video.duration));
      };
      video.src = URL.createObjectURL(file);
    });
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      file => file.type.startsWith('video/')
    );

    if (droppedFiles.length > 0) {
      let totalTokens = 0;
      for (const file of droppedFiles) {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = URL.createObjectURL(file);
        const duration = await new Promise<number>((resolve) => {
          video.onloadedmetadata = () => {
            URL.revokeObjectURL(video.src);
            resolve(Math.ceil(video.duration));
          };
        });
        totalTokens += duration;
      }
      setTokenCost(totalTokens);
      setFiles(prevFiles => [...prevFiles, ...droppedFiles]);
      
      // Auto scroll after drag and drop
      setTimeout(() => {
        if (scrollAreaRef.current) {
          scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
        }
      }, 100);
    }
  };

  const removeFile = async (index: number) => {
    const updatedFiles = files.filter((_, i) => i !== index);
    setFiles(updatedFiles);

    // Reset file input
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }

    // Recalculate tokens for remaining files
    let totalTokens = 0;
    for (const file of updatedFiles) {
      const tokens = await calculateVideoTokens(file);
      totalTokens += tokens;
    }
    setTokenCost(totalTokens);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      let totalTokens = 0;

      for (const file of selectedFiles) {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = URL.createObjectURL(file);
        const duration = await new Promise<number>((resolve) => {
          video.onloadedmetadata = () => {
            URL.revokeObjectURL(video.src);
            resolve(Math.ceil(video.duration));
          };
        });
        totalTokens += duration;
      }

      setTokenCost(prevTokens => prevTokens + totalTokens);
      setFiles(prevFiles => [...prevFiles, ...selectedFiles]);
      // Auto scroll after video upload
      setTimeout(() => {
        if (scrollAreaRef.current) {
          scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
        }
      }, 100);
    }
  };

  return (
    <div 
      ref={containerRef}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col h-[96vh] rounded-3xl bg-black/10 backdrop-blur-xl border ${
        isDragging ? 'border-white/40 bg-white/5' : 'border-white/10'
      } transition-all duration-200`}
    >
      <ChatHeader />
      <div className={`relative ${showWelcome && chatMessages.length === 0 && (!chatId || document.querySelector(`[data-chat-id="${chatId}"]`)?.textContent?.trim() === "New Chat") ? 'h-[200px]' : 'h-0'} transition-all duration-500`}>
        <ChatWelcome isVisible={showWelcome && chatMessages.length === 0 && (!chatId || document.querySelector(`[data-chat-id="${chatId}"]`)?.textContent?.trim() === "New Chat")} />
      </div>
      <ScrollArea 
        className="flex-grow px-6 will-change-scroll overscroll-none" 
        ref={scrollAreaRef}
        style={{ scrollBehavior: 'auto' }}
      >
        <div className="space-y-6 transform-gpu">
          {chatMessages.map((msg, index) => (
            <div 
              key={msg.timestamp || index} 
              className="transform-gpu content-visibility-auto"
              style={{ contain: 'content' }}
            >
              <ChatMessage message={msg} />
            </div>
          ))}
          {isLoading && <LoadingMessage />}
          {tokenCost > 0 && tokenCost > (currentTokens || 0) && (
            <div className="p-4 rounded-md bg-red-500/10 text-red-500 font-bold">
              Token cost: {tokenCost} tokens
              <p className="text-sm mt-1">
                Insufficient tokens. Please remove some videos or get more tokens.
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      <ChatInput
        message={message}
        isLoading={isLoading}
        onMessageChange={handleMessageChange}
        onSubmit={handleSubmit}
        tooltip={tokenCost > (currentTokens || 0) ? "Video lengths exceed token balance" : undefined}
      />

      {uploadProgress > 0 && isLoading && files.length > 0 && (
        <div className="px-6 py-2">
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white/80 rounded-full transition-all duration-500 ease-in-out"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

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
            {tokenCost > 0 && (
              <div className="text-sm text-white/60 mb-2 bg-white/5 p-2 rounded-lg">
                Estimated token cost: {tokenCost} tokens (1 token per second)
              </div>
            )}
            {files.map((file, index) => (
              <FilePreview
                key={index}
                file={file}
                onRemove={() => removeFile(index)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatContainer;