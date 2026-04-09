import { FaSearch } from "react-icons/fa";

interface FilterOption {
  value: string;
  label: string;
  activeClass?: string;
}

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder?: string;
  filters?: FilterOption[];
  activeFilter?: string;
  onFilterChange?: (value: string) => void;
}

export function FilterBar({
  searchQuery,
  onSearchChange,
  searchPlaceholder = "Search...",
  filters,
  activeFilter,
  onFilterChange,
}: FilterBarProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex-1 relative">
          <FaSearch className="absolute left-4 rtl:left-auto rtl:right-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-12 rtl:pl-4 rtl:pr-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
          />
        </div>
        {filters && filters.length > 0 && onFilterChange && (
          <div className="flex gap-2">
            {filters.map((filter) => (
              <button
                key={filter.value}
                onClick={() => onFilterChange(filter.value)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeFilter === filter.value
                    ? filter.activeClass ?? "bg-dental-blue text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
