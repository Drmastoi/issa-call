import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface DraggableWidgetProps {
  id: string;
  children: ReactNode;
  isEditMode: boolean;
  isVisible: boolean;
  onToggleVisibility: () => void;
  className?: string;
}

export function DraggableWidget({
  id,
  children,
  isEditMode,
  isVisible,
  onToggleVisibility,
  className,
}: DraggableWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !isEditMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (!isVisible && !isEditMode) {
    return null;
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative group',
        isDragging && 'z-50 opacity-90',
        !isVisible && isEditMode && 'opacity-50',
        className
      )}
    >
      {/* Edit mode overlay */}
      {isEditMode && (
        <div
          className={cn(
            'absolute inset-0 rounded-lg border-2 border-dashed z-10 pointer-events-none transition-colors',
            isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'
          )}
        />
      )}

      {/* Drag handle and visibility toggle */}
      {isEditMode && (
        <div className="absolute -top-2 -right-2 z-20 flex gap-1">
          <Button
            variant="secondary"
            size="icon"
            className="h-7 w-7 rounded-full shadow-md cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </Button>
          <Button
            variant={isVisible ? 'secondary' : 'destructive'}
            size="icon"
            className="h-7 w-7 rounded-full shadow-md"
            onClick={onToggleVisibility}
          >
            {isVisible ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}

      {/* Widget content */}
      <div className={cn(isEditMode && 'pointer-events-none')}>
        {children}
      </div>
    </div>
  );
}