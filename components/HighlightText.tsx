"use client";

interface HighlightTextProps {
  text: string;
  query: string;
  className?: string;
}

export default function HighlightText({
  text,
  query,
  className = "",
}: HighlightTextProps) {
  if (!query.trim()) {
    return <span className={className}>{text}</span>;
  }

  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();
  const parts: { text: string; isMatch: boolean }[] = [];

  let lastIndex = 0;
  let index = lowerText.indexOf(lowerQuery);

  while (index !== -1) {
    if (index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, index), isMatch: false });
    }
    parts.push({
      text: text.slice(index, index + query.length),
      isMatch: true,
    });
    lastIndex = index + query.length;
    index = lowerText.indexOf(lowerQuery, lastIndex);
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), isMatch: false });
  }

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.isMatch ? (
          <mark
            key={i}
            className="rounded-sm bg-primary/25 px-0.5 text-text-primary"
          >
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  );
}
