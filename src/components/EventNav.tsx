import Link from "next/link";

export function EventNav({
  eventId,
  supportsBracket,
  active,
}: {
  eventId: string;
  supportsBracket: boolean;
  active: "overview" | "operator" | "bracket" | "standings" | "broadcast";
}) {
  const resultsHref = supportsBracket
    ? `/events/${eventId}/bracket`
    : `/events/${eventId}/standings`;
  const resultsLabel = supportsBracket ? "Bracket" : "Standings";
  const items = [
    { key: "overview", label: "Overview", href: `/events/${eventId}` },
    { key: "operator", label: "Operator", href: `/events/${eventId}/play` },
    { key: supportsBracket ? "bracket" : "standings", label: resultsLabel, href: resultsHref },
    { key: "broadcast", label: "Broadcast", href: `/events/${eventId}/broadcast` },
  ] as const;

  return (
    <nav className="nav-strip" aria-label="Tournament navigation">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={`nav-link ${active === item.key ? "nav-link-active" : ""}`}
          aria-current={active === item.key ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
