import { Link } from "react-router";
import { tagUrl } from "@content/obsidian/slug";

export function TagList({ tags, label = "Temas" }: { tags: string[]; label?: string }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-base text-muted">{label}:</span>
      <ul className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <li key={t}>
            <Link
              to={tagUrl(t)}
              viewTransition
              className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-3.5 text-base transition-colors hover:border-amber"
            >
              #{t}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
