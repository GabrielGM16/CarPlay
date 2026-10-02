/**
 * Tests for the pure ID3 byte parsing.
 *
 * Run with:  npm run test
 *
 * Node 24 strips the types natively, so these run with no build step and no
 * test framework beyond `node:test`. Imports carry an explicit `.ts`
 * extension, which is why this directory is excluded from tsconfig.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  clean,
  decodeTextFrame,
  decodeUtf8,
  FRONT_COVER,
  isId3v2Header,
  parseId3v1,
  parseId3v2Frames,
  readId3v2Header,
  readSyncsafe32,
  removeUnsynchronisation,
  stripTagPrefixes,
} from '../id3-parse.ts';

// ------------------------------------------------------------------ builders

const LATIN1 = 0x00;
const UTF16_BOM = 0x01;
const UTF16_BE = 0x02;
const UTF8 = 0x03;

function bytes(...values: (number | number[])[]): Uint8Array {
  return new Uint8Array(values.flat());
}

function latin1Bytes(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0));
}

function utf16leBytes(text: string, withBom = true): number[] {
  const out = withBom ? [0xff, 0xfe] : [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    out.push(code & 0xff, code >> 8);
  }
  return out;
}

function utf16beBytes(text: string, withBom = false): number[] {
  const out = withBom ? [0xfe, 0xff] : [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    out.push(code >> 8, code & 0xff);
  }
  return out;
}

function utf8Bytes(text: string): number[] {
  return [...Buffer.from(text, 'utf8')];
}

function uint32be(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function syncsafe32(value: number): number[] {
  return [
    (value >> 21) & 0x7f,
    (value >> 14) & 0x7f,
    (value >> 7) & 0x7f,
    value & 0x7f,
  ];
}

/** A v2.3 (big-endian size) or v2.4 (synchsafe size) frame. */
function frame(id: string, body: number[], majorVersion = 3): number[] {
  const size = majorVersion >= 4 ? syncsafe32(body.length) : uint32be(body.length);
  return [...latin1Bytes(id), ...size, 0x00, 0x00, ...body];
}

/** A v2.2 frame: 3-char id, 3-byte size, no flags. */
function frameV22(id: string, body: number[]): number[] {
  const size = body.length;
  return [
    ...latin1Bytes(id),
    (size >> 16) & 0xff,
    (size >> 8) & 0xff,
    size & 0xff,
    ...body,
  ];
}

function textFrame(id: string, encoding: number, value: number[], major = 3) {
  return frame(id, [encoding, ...value], major);
}

/** An APIC body: encoding, MIME, picture type, description, image data. */
function apicBody(
  mime: string,
  pictureType: number,
  description: string,
  data: number[]
): number[] {
  return [
    LATIN1,
    ...latin1Bytes(mime),
    0x00,
    pictureType,
    ...latin1Bytes(description),
    0x00,
    ...data,
  ];
}

function id3v2Header(majorVersion: number, flags: number, size: number) {
  return bytes(
    latin1Bytes('ID3'),
    [majorVersion, 0x00, flags],
    syncsafe32(size)
  );
}

// -------------------------------------------------------------------- header

describe('ID3v2 header', () => {
  it('recognises an ID3 magic and reads version, flags and size', () => {
    const header = id3v2Header(4, 0x80, 1234);
    assert.equal(isId3v2Header(header), true);
    assert.deepEqual(readId3v2Header(header), {
      majorVersion: 4,
      flags: 0x80,
      size: 1234,
    });
  });

  it('rejects a buffer that is not an ID3 tag', () => {
    assert.equal(isId3v2Header(bytes(latin1Bytes('RIFF'), [0, 0, 0, 0, 0, 0])), false);
    assert.equal(isId3v2Header(bytes([0xff, 0xfb, 0x90])), false);
  });

  it('reads synchsafe sizes using only the low 7 bits of each byte', () => {
    // 0x7F,0x7F,0x7F,0x7F is the largest synchsafe 28-bit value.
    assert.equal(readSyncsafe32(bytes([0x7f, 0x7f, 0x7f, 0x7f]), 0), 0x0fffffff);
    assert.equal(readSyncsafe32(bytes([0x00, 0x00, 0x02, 0x01]), 0), 257);
    // High bits are ignored rather than shifting the value.
    assert.equal(readSyncsafe32(bytes([0x80, 0x80, 0x80, 0x80]), 0), 0);
  });
});

