import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Search, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cryptoColors } from '@/lib/constants';

interface Cryptocurrency {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  rank?: number;
}

export function CryptoAutocomplete() {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [selectedCrypto, setSelectedCrypto] = useState<Cryptocurrency | null>(null);
  const [_, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Fetch cryptocurrency suggestions as user types
  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['autocomplete', searchValue],
    queryFn: async () => {
      if (!searchValue) return [];
      const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(searchValue)}`);
      if (!res.ok) throw new Error('Failed to fetch suggestions');
      return res.json();
    },
    enabled: searchValue.length > 0,
  });

  // Fetch top cryptocurrencies when no search value
  const { data: topCryptos = [] } = useQuery({
    queryKey: ['autocomplete', 'top'],
    queryFn: async () => {
      const res = await fetch('/api/autocomplete');
      if (!res.ok) throw new Error('Failed to fetch top cryptocurrencies');
      return res.json();
    },
  });

  // When user selects a cryptocurrency
  const handleSelect = (crypto: Cryptocurrency) => {
    setSelectedCrypto(crypto);
    setSearchValue('');
    setOpen(false);
    // Navigate to the cryptocurrency detail page
    navigate(`/explorer/${crypto.id}`);
  };

  // When user submits the search form
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (suggestions.length > 0) {
      handleSelect(suggestions[0]);
    }
  };

  // Get color for crypto symbol
  const getCryptoColor = (symbol: string) => {
    return cryptoColors[symbol.toLowerCase()] || '#7c3aed'; // Default to purple
  };

  return (
    <form onSubmit={handleSubmit} className="relative w-full max-w-sm">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
            onClick={() => inputRef.current?.focus()}
          >
            {selectedCrypto ? (
              <div className="flex items-center">
                <div 
                  className="w-6 h-6 rounded-full mr-2 flex items-center justify-center" 
                  style={{ backgroundColor: getCryptoColor(selectedCrypto.symbol) }}
                >
                  <span className="text-white text-xs font-bold">{selectedCrypto.symbol.charAt(0)}</span>
                </div>
                <span>{selectedCrypto.name} ({selectedCrypto.symbol})</span>
              </div>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">搜索加密货币...</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0">
          <Command>
            <CommandInput 
              placeholder="输入币种名称或代号..." 
              value={searchValue}
              onValueChange={setSearchValue}
              className="h-9"
              ref={inputRef}
            />
            {isLoading ? (
              <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                正在搜索...
              </div>
            ) : (
              <>
                <CommandEmpty>没有找到匹配的币种</CommandEmpty>
                <CommandGroup>
                  {(searchValue ? suggestions : topCryptos).map((crypto: Cryptocurrency) => (
                    <CommandItem
                      key={crypto.id}
                      onSelect={() => handleSelect(crypto)}
                      className="flex items-center"
                    >
                      <div 
                        className="w-6 h-6 rounded-full mr-2 flex items-center justify-center" 
                        style={{ backgroundColor: getCryptoColor(crypto.symbol) }}
                      >
                        <span className="text-white text-xs font-bold">{crypto.symbol.charAt(0)}</span>
                      </div>
                      <span>{crypto.name}</span>
                      <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">
                        {crypto.symbol}
                      </span>
                      {crypto.rank && (
                        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                          #{crypto.rank}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </Command>
        </PopoverContent>
      </Popover>
      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
        <Search className="h-4 w-4 text-slate-500 dark:text-slate-400" />
      </div>
    </form>
  );
}