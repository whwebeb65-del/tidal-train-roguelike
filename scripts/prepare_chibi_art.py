from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageOps


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--width", type=int)
    parser.add_argument("--height", type=int)
    parser.add_argument("--max-edge", type=int)
    parser.add_argument("--quality", type=int, default=82)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source = Path(args.input)
    output = Path(args.output)
    image = Image.open(source).convert("RGBA")

    if args.width and args.height:
        image = ImageOps.fit(
            image,
            (args.width, args.height),
            method=Image.Resampling.LANCZOS,
        )
    elif args.max_edge:
        image.thumbnail(
            (args.max_edge, args.max_edge),
            Image.Resampling.LANCZOS,
        )
    else:
        raise SystemExit("provide --width/--height or --max-edge")

    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(
        output,
        format="WEBP",
        quality=args.quality,
        method=6,
        exact=True,
    )


if __name__ == "__main__":
    main()
