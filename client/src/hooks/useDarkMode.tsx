import { useEffect, useState } from 'react';
import { useTheme } from '@/components/Layout/ThemeProvider';

export function useDarkMode() {
  const { theme } = useTheme();
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  useEffect(() => {
    const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setIsDarkMode(
      theme === 'dark' || (theme === 'system' && isSystemDark)
    );
  }, [theme]);
  
  return isDarkMode;
}
