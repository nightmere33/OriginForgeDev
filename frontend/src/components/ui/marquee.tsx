/** Full-bleed mono ticker (DESIGN.md §5). The second track only closes the loop. */
export default function Marquee({ items }: { items: string[] }) {
  const track = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className={hidden ? "marquee-track motion-reduce:hidden" : "marquee-track"}>
      {items.map((item) => (
        <li key={item} className="hud flex items-center whitespace-nowrap px-6 py-3 text-muted">
          <span aria-hidden className="mr-6 inline-block size-1.5 bg-ember-500" />
          {item}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="marquee border-y border-line">
      {track(false)}
      {track(true)}
    </div>
  );
}
