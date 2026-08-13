import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search } from 'lucide-react';

interface Customer {
  id: number;
  name: string;
  customer_code: string;
}

interface Props {
  customers: Customer[];
  value: string;
  onChange: (value: string) => void;
}

export function CustomerDropdown({ customers, value, onChange }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
    }
  }, [isOpen]);

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    (c.customer_code && c.customer_code.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="relative w-72" ref={wrapperRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full h-10 px-3 bg-white border border-outline-variant rounded-lg cursor-pointer shadow-sm hover:border-primary/50 transition-colors"
      >
        <span className={`text-sm ${value ? 'text-on-surface font-bold truncate' : 'text-gray-400 font-medium'}`}>
          {value || 'Select a Customer...'}
        </span>
        <ChevronDown size={16} className={`text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-outline-variant rounded-xl shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center px-3 border-b border-outline-variant/50 bg-gray-50/50">
            <Search size={14} className="text-gray-400 mr-2" />
            <input
              type="text"
              className="w-full h-10 bg-transparent text-sm font-medium focus:outline-none text-on-surface placeholder:text-gray-400"
              placeholder="Type to search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          
          <div className="max-h-60 overflow-y-auto py-1">
            {filteredCustomers.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500 text-center">No customers found</div>
            ) : (
              filteredCustomers.map((c) => (
                <div
                  key={c.id}
                  onClick={() => {
                    onChange(c.name);
                    setIsOpen(false);
                  }}
                  className={`px-3 py-2.5 cursor-pointer hover:bg-primary/5 transition-colors flex flex-col ${value === c.name ? 'bg-primary/10 border-l-2 border-primary' : 'border-l-2 border-transparent'}`}
                >
                  <span className="text-sm font-bold text-on-surface">{c.name}</span>
                  {c.customer_code && (
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{c.customer_code}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
