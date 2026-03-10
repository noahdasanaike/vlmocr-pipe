import Image from "next/image";

const paintings: Record<string, { src: string; caption: string }> = {
  dashboard: {
    src: "/art/monet-the-magpie.jpg",
    caption: "Claude Monet, The Magpie, 1869",
  },
  "jobs/new": {
    src: "/art/monet-water-lilies.jpg",
    caption: "Claude Monet, Water Lilies, 1906",
  },
  "jobs/detail": {
    src: "/art/monet-sandvika-snow.jpg",
    caption: "Claude Monet, Sandvika, Norway, 1895",
  },
  billing: {
    src: "/art/monet-impression-sunrise.jpg",
    caption: "Claude Monet, Impression, Sunrise, 1872",
  },
  models: {
    src: "/art/monet-haystacks-snow.jpg",
    caption: "Claude Monet, Haystacks (Effect of Snow and Sun), 1891",
  },
};

export function ArtFooter({ page }: { page: keyof typeof paintings }) {
  const art = paintings[page];
  if (!art) return null;

  return (
    <div className="relative mt-12 h-28 overflow-hidden rounded-xl">
      <Image
        src={art.src}
        alt=""
        fill
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
      <p className="absolute bottom-3 left-4 text-[11px] text-white/60 italic">
        {art.caption}
      </p>
    </div>
  );
}
