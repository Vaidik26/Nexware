import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

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
  const [search, setSearch] = useState(value || '');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearch(value || '');
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    (c.customer_code && c.customer_code.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="relative w-72" ref={wrapperRef}>
      <div className="relative">
        <input
          type="text"
          className="w-full h-10 px-3 pr-8 bg-white border border-outline-variant rounded-lg text-sm font-bold text-on-surface shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:font-medium placeholder:text-gray-400"
          placeholder="Search customer name or code..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
        <ChevronDown size={16} className={`absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 transition-transform duration-200 pointer-events-none ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-outline-variant rounded-xl shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="max-h-48 overflow-y-auto py-1">
            {filteredCustomers.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500 text-center">No customers found</div>
            ) : (
              filteredCustomers.map((c) => (
                <div
                  key={c.id}
                  onClick={() => {
                    onChange(c.name);
                    setSearch(c.name);
                    setIsOpen(false);
                  }}
                  className={`px-3 py-2 cursor-pointer hover:bg-primary/5 transition-colors flex flex-col ${value === c.name ? 'bg-primary/10 border-l-2 border-primary' : 'border-l-2 border-transparent'}`}
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
