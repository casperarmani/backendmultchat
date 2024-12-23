import { Avatar, AvatarFallback } from '../ui/avatar';
import { cn } from "@/lib/utils";

export function LoadingMessage() {
  return (
    <div className="flex justify-start">
      <div className="flex items-start max-w-[80%]">
        <Avatar className="w-12 h-12 bg-slate-800">
          <AvatarFallback className="text-white/80">AI</AvatarFallback>
        </Avatar>
        <div className="mx-3 p-4 rounded-2xl bg-black/20 backdrop-blur-lg">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-white/90 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            <div className="w-2 h-2 bg-white/90 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="w-2 h-2 bg-white/90 rounded-full animate-bounce"></div>
          </div>
        </div>
      </div>
    </div>
  );
}