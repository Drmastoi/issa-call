import { useState, useEffect, useCallback } from 'react';

export interface WidgetConfig {
  id: string;
  title: string;
  visible: boolean;
}

const DEFAULT_LAYOUT: WidgetConfig[] = [
  { id: 'ai-insights', title: 'AI Intelligence', visible: true },
  { id: 'risk-alerts', title: 'Risk Alerts', visible: true },
  { id: 'qof-progress', title: 'QOF Progress', visible: true },
  { id: 'meditask', title: 'MediTask', visible: true },
  { id: 'recent-calls', title: 'Recent Calls', visible: true },
  { id: 'upcoming-batches', title: 'Upcoming Batches', visible: true },
];

const STORAGE_KEY = 'dashboard-layout';

export function useDashboardLayout() {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults to handle new widgets
        const existingIds = new Set(parsed.map((w: WidgetConfig) => w.id));
        const merged = [
          ...parsed,
          ...DEFAULT_LAYOUT.filter(w => !existingIds.has(w.id))
        ];
        return merged;
      }
    } catch (e) {
      console.error('Failed to load dashboard layout:', e);
    }
    return DEFAULT_LAYOUT;
  });

  const [isEditMode, setIsEditMode] = useState(false);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
    } catch (e) {
      console.error('Failed to save dashboard layout:', e);
    }
  }, [widgets]);

  const reorderWidgets = useCallback((activeId: string, overId: string) => {
    setWidgets((items) => {
      const oldIndex = items.findIndex((item) => item.id === activeId);
      const newIndex = items.findIndex((item) => item.id === overId);
      
      if (oldIndex === -1 || newIndex === -1) return items;
      
      const newItems = [...items];
      const [removed] = newItems.splice(oldIndex, 1);
      newItems.splice(newIndex, 0, removed);
      
      return newItems;
    });
  }, []);

  const toggleWidgetVisibility = useCallback((id: string) => {
    setWidgets((items) =>
      items.map((item) =>
        item.id === id ? { ...item, visible: !item.visible } : item
      )
    );
  }, []);

  const resetLayout = useCallback(() => {
    setWidgets(DEFAULT_LAYOUT);
  }, []);

  const toggleEditMode = useCallback(() => {
    setIsEditMode((prev) => !prev);
  }, []);

  return {
    widgets,
    isEditMode,
    reorderWidgets,
    toggleWidgetVisibility,
    resetLayout,
    toggleEditMode,
  };
}