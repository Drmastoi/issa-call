import { cn } from '@/lib/utils';
import { Bot, User } from 'lucide-react';
import type { ChatMessage as ChatMessageType } from '@/hooks/useAIChat';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={cn(
      'flex gap-3 p-3 rounded-lg',
      isUser ? 'bg-primary/10' : 'bg-muted/50'
    )}>
      <div className={cn(
        'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
        isUser ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
      )}>
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground mb-1">
          {isUser ? 'You' : 'ISSA Care AI'}
        </div>
        <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
          {message.content ? (
            <div className="whitespace-pre-wrap break-words">
              {message.content.split('\n').map((line, i) => {
                // Handle bold text
                const formattedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                return (
                  <span key={i} dangerouslySetInnerHTML={{ __html: formattedLine + (i < message.content.split('\n').length - 1 ? '<br/>' : '') }} />
                );
              })}
            </div>
          ) : (
            <span className="text-muted-foreground italic">Thinking...</span>
          )}
        </div>
      </div>
    </div>
  );
}
