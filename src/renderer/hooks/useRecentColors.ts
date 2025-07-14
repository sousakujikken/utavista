import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'utavista-recent-colors';
const MAX_RECENT_COLORS = 16;

export const useRecentColors = () => {
  const [recentColors, setRecentColors] = useState<string[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const colors = JSON.parse(stored);
        if (Array.isArray(colors)) {
          setRecentColors(colors.slice(0, MAX_RECENT_COLORS));
        }
      } catch (error) {
        console.warn('Failed to parse recent colors from localStorage:', error);
      }
    }
  }, []);

  const addRecentColor = useCallback((color: string) => {
    if (!color || typeof color !== 'string') return;
    
    const normalizedColor = color.toUpperCase();
    
    setRecentColors(prev => {
      const filtered = prev.filter(c => c !== normalizedColor);
      const updated = [normalizedColor, ...filtered].slice(0, MAX_RECENT_COLORS);
      
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (error) {
        console.warn('Failed to save recent colors to localStorage:', error);
      }
      
      return updated;
    });
  }, []);

  const clearRecentColors = useCallback(() => {
    setRecentColors([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to clear recent colors from localStorage:', error);
    }
  }, []);

  return {
    recentColors,
    addRecentColor,
    clearRecentColors
  };
};