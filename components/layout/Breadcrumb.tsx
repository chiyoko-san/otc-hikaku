import Link from 'next/link';

export type BreadcrumbItem = {
  name: string;
  href?: string;
};

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="breadcrumb" className="mb-4 text-sm">
      <ol className="flex flex-wrap items-center gap-1 text-gray-500">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-300">/</span>}
            {item.href && i < items.length - 1 ? (
              <Link href={item.href} className="hover:text-brand hover:underline">
                {item.name}
              </Link>
            ) : (
              <span className="text-gray-900">{item.name}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
