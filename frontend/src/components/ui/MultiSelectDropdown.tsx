import { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { ChevronDown, Search, X } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface MultiSelectDropdownProps {
  label: string;
  options: Option[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  placeholder = "Select...",
  disabled = false,
}: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter(opt => 
    opt.label.toLowerCase().includes(search.toLowerCase()) || 
    opt.value.toLowerCase().includes(search.toLowerCase())
  );

  const allFilteredSelected = filteredOptions.length > 0 && filteredOptions.every(opt => selected.has(opt.value));
  const someFilteredSelected = filteredOptions.some(opt => selected.has(opt.value));

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const toggleSelectAll = () => {
    const newSelected = new Set(selected);
    if (allFilteredSelected) {
      // clear filtered
      filteredOptions.forEach(opt => newSelected.delete(opt.value));
    } else {
      // select all filtered
      filteredOptions.forEach(opt => newSelected.add(opt.value));
    }
    onChange(newSelected);
  };

  const toggleOption = (value: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(value)) {
      newSelected.delete(value);
    } else {
      newSelected.add(value);
    }
    onChange(newSelected);
  };

  return (
    <div className="flex flex-col gap-1.5 min-w-[200px] flex-1 max-w-xs relative" ref={containerRef}>
      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</label>
      
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          "flex items-center justify-between w-full bg-white border border-slate-200 rounded-lg p-2 text-sm font-semibold text-slate-700 transition-all text-left",
          disabled ? "opacity-50 cursor-not-allowed" : "hover:border-slate-300 focus:ring-2 focus:ring-primary/20 cursor-pointer",
          isOpen && "ring-2 ring-primary/20 border-primary"
        )}
      >
        <span className="truncate pr-2 flex-1">
          {selected.size === 0 ? (
            <span className="text-slate-400 font-normal">{placeholder}</span>
          ) : selected.size === 1 ? (
            options.find(o => o.value === Array.from(selected)[0])?.label || Array.from(selected)[0]
          ) : (
            `${selected.size} selected`
          )}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {selected.size > 0 && (
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange(new Set());
              }}
              className="p-0.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
            >
              <X size={14} />
            </div>
          )}
          <ChevronDown size={16} className={clsx("text-slate-400 transition-transform", isOpen && "rotate-180")} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-[calc(100%+4px)] left-0 w-full z-50 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[320px]">
          <div className="p-2 border-b border-slate-100 shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all"
                autoFocus
              />
            </div>
          </div>
          
          <div className="overflow-y-auto flex-1 p-1">
            {filteredOptions.length > 0 && (
              <div 
                className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer rounded-md border-b border-slate-50 mb-1"
                onClick={toggleSelectAll}
              >
                <div className={clsx(
                  "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                  allFilteredSelected ? "bg-primary border-primary text-white" : 
                  someFilteredSelected ? "bg-primary/10 border-primary text-primary" : "border-slate-300 bg-white"
                )}>
                  {allFilteredSelected && <span className="text-[10px] leading-none">✓</span>}
                  {!allFilteredSelected && someFilteredSelected && <div className="w-2 h-0.5 bg-current rounded-full" />}
                </div>
                <span className="text-xs font-semibold text-slate-700">Select All</span>
              </div>
            )}
            
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-500">
                No options found
              </div>
            ) : (
              filteredOptions.map((opt) => (
                <div 
                  key={opt.value}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer rounded-md transition-colors"
                  onClick={() => toggleOption(opt.value)}
                >
                  <div className={clsx(
                    "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                    selected.has(opt.value) ? "bg-primary border-primary text-white" : "border-slate-300 bg-white"
                  )}>
                    {selected.has(opt.value) && <span className="text-[10px] leading-none">✓</span>}
                  </div>
                  <span className="text-xs text-slate-700 truncate" title={opt.label}>{opt.label}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
