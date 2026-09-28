#!/usr/bin/env python3
"""Minimal PNG sampler (stdlib only) — reports average colour and how
uniform an image is, so we can tell a real render from a blank frame."""
import sys, zlib, struct


def read_png(path):
    d = open(path, 'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n', 'not a png'
    pos, idat, meta = 8, b'', {}
    while pos < len(d):
        ln = struct.unpack('>I', d[pos:pos + 4])[0]
        typ = d[pos + 4:pos + 8]
        data = d[pos + 8:pos + 8 + ln]
        if typ == b'IHDR':
            w, h, bd, ct, comp, filt, inter = struct.unpack('>IIBBBBB', data)
            meta = dict(w=w, h=h, bd=bd, ct=ct, inter=inter)
        elif typ == b'IDAT':
            idat += data
        elif typ == b'IEND':
            break
        pos += 12 + ln
    assert meta['bd'] == 8 and meta['inter'] == 0, meta
    ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[meta['ct']]
    raw = zlib.decompress(idat)
    w, h = meta['w'], meta['h']
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


def sample(path):
    w, h, ch, px = read_png(path)
    if ch < 3:
        return dict(err='channels=%d' % ch)
    step = max(1, (w * h) // 20000)
    tot = [0, 0, 0]
    n = 0
    uniq = set()
    for i in range(0, w * h, step):
        o = i * ch
        r, g, b = px[o], px[o + 1], px[o + 2]
        tot[0] += r; tot[1] += g; tot[2] += b
        n += 1
        uniq.add((r >> 4, g >> 4, b >> 4))
    # centre pixel (where a card would sit)
    cx, cy = w // 2, h // 2
    o = (cy * w + cx) * ch
    centre = (px[o], px[o + 1], px[o + 2])
    return dict(size='%dx%d' % (w, h),
                avg='(%d,%d,%d)' % (tot[0] // n, tot[1] // n, tot[2] // n),
                centre=centre,
                colours=len(uniq))


for path in sys.argv[1:]:
    try:
        print('%-28s %s' % (path.split('/')[-1], sample(path)))
    except Exception as e:
        print('%-28s ERROR %s' % (path.split('/')[-1], e))
