import React from 'react';
import ChatContainer from './components/ChatContainer';
import TokenContainer from './components/TokenContainer';
import History from './components/History';
import { Sidebar } from './components/Sidebar';
import { ChatHistory, VideoHistory, ApiResponse, Chat, Message } from './types';
import VideoAnalysisHistory from "./components/VideoAnalysisHistory"; // Added import

function App() {
  const [chatHistory, setChatHistory] = React.useState<ChatHistory[]>([]);
  const [videoHistory, setVideoHistory] = React.useState<VideoHistory[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [chats, setChats] = React.useState<Chat[]>([]);
  const [conversations, setConversations] = React.useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = React.useState<string | null>(null);
  const [isMessageSent, setIsMessageSent] = React.useState(false);

  const fetchHistories = async () => {
    try {
      setError(null);
      const [chatResponse, videoResponse] = await Promise.all([
        fetch('/chat_history'),
        fetch('/video_analysis_history')
      ]);

      if (!chatResponse.ok || !videoResponse.ok) {
        throw new Error('Failed to fetch history data');
      }

      const chatData: ApiResponse<ChatHistory> = await chatResponse.json();
      const videoData: ApiResponse<VideoHistory> = await videoResponse.json();
      
      if (!chatData?.history || !Array.isArray(chatData.history)) {
        throw new Error('Invalid chat history data format');
      }

      if (!videoData?.history || !Array.isArray(videoData.history)) {
        throw new Error('Invalid video history data format');
      }

      setChatHistory(chatData.history);
      setVideoHistory(videoData.history);
    } catch (error) {
      console.error('Error fetching histories:', error);
      setError(error instanceof Error ? error.message : 'An error occurred while fetching data');
    }
  };

  type NewChat = {
    success: boolean;
    conversation: {
        id: string;
        user_id: string;
        title: string;
        created_at: string; // ISO 8601 timestamp
        updated_at: string; // ISO 8601 timestamp
        deleted_at: string | null; // Nullable timestamp
    };
};


  const fetchNewChat = async (formData: FormData): Promise<NewChat> => {
    const response = await fetch('/conversations', {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
    }

    const data: NewChat = await response.json();
    return data;
  };

  const getConversations = async () => {
    const response = await fetch('/conversations');
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to fetch conversations');
    }
    return response.json();
  }

  const handleNewChat = async () => {
    const formData = new FormData();
    formData.append('title', 'New Chat 1'); 

    try {
        const newChat = await fetchNewChat(formData);
        setConversations([newChat.conversation, ...chats])
        setCurrentChatId(newChat.conversation.id);
    } catch (error) {
        console.error('Failed to create a new chat:', error);
    }
  };

  const handleConversations = async () => {
    try {
      const response = await getConversations();
      setChats(response.conversations);
      setCurrentChatId(response.conversations[0].id);
  } catch (error) {
      console.error('Failed to fetch conversations:', error);
  }
  }

  const handleSelectChat = (chatId: string) => {
    setCurrentChatId(chatId);
  };

  const handleMessageSent = async (messages: Message[], chatId: string) => {
    setIsMessageSent(true);
    await handleConversations(); // Refresh all conversations
    setCurrentChatId(chatId); // Ensure we're on the new chat
    fetchHistories();
  };

  const currentChat = chats.find(chat => chat.id === currentChatId) || null;

  React.useEffect(() => {
    handleConversations();
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-300">
      <Sidebar 
        className="border-r" 
        chats={chats}
        currentChatId={currentChatId}
        onNewChat={handleNewChat}
        onUpdatetitle={handleConversations}
        onSelectChat={handleSelectChat}
        isMessageSent={isMessageSent}
        setIsMessageSent={setIsMessageSent} // Pass the setter
      />
      <main className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/clear_tree.png')] bg-cover bg-center">
          <div className="h-full overflow-auto">
            <div className="container mx-auto px-4 py-8">
              {error && (
                <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                  {error}
                </div>
              )}
              <div className="grid grid-cols-1 gap-8">
                <div className="flex gap-6 h-[calc(100vh-8rem)]"> {/* Added height calculation */}
                  <div className="flex-1 min-w-0"> {/* Changed to flex-1 to fill space */}
                    <ChatContainer 
                      key={currentChatId || 'new'} 
                      chatId={currentChatId}
                      initialMessages={currentChat?.messages || []}
                      onMessageSent={handleMessageSent}
                    />
                  </div>
                  <div className="w-[400px] flex-shrink-0">
                    <VideoAnalysisHistory historyData={videoHistory}/>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;