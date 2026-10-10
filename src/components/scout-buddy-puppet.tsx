import { useId } from "react";
const POSES = {
  standing: {
    art: "/icons/scout-brand-v1/scout-buddy-256.webp",
    width: 512,
    height: 614,
    viewBox: "0 0 512 614",
    arm: "M337 323 L366 334 L378 314 L376 297 Q379 274 398 277 Q414 279 417 303 Q439 280 456 295 Q478 311 452 342 Q414 387 363 382 L346 355 Z",
  },
  composer: {
    art: "/icons/scout-brand-v1/scout-buddy-composer-v2-512.webp",
    width: 1374,
    height: 1145,
    viewBox: "140 40 1110 1075",
    arm: "M846 762 L979 802 L1019 764 L1023 681 Q1028 640 1075 640 Q1124 639 1130 684 Q1181 648 1214 682 Q1255 718 1215 789 Q1159 882 1066 927 Q1009 954 955 933 L926 900 Z",
  },
};
export default function ScoutBuddyPuppet({ pose = "standing" }: { pose?: keyof typeof POSES }) {
  const id = useId();
  const { art, width, height, viewBox, arm } = POSES[pose];
  return (
    <svg
      viewBox={viewBox}
      data-pose={pose}
      aria-hidden="true"
      focusable="false"
      className="scout-buddy-art h-full w-full select-none"
    >
      <defs>
        <clipPath id={`${id}-body`}>
          <path d={`M0 0H${width}V${height}H0Z ${arm}`} clipRule="evenodd" />
        </clipPath>
        <clipPath id={`${id}-arm`}>
          <path d={arm} />
        </clipPath>
      </defs>
      <image href={art} width={width} height={height} clipPath={`url(#${id}-body)`} />
      <g className="scout-buddy-arm">
        <image href={art} width={width} height={height} clipPath={`url(#${id}-arm)`} />
      </g>
    </svg>
  );
}
