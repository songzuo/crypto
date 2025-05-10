import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchCryptocurrencies } from "@/lib/openai";

interface HeaderProps {
  toggleSidebar: () => void;
}

const Header: React.FC<HeaderProps> = ({ toggleSidebar }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showResults, setShowResults] = useState(false);
  const searchResultsRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLDivElement>(null);

  // Handle search input change
  const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    
    if (value.length >= 2) {
      const results = await searchCryptocurrencies(value);
      setSearchResults(results);
      setShowResults(true);
    } else {
      setSearchResults([]);
      setShowResults(false);
    }
  };

  // Handle clicking outside the search results to close them
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchResultsRef.current &&
        searchInputRef.current &&
        !searchResultsRef.current.contains(event.target as Node) &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setShowResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <header className="bg-white dark:bg-slate-900 p-4 shadow-sm flex justify-between items-center sticky top-0 z-10">
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden mr-2"
          onClick={toggleSidebar}
        >
          <i className="ri-menu-line text-xl"></i>
        </Button>
        
        <div className="relative w-full max-w-md" ref={searchInputRef}>
          <div className="relative">
            <Input
              id="cryptoSearch"
              type="text"
              placeholder="Search for cryptocurrencies..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <i className="ri-search-line absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
          </div>
          {showResults && (
            <div
              ref={searchResultsRef}
              className="absolute mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-20"
            >
              {searchResults.length > 0 ? (
                searchResults.map((result) => (
                  <div
                    key={result.id}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                    onClick={() => {
                      setSearchTerm(`${result.name} (${result.symbol})`);
                      setShowResults(false);
                      // Navigate to the cryptocurrency details page
                      // window.location.href = `/explorer/${result.id}`;
                    }}
                  >
                    {result.name} ({result.symbol})
                  </div>
                ))
              ) : (
                <div className="p-2 text-slate-500 dark:text-slate-400">
                  No results found
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="icon" className="text-slate-600 dark:text-slate-300">
          <i className="ri-notification-2-line text-xl"></i>
        </Button>
        <Button variant="ghost" size="icon" className="text-slate-600 dark:text-slate-300">
          <i className="ri-question-line text-xl"></i>
        </Button>
        <div className="w-8 h-8 rounded-full bg-slate-300 dark:bg-slate-600 flex items-center justify-center text-slate-600 dark:text-slate-300">
          <i className="ri-user-line"></i>
        </div>
      </div>
    </header>
  );
};

export default Header;
