import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders organizer-written Markdown. Raw HTML is not rendered. */
export function Markdown({ children, className = "prose-race" }: { children: string | null | undefined; className?: string }) {
  if (!children) return null;
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: c }) => {
            const external = href?.startsWith("http");
            return (
              <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                {c}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
