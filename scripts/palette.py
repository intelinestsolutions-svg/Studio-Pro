#!/usr/bin/env python3
"""Dominant-colour report for a PNG (no PIL required).

    python3 scripts/palette.py shot.png [n]

Prints the n most common colours (quantised to 16 levels per channel) with
their share and average position — enough to recover a palette from a
screenshot: background, line colour, accent.
"""
import struct, sys, zlib
from collections import Counter, defaultdict


def load(path):
    d = open(path, 'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n', 'not a png'
    pos, idat, w, h, depth, ctype = 8, b'', 0, 0, 0, 0
    while pos < len(d):
        ln = struct.unpack('>I', d[pos:pos + 4])[0]
        tag = d[pos + 4:pos + 8]
        data = d[pos + 8:pos + 8 + ln]
        if tag == b'IHDR':
            w, h, depth, ctype = struct.unpack('>IIBB', data[:10])
        elif tag == b'IDAT':
            idat += data
        elif tag == b'IEND':
            break
        pos += 12 + ln
    raw = zlib.decompress(idat)
    ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    if depth != 8:
        raise SystemExit(f'unsupported bit depth {depth}')
    stride = w * ch
    out = bytearray(stride * h)
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]
        p += 1
        line = bytearray(raw[p:p + stride])
        p += stride
        if f == 1:
            for i in range(ch, stride):
                line[i] = (line[i] + line[i - ch]) & 255
        elif f == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                b = prev[i]
                c = prev[i - ch] if i >= ch else 0
                pp = a + b - c
                pa, pb, pc = abs(pp - a), abs(pp - b), abs(pp - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return w, h, ch, bytes(out)


def main():
    path = sys.argv[1]
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 14
    w, h, ch, px = load(path)
    if ch < 3:
        raise SystemExit('greyscale image')
    cnt = Counter()
    pos = defaultdict(lambda: [0, 0, 0])
    total = 0
    step = max(1, int((w * h) ** 0.5 // 260)) or 1
    for y in range(0, h, step):
        row = y * w * ch
        for x in range(0, w, step):
            i = row + x * ch
            r, g, b = px[i], px[i + 1], px[i + 2]
            k = (r >> 4, g >> 4, b >> 4)
            cnt[k] += 1
            s = pos[k]
            s[0] += x
            s[1] += y
            s[2] += 1
            total += 1
    print(f'{path}  {w}x{h}')
    for k, c in cnt.most_common(n):
        r, g, b = k[0] * 16 + 8, k[1] * 16 + 8, k[2] * 16 + 8
        s = pos[k]
        print(f'  #{r:02x}{g:02x}{b:02x}  {100 * c / total:5.1f}%  '
              f'@({s[0] // s[2]},{s[1] // s[2]})  rgb({r},{g},{b})')


if __name__ == '__main__':
    main()
