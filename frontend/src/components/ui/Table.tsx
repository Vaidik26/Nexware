import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { PageLoader } from '@/components/ui/PageLoader';

interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T, index: number) => ReactNode);
  className?: string;
}

interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (row: T) => string;
  isLoading?: boolean;
}

export function Table<T>({ data, columns, keyExtractor, isLoading }: TableProps<T>) {
  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
      <table className="w-full text-left text-sm text-on-surface">
        <thead className="bg-surface text-on-surface-variant text-xs uppercase font-medium">
          <tr>
            {columns.map((col, i) => (
              <th key={i} className={`px-6 py-4 ${col.className || ''}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-6 py-8 text-center text-on-surface-variant">
                No data available
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <motion.tr
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                key={keyExtractor(row)}
                className="border-t border-outline-variant hover:bg-surface/50 transition-colors"
              >
                {columns.map((col, j) => (
                  <td key={j} className={`px-6 py-4 ${col.className || ''}`}>
                    {typeof col.accessor === 'function' ? col.accessor(row, i) : (row[col.accessor as keyof T] as ReactNode)}
                  </td>
                ))}
              </motion.tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
