type Props = { text: string };

export function MarqueeBar({ text }: Props) {
  const doubled = `${text} · ${text} · `;
  return (
    <div className="pc-marquee bg-[#050505]">
      <div className="pc-marquee-inner">
        <span>{doubled}</span>
        <span aria-hidden>{doubled}</span>
      </div>
    </div>
  );
}
