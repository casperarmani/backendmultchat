import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MessageSquare,
  Upload,
  History as HistoryIcon,
  Settings,
  ChevronDown,
  LogOut,
  User,
  PanelLeftClose,
  PanelLeft,
  Book,
  Boxes,
  Plus,
  CreditCard,
  Save,
  Pencil ,
  Trash
} from "lucide-react";
import { Chat } from '@/types';
import { handleManageSubscription } from '@/components/ui/dropdown-menu'; // Added import

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  chats: Chat[];
  currentChatId: string | null;
  onNewChat: () => void;
  onUpdatetitle:() => void;
  onSelectChat: (chatId: string) => void;
}

export function Sidebar({ 
  className, 
  chats, 
  currentChatId, 
  onNewChat,
  onUpdatetitle, 
  onSelectChat 
}: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { logout, user } = useAuth();
  const [editingId, setEditingId] = useState("");
  const [changedTitle, setChangedTitle] = useState("");
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleNewChat = async () => {
    await onNewChat();
    // Force refresh by calling parent update handler
    onUpdatetitle();
  };

  const handleBillings = async () => {
    try {
      const response = await fetch('/api/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const session = await response.json();
      window.location.href = session.url;
    } catch (error) {
      console.error('Error:', error);
  
      // Check if the error is an instance of Error
      if (error instanceof Error) {
        const errorMessage =
          (error as any)?.response?.data?.detail ||
          error.message ||
          'Failed to access subscription management. Please try again.';
        alert(errorMessage);
      } else {
        // Handle unknown error types
        alert('An unknown error occurred. Please try again.');
      }
    }
  };
  
  const setEditingIdAndTitle = (selectedId:string, selectedTitle:string) => {
    setEditingId(selectedId)
    setChangedTitle(selectedTitle)
  }
  const updateConversationTitle = async (currentChatId:string, title:string) => {
    try {
        setEditingId("");
        if (!title || !title.trim()) {
            throw new Error('Title cannot be empty');
        }

        const formData = new FormData();
        formData.append('title', title.trim());
        const response = await fetch(`/conversations/${currentChatId}`, {
            method: 'PUT',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.detail) {
            throw new Error(data.detail);
        }
        onUpdatetitle();
        return data;
    } catch (error) {
        console.error('Error updating conversation title:', error);
        throw error;
    }
  };

  const deleteConversation = async (conversationId:string) => {
    try {
        if (!conversationId) {
            throw new Error('Invalid conversation ID');
        }
        const response = await fetch(`/conversations/${conversationId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.detail) {
            throw new Error(data.detail);
        }
        onUpdatetitle();
        return data;
    } catch (error) {
        console.error('Error deleting conversation:', error);
        throw error;
    }
  }

  return (
    <div 
      className={cn(
        "flex flex-col pb-4 border-r min-h-screen transition-all duration-300 ease-in-out",
        isCollapsed ? "w-16" : "w-64",
        className
      )}
    >
      <div className="px-3 py-2">
        <div className="flex items-center justify-between h-14">
          <div className={cn(
            "flex items-center gap-2 overflow-hidden transition-all duration-300 ease-in-out",
            isCollapsed ? "w-0 opacity-0" : "w-[176px] opacity-100"
          )}>
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src="/logo.png" alt="Video Analysis" />
              <AvatarFallback>VA</AvatarFallback>
            </Avatar>
            <div className="truncate">
              <h2 className="text-lg font-semibold truncate">Video Analysis</h2>
              <p className="text-xs text-muted-foreground truncate">AI Chatbot</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {isCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
      <Separator />
      <div className="px-3 py-2">
        <Button
          onClick={handleNewChat}
          className={cn(
            "w-full justify-start mb-2",
            isCollapsed ? "px-2" : "px-4"
          )}
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span className={cn(
            "ml-2 transition-all duration-300 ease-in-out overflow-hidden",
            isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
          )}>New Chat</span>
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="px-3 py-2">
          <h2 className={cn(
            "mb-2 px-4 text-lg font-semibold tracking-tight transition-all duration-300 ease-in-out",
            isCollapsed && "opacity-0 h-0 mb-0"
          )}>
            Recent Chats
          </h2>
          <div className="space-y-1">
            {chats.map((chat) => (
              <Button
                key={chat.id}
                variant={currentChatId === chat.id ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-between transition-all duration-300 ease-in-out flex",
                  isCollapsed ? "px-2" : "px-4"
                )}
                onClick={() => onSelectChat(chat.id)}
              >
                <div className='flex items-center justify-between w-full'>
                  <div className='flex items-center'>
                    <MessageSquare className="h-4 w-4 shrink-0" />
                    {!isCollapsed && (
                      editingId === chat.id ? (
                        <input value={changedTitle} className="ml-2 w-[150px] bg-transparent" onChange={(e) => setChangedTitle(e.target.value)} />
                      ) : (
                        <span className="ml-2 truncate max-w-[150px]">{chat.title}</span>
                      )
                    )}
                  </div>
                  {!isCollapsed && (
                    <div className='flex gap-2'>
                      {editingId === chat.id ? (
                        <Save 
                          onClick={(e) => {
                            e.stopPropagation();
                            updateConversationTitle(editingId, changedTitle);
                          }} 
                          className="h-4 w-4 shrink-0 hover:text-primary cursor-pointer" 
                        />
                      ) : (
                        <Pencil 
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingIdAndTitle(chat.id, chat.title);
                          }} 
                          className="h-4 w-4 shrink-0 hover:text-primary cursor-pointer" 
                        />
                      )}
                      <Trash 
                        className="h-4 w-4 shrink-0 hover:text-destructive cursor-pointer" 
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversation(chat.id);
                        }}
                      />
                    </div>
                  )}
                </div>
              </Button>
            ))}
          </div>
        </div>
        <Separator className="my-2" />
        <div className="px-3 py-2">
          <div className="space-y-1">
            <Button variant="ghost" className={cn(
              "w-full justify-start transition-all duration-300 ease-in-out",
              isCollapsed ? "px-2" : "px-4"
            )}>
              <Upload className="h-4 w-4 shrink-0" />
              <span className={cn(
                "ml-2 transition-all duration-300 ease-in-out overflow-hidden",
                isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
              )}>Upload Video</span>
            </Button>
            <Button variant="ghost" className={cn(
              "w-full justify-start transition-all duration-300 ease-in-out",
              isCollapsed ? "px-2" : "px-4"
            )}>
              <HistoryIcon className="h-4 w-4 shrink-0" />
              <span className={cn(
                "ml-2 transition-all duration-300 ease-in-out overflow-hidden",
                isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
              )}>History</span>
            </Button>
          </div>
        </div>
        <Separator className="my-2" />
        <div className="px-3 py-2">
          <h2 className={cn(
            "mb-2 px-4 text-lg font-semibold tracking-tight transition-all duration-300 ease-in-out",
            isCollapsed && "opacity-0 h-0 mb-0"
          )}>
            Resources
          </h2>
          <div className="space-y-1">
            <Button variant="ghost" className={cn(
              "w-full justify-start transition-all duration-300 ease-in-out",
              isCollapsed ? "px-2" : "px-4"
            )}>
              <Book className="h-4 w-4 shrink-0" />
              <span className={cn(
                "ml-2 transition-all duration-300 ease-in-out overflow-hidden",
                isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
              )}>Documentation</span>
            </Button>
            <Button variant="ghost" className={cn(
              "w-full justify-start transition-all duration-300 ease-in-out",
              isCollapsed ? "px-2" : "px-4"
            )}>
              <Boxes className="h-4 w-4 shrink-0" />
              <span className={cn(
                "ml-2 transition-all duration-300 ease-in-out overflow-hidden",
                isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
              )}>Models</span>
            </Button>
            <Button variant="ghost" className={cn(
              "w-full justify-start transition-all duration-300 ease-in-out",
              isCollapsed ? "px-2" : "px-4"
            )}>
              <Settings className="h-4 w-4 shrink-0" />
              <span className={cn(
                "ml-2 transition-all duration-300 ease-in-out overflow-hidden",
                isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
              )}>Settings</span>
            </Button>
          </div>
        </div>
      </ScrollArea>
      <Separator className="my-2" />
      <div className="px-3 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className={cn(
              "w-full justify-start transition-all duration-300 ease-in-out",
              isCollapsed ? "px-2" : "px-4"
            )}>
              <Avatar className="h-8 w-8">
                <AvatarImage src="/avatar.png" alt="User" />
                <AvatarFallback>U</AvatarFallback>
              </Avatar>
              <div className={cn(
                "ml-2 flex items-center gap-2 transition-all duration-300 ease-in-out overflow-hidden",
                isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
              )}>
                <div className="flex flex-col flex-1 space-y-1">
                  <p className="text-sm font-medium leading-none">{user?.email || 'User'}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email}
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align={isCollapsed ? "center" : "start"} side="top">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleManageSubscription}> {/* Changed onClick handler */}
              <CreditCard className="mr-2 h-4 w-4" />
              <span>Manage Billing</span> {/* Changed text */}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}