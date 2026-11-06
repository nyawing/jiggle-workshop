"""Remove explanatory Lua comments from delivery copies, never string contents."""
import re

LONG = re.compile(r'\[(=*)\[')
NOTICE = re.compile(r'copyright|\blicen[sc]e\b|SPDX|all rights reserved', re.I)

def strip_comments(source):
    out = []
    i = 0
    while i < len(source):
        if source.startswith('--', i):
            start = i
            match = LONG.match(source, i + 2)
            if match:
                close = ']' + match.group(1) + ']'
                end = source.find(close, match.end())
                if end < 0:
                    raise ValueError('Unterminated long comment')
                i = end + len(close)
            else:
                end = re.search(r'[\r\n]', source[i:])
                i = i + end.start() if end else len(source)
            comment = source[start:i]
            if comment.startswith('--!') or NOTICE.search(comment):
                out.append(comment)
            else:
                # Preserve line numbers and prevent adjacent tokens merging.
                out.append(''.join(c if c in '\r\n' else ' ' for c in comment))
        elif source[i] in "\"'`":
            start = i
            quote = source[i]
            i += 1
            while i < len(source):
                if source[i] == '\\':
                    i += 2
                elif source[i] == quote:
                    i += 1
                    break
                else:
                    i += 1
            else:
                raise ValueError('Unterminated quoted string')
            out.append(source[start:i])
        else:
            match = LONG.match(source, i)
            if match:
                end = source.find(']' + match.group(1) + ']', match.end())
                if end < 0:
                    raise ValueError('Unterminated long string')
                end += len(match.group(1)) + 2
                out.append(source[i:end])
                i = end
            else:
                out.append(source[i])
                i += 1
    return ''.join(out)
