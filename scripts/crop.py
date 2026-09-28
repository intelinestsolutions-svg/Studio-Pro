#!/usr/bin/env python3
"""Crop the top-left region out of a PNG (stdlib only).

Chrome keeps position:fixed bars anchored to the bottom of the viewport, so
the way to get a clean hero shot of a third-party site is to capture at a
taller window and then keep only the top of it.
"""
import sys, zlib, struct


def decode(path):
    d = open(path, 'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n', 'not a png'
    pos, idat, meta = 8, b'', None
    while pos < len(d):
        ln = struct.unpack('>I', d[pos:pos + 4])[0]
        typ = d[pos + 4:pos + 8]
        data = d[pos + 8:pos + 8 + ln]
        if typ == b'IHDR':
            w, h, bd, ct, comp, filt, inter = struct.unpack('>IIBBBBB', data)
            meta = (w, h, bd, ct, inter)
        elif typ == b'IDAT':
            idat += data
        elif typ == b'IEND':
            break
        pos += 12 + ln
    w, h, bd, ct, inter = meta
    assert bd == 8 and inter == 0 and ct in (2, 6), meta
    ch = 3 if ct == 2 else 4
    raw = zlib.decompress(idat)
    stride = w * ch
    out = bytearray(stride * h)
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]; p += 1
        line = bytearray(raw[p:p + stride]); p += stride
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
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return w, h, ch, out


def encode(path, w, h, ch, px):
    ct = 2 if ch == 3 else 6
    stride = w * ch
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += px[y * stride:(y + 1) * stride]

    def chunk(typ, data):
        c = struct.pack('>I', len(data)) + typ + data
        return c + struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff)

    out = b'\x89PNG\r\n\x1a\n'
    out += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, ct, 0, 0, 0))
    out += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    out += chunk(b'IEND', b'')
    open(path, 'wb').write(out)


def crop(path, dst, cw, ch_):
    w, h, ch, px = decode(path)
    cw = min(cw, w)
    ch_ = min(ch_, h)
    stride = w * ch
    out = bytearray(cw * ch_ * ch)
    for y in range(ch_):
        s = y * stride
        out[y * cw * ch:(y + 1) * cw * ch] = px[s:s + cw * ch]
    encode(dst, cw, ch_, ch, out)
    return (w, h), (cw, ch_)


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    cw, chh = int(sys.argv[3]), int(sys.argv[4])
    print('%s %s -> %s' % (src, crop(src, dst, cw, chh), dst))
