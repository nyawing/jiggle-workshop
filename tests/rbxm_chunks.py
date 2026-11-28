"""Минимальный читатель RBXM для проверки типа BrickColor без внешнего репозитория."""
import struct


def lz4_decompress(src, expected):
    out = bytearray()
    pos = 0
    end = len(src)
    while pos < end:
        token = src[pos]
        pos += 1
        length = token >> 4
        if length == 15:
            while True:
                b = src[pos]
                pos += 1
                length += b
                if b != 255:
                    break
        out += src[pos:pos + length]
        pos += length
        if pos >= end:
            break
        offset = src[pos] | src[pos + 1] << 8
        pos += 2
        length = token & 15
        if length == 15:
            while True:
                b = src[pos]
                pos += 1
                length += b
                if b != 255:
                    break
        length += 4
        start = len(out) - offset
        for i in range(length):
            out.append(out[start + i])
    if expected and len(out) != expected:
        raise ValueError('LZ4: получено %d байт вместо %d' % (len(out), expected))
    return bytes(out)


def read_string(body, offset):
    length, = struct.unpack_from('<I', body, offset)
    offset += 4
    return (body[offset:offset + length].decode('utf-8', 'replace'), offset + length)


def model_chunks(data):
    offset = 32
    while offset + 16 <= len(data):
        header = data[offset:offset + 16]
        tag = header[:4]
        comp, raw = struct.unpack_from('<II', header, 4)
        stored = data[offset + 16:offset + 16 + (comp or raw)]
        payload = lz4_decompress(stored, raw) if comp else stored
        offset += 16 + len(stored)
        yield (header, stored, payload)
        if tag == b'END\x00':
            assert offset == len(data), 'unexpected model trailer'
            break