// --------------------------------------------------------------------- frames

describe('ID3v2.3 frames', () => {
  it('reads latin-1 title, artist and album', () => {
    const tag = bytes(
      textFrame('TIT2', LATIN1, latin1Bytes('Sultans of Swing')),
      textFrame('TPE1', LATIN1, latin1Bytes('Dire Straits')),
      textFrame('TALB', LATIN1, latin1Bytes('Dire Straits'))
    );

    const tags = parseId3v2Frames(tag, 3);
    assert.equal(tags.title, 'Sultans of Swing');
    assert.equal(tags.artist, 'Dire Straits');
    assert.equal(tags.album, 'Dire Straits');
    assert.equal(tags.picture, null);
  });

  it('treats v2.3 frame sizes as plain big-endian, not synchsafe', () => {
    // A 200-byte body encodes as 0x000000C8. Read as synchsafe that is 72,
    // which would truncate the value and desynchronise the frame walk.
    const title = 'A'.repeat(199);
    const tag = bytes(
      textFrame('TIT2', LATIN1, latin1Bytes(title)),
      textFrame('TPE1', LATIN1, latin1Bytes('Follows correctly'))
    );

    const tags = parseId3v2Frames(tag, 3);
    assert.equal(tags.title, title);
    assert.equal(tags.artist, 'Follows correctly');
  });

  it('stops at the tag padding', () => {
    const tag = bytes(
      textFrame('TIT2', LATIN1, latin1Bytes('Real frame')),
      new Array(64).fill(0x00)
    );

    const tags = parseId3v2Frames(tag, 3);
    assert.equal(tags.title, 'Real frame');
    assert.equal(tags.artist, null);
  });

  it('keeps the first value when a frame is repeated', () => {
    const tag = bytes(
      textFrame('TIT2', LATIN1, latin1Bytes('First')),
      textFrame('TIT2', LATIN1, latin1Bytes('Second'))
    );

    assert.equal(parseId3v2Frames(tag, 3).title, 'First');
  });

  it('ignores frames it does not know about', () => {
    const tag = bytes(
      frame('TCON', [LATIN1, ...latin1Bytes('Rock')]),
      frame('COMM', [LATIN1, ...latin1Bytes('eng'), 0x00, ...latin1Bytes('note')]),
      textFrame('TIT2', LATIN1, latin1Bytes('Found anyway'))
    );

    assert.equal(parseId3v2Frames(tag, 3).title, 'Found anyway');
  });
});

describe('ID3v2.4 frames', () => {
  it('reads synchsafe frame sizes', () => {
    const tag = bytes(
      textFrame('TIT2', UTF8, utf8Bytes('Björk — Jóga'), 4),
      textFrame('TPE1', UTF8, utf8Bytes('Björk'), 4)
    );

    const tags = parseId3v2Frames(tag, 4);
    assert.equal(tags.title, 'Björk — Jóga');
    assert.equal(tags.artist, 'Björk');
  });

  it('handles a body long enough to need the second synchsafe byte', () => {
    // 300 bytes: synchsafe 0x00,0x00,0x02,0x2C. A big-endian read gives 556
    // and would run past the end of the tag.
    const title = 'B'.repeat(299);
    const tag = bytes(
      textFrame('TIT2', LATIN1, latin1Bytes(title), 4),
      textFrame('TALB', LATIN1, latin1Bytes('Still parsed'), 4)
    );

    const tags = parseId3v2Frames(tag, 4);
    assert.equal(tags.title, title);
    assert.equal(tags.album, 'Still parsed');
  });
});

describe('ID3v2.2 frames', () => {
  it('reads 3-character ids with 3-byte sizes', () => {
    const tag = bytes(
      frameV22('TT2', [LATIN1, ...latin1Bytes('Old Rip')]),
      frameV22('TP1', [LATIN1, ...latin1Bytes('Some Artist')]),
      frameV22('TAL', [LATIN1, ...latin1Bytes('Some Album')])
    );

    const tags = parseId3v2Frames(tag, 2);
    assert.equal(tags.title, 'Old Rip');
    assert.equal(tags.artist, 'Some Artist');
    assert.equal(tags.album, 'Some Album');
  });

  it('reads a PIC frame with a 3-character format code', () => {
    const image = [0x89, 0x50, 0x4e, 0x47];
    const tag = bytes(
      frameV22('PIC', [
        LATIN1,
        ...latin1Bytes('PNG'),
        FRONT_COVER,
        ...latin1Bytes('cover'),
        0x00,
        ...image,
      ])
    );

    const tags = parseId3v2Frames(tag, 2);
    assert.ok(tags.picture);
    assert.equal(tags.picture.mime, 'image/png');
    assert.equal(tags.picture.pictureType, FRONT_COVER);
    assert.deepEqual([...tags.picture.data], image);
  });
});

// ------------------------------------------------------------------ encodings

describe('text encodings', () => {
  it('decodes UTF-16 little-endian with a BOM', () => {
    const tag = bytes(textFrame('TIT2', UTF16_BOM, utf16leBytes('Café del Mar')));
    assert.equal(parseId3v2Frames(tag, 3).title, 'Café del Mar');
  });

  it('decodes UTF-16 big-endian from its BOM', () => {
    const tag = bytes(
      textFrame('TIT2', UTF16_BOM, utf16beBytes('Café del Mar', true))
    );
    assert.equal(parseId3v2Frames(tag, 3).title, 'Café del Mar');
  });

  it('decodes bare UTF-16BE (encoding $02, no BOM)', () => {
    const tag = bytes(textFrame('TIT2', UTF16_BE, utf16beBytes('東京')));
    assert.equal(parseId3v2Frames(tag, 3).title, '東京');
  });

  it('decodes UTF-8 including astral code points', () => {
    const value = 'Sun 🌞 Rise';
    const tag = bytes(textFrame('TIT2', UTF8, utf8Bytes(value)));
    assert.equal(parseId3v2Frames(tag, 3).title, value);
  });

  it('decodes multi-byte UTF-8 sequences directly', () => {
    const source = 'aé漢🌞';
    const buffer = new Uint8Array(Buffer.from(source, 'utf8'));
    assert.equal(decodeUtf8(buffer, 0, buffer.length), source);
  });

  it('does not hang or throw on malformed UTF-8', () => {
    // 0xC3 announces a 2-byte sequence but no continuation byte follows.
    const broken = bytes([0x61, 0xc3, 0x62, 0xff, 0x63]);
    const decoded = decodeUtf8(broken, 0, broken.length);
    assert.equal(typeof decoded, 'string');
    assert.ok(decoded.includes('a'));
    assert.ok(decoded.includes('c'));
  });

  it('falls back to latin-1 when the encoding byte is unknown', () => {
    const tag = bytes(textFrame('TIT2', 0x7a, latin1Bytes('Odd')));
    const title = parseId3v2Frames(tag, 3).title;
    assert.ok(title && title.includes('Odd'));
  });

  it('returns empty for a zero-length text frame', () => {
    assert.equal(decodeTextFrame(bytes([LATIN1]), 0, 1), '');
    assert.equal(decodeTextFrame(bytes([]), 0, 0), '');
  });
});

describe('clean', () => {
  it('cuts the value at the first NUL', () => {
    assert.equal(clean('Title   '), 'Title');
    assert.equal(clean('Title trailing junk'), 'Title');
  });

  it('trims surrounding whitespace', () => {
    assert.equal(clean('  Padded  '), 'Padded');
  });

  it('returns null for an empty or all-NUL value', () => {
    assert.equal(clean(''), null);
    assert.equal(clean('  '), null);
    assert.equal(clean('   '), null);
  });
});

// -------------------------------------------------------------------- artwork

describe('picture frames', () => {
  it('prefers the front cover over an earlier non-front image', () => {
    const backCover = [0x01, 0x01, 0x01];
    const frontCover = [0x02, 0x02, 0x02];
    const tag = bytes(
      frame('APIC', apicBody('image/jpeg', 0x04, 'back', backCover)),
      frame('APIC', apicBody('image/jpeg', FRONT_COVER, 'front', frontCover))
    );

    const { picture } = parseId3v2Frames(tag, 3);
    assert.ok(picture);
    assert.equal(picture.pictureType, FRONT_COVER);
    assert.deepEqual([...picture.data], frontCover);
  });

  it('keeps the front cover when a later image is not one', () => {
    const frontCover = [0x0a, 0x0b];
    const tag = bytes(
      frame('APIC', apicBody('image/jpeg', FRONT_COVER, 'front', frontCover)),
      frame('APIC', apicBody('image/png', 0x05, 'leaflet', [0x0c, 0x0d]))
    );

    const { picture } = parseId3v2Frames(tag, 3);
    assert.ok(picture);
    assert.deepEqual([...picture.data], frontCover);
  });

  it('falls back to any image when no front cover is tagged', () => {
    const tag = bytes(
      frame('APIC', apicBody('image/png', 0x06, 'media', [0x77, 0x88]))
    );

    const { picture } = parseId3v2Frames(tag, 3);
    assert.ok(picture);
    assert.equal(picture.mime, 'image/png');
    assert.deepEqual([...picture.data], [0x77, 0x88]);
  });

  it('skips a UTF-16 description without eating the image data', () => {
    const image = [0xff, 0xd8, 0xff, 0xe0];
    const body = [
      UTF16_BOM,
      ...latin1Bytes('image/jpeg'),
      0x00,
      FRONT_COVER,
      ...utf16leBytes('Portada'),
      0x00,
      0x00, // UTF-16 strings terminate on a NUL pair.
      ...image,
    ];
    const tag = bytes(frame('APIC', body));

    const { picture } = parseId3v2Frames(tag, 3);
    assert.ok(picture);
    assert.deepEqual([...picture.data], image);
  });

  it('returns no picture when the frame ends before the image', () => {
    // MIME and type present, but the description terminator is the last byte.
    const tag = bytes(
      frame('APIC', [LATIN1, ...latin1Bytes('image/jpeg'), 0x00, FRONT_COVER, 0x00])
    );
    assert.equal(parseId3v2Frames(tag, 3).picture, null);
  });
});

// ----------------------------------------------------------- header prefixes

describe('unsynchronisation', () => {
  it('drops the stuffed $00 after every $FF', () => {
    const input = bytes([0x01, 0xff, 0x00, 0x02, 0xff, 0x00, 0xff, 0x00, 0x03]);
    assert.deepEqual([...removeUnsynchronisation(input)], [
      0x01, 0xff, 0x02, 0xff, 0xff, 0x03,
    ]);
  });

  it('leaves $FF followed by a non-zero byte alone', () => {
    const input = bytes([0xff, 0xfb, 0x00, 0xff, 0xe0]);
    assert.deepEqual([...removeUnsynchronisation(input)], [
      0xff, 0xfb, 0x00, 0xff, 0xe0,
    ]);
  });

  it('is applied when the tag header sets flag $80', () => {
    // A title containing 0xFF, written unsynchronised as 0xFF 0x00.
    const body = bytes([
      ...latin1Bytes('TIT2'),
      ...uint32be(4),
      0x00,
      0x00,
      LATIN1,
      0x41, // 'A'
      0xff,
      0x00, // stuffed
      0x42, // 'B'
    ]);

    const frames = stripTagPrefixes(body, 3, 0x80);
    const tags = parseId3v2Frames(frames, 3);
    assert.equal(tags.title, 'AÿB');
  });

  it('is skipped when flag $80 is clear', () => {
    const body = bytes(textFrame('TIT2', LATIN1, latin1Bytes('Plain')));
    const frames = stripTagPrefixes(body, 3, 0x00);
    assert.deepEqual([...frames], [...body]);
  });
});

describe('extended header', () => {
  it('skips a v2.3 extended header, whose size excludes its own size field', () => {
    const extendedPayload = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    const body = bytes(
      uint32be(extendedPayload.length),
      extendedPayload,
      textFrame('TIT2', LATIN1, latin1Bytes('After extension'))
    );

    const frames = stripTagPrefixes(body, 3, 0x40);
    assert.equal(parseId3v2Frames(frames, 3).title, 'After extension');
  });

  it('skips a v2.4 extended header, whose synchsafe size includes itself', () => {
    const extendedTotal = 6;
    const body = bytes(
      syncsafe32(extendedTotal),
      [0x01, 0x20], // number of flag bytes + flags, filling out the 6 total
      textFrame('TIT2', LATIN1, latin1Bytes('After extension'), 4)
    );

    const frames = stripTagPrefixes(body, 4, 0x40);
    assert.equal(parseId3v2Frames(frames, 4).title, 'After extension');
  });

  it('leaves the body alone when the extended size is nonsense', () => {
    const body = bytes(uint32be(0xffffff), [0x00, 0x00]);
    const frames = stripTagPrefixes(body, 3, 0x40);
    assert.deepEqual([...frames], [...body]);
  });
});

// ---------------------------------------------------------------- robustness

describe('corrupt input', () => {
  it('returns nulls rather than throwing on a frame size past the buffer', () => {
    const tag = bytes(latin1Bytes('TIT2'), uint32be(9999), [0x00, 0x00, LATIN1, 0x41]);
    assert.deepEqual(parseId3v2Frames(tag, 3), {
      title: null,
      artist: null,
      album: null,
      picture: null,
    });
  });

  it('handles a zero frame size without looping forever', () => {
    const tag = bytes(latin1Bytes('TIT2'), uint32be(0), [0x00, 0x00]);
    assert.equal(parseId3v2Frames(tag, 3).title, null);
  });

  it('handles an empty and a truncated tag body', () => {
    assert.equal(parseId3v2Frames(bytes([]), 3).title, null);
    assert.equal(parseId3v2Frames(bytes([0x54, 0x49]), 3).title, null);
  });
});

// ---------------------------------------------------------------------- v1

describe('ID3v1', () => {
  function id3v1(title: string, artist: string, album: string): Uint8Array {
    const block = new Uint8Array(128);
    block.set(latin1Bytes('TAG'), 0);
    block.set(latin1Bytes(title.slice(0, 30)), 3);
    block.set(latin1Bytes(artist.slice(0, 30)), 33);
    block.set(latin1Bytes(album.slice(0, 30)), 63);
    return block;
  }

  it('reads the fixed-width fields', () => {
    const tags = parseId3v1(id3v1('Enter Sandman', 'Metallica', 'Metallica'));
    assert.equal(tags.title, 'Enter Sandman');
    assert.equal(tags.artist, 'Metallica');
    assert.equal(tags.album, 'Metallica');
    assert.equal(tags.picture, null);
  });

  it('does not bleed one field into the next at full width', () => {
    const tags = parseId3v1(id3v1('T'.repeat(30), 'A'.repeat(30), 'B'.repeat(30)));
    assert.equal(tags.title, 'T'.repeat(30));
    assert.equal(tags.artist, 'A'.repeat(30));
    assert.equal(tags.album, 'B'.repeat(30));
  });

  it('rejects a block without the TAG magic', () => {
    const block = new Uint8Array(128);
    block.set(latin1Bytes('XXX'), 0);
    assert.deepEqual(parseId3v1(block), {
      title: null,
      artist: null,
      album: null,
      picture: null,
    });
  });

  it('rejects a short block', () => {
    assert.equal(parseId3v1(bytes(latin1Bytes('TAG'))).title, null);
  });
});
