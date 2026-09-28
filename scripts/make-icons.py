#!/usr/bin/env python3
"""Generate favicon.png / apple-touch-icon.png from the flat Studio Pro logo.

No PIL in this environment, so we read the raw RGB that `sips` dumps and
write the PNG ourselves. The SP monogram is padded into a square and the
wordmark band underneath it is painted out (the logo background is already
solid black, so the patch is invisible).
"""
import struct
import zlib
import sys

W = H = 750
GLYPH = dict(x0=220, x1=612, y0=156, y1=530)  # measured from the bitmap
WORDMARK_Y = 544  # everything at/after this row belongs to the wordmark

PAD = 1.18  # padding factor around the monogram


def read_rgb(path):
    """`sips -s format bmp` on macOS writes a headerless BGR dump, so swap
    R/B back to RGB here. Brightness-only analysis would not catch this —
    it only shows up as a blue monogram turning red."""
    d = bytearray(open(path, "rb").read())
    assert len(d) == W * H * 3, f"unexpected raw size {len(d)}"
    for i in range(0, len(d), 3):
        d[i], d[i + 2] = d[i + 2], d[i]
    return bytes(d)


def png_bytes(w, h, rgb):
    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    stride = w * 3
    raw = bytearray()
    for y in range(h):
        raw.append(0)  # filter: none
        raw += rgb[y * stride : (y + 1) * stride]
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def resize(src, sw, sh, dw, dh):
    out = bytearray(dw * dh * 3)
    for y in range(dh):
        fy = (y + 0.5) * sh / dh - 0.5
        y0 = max(0, min(sh - 1, int(fy)))
        y1 = min(sh - 1, y0 + 1)
        wy = fy - y0
        for x in range(dw):
            fx = (x + 0.5) * sw / dw - 0.5
            x0 = max(0, min(sw - 1, int(fx)))
            x1 = min(sw - 1, x0 + 1)
            wx = fx - x0
            o = (y * dw + x) * 3
            for c in range(3):
                a = src[(y0 * sw + x0) * 3 + c]
                b = src[(y0 * sw + x1) * 3 + c]
                t = src[(y1 * sw + x0) * 3 + c]
                u = src[(y1 * sw + x1) * 3 + c]
                top = a + (b - a) * wx
                bot = t + (u - t) * wx
                v = top + (bot - top) * wy
                out[o + c] = 0 if v < 0 else (255 if v > 255 else int(v + 0.5))
    return bytes(out)


def build(src_rgb, size):
    gw = GLYPH["x1"] - GLYPH["x0"] + 1
    gh = GLYPH["y1"] - GLYPH["y0"] + 1
    side = int(max(gw, gh) * PAD)
    cx = (GLYPH["x0"] + GLYPH["x1"] + 1) / 2
    cy = (GLYPH["y0"] + GLYPH["y1"] + 1) / 2
    sx = int(round(cx - side / 2))
    sy = int(round(cy - side / 2))

    crop = bytearray(side * side * 3)
    for y in range(side):
        ys = sy + y
        for x in range(side):
            xs = sx + x
            o = (y * side + x) * 3
            if 0 <= xs < W and 0 <= ys < H and ys < WORDMARK_Y:
                i = (ys * W + xs) * 3
                crop[o : o + 3] = src_rgb[i : i + 3]
            # otherwise leave it black — matches the logo background

    return resize(bytes(crop), side, side, size, size)


def main():
    raw_path, out_path, size = sys.argv[1], sys.argv[2], int(sys.argv[3])
    src = read_rgb(raw_path)
    open(out_path, "wb").write(png_bytes(size, size, build(src, size)))
    print(f"wrote {out_path} ({size}x{size})")


if __name__ == "__main__":
    main()
