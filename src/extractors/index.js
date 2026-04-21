import { guardianExtractor } from './guardian.js';
import { nmeExtractor } from './nme.js';
import { diymagExtractor } from './diymag.js';
import { kerrangExtractor } from './kerrang.js';
import { bbcExtractor } from './bbc.js';
import { deadlineExtractor } from './deadline.js';
import { genericExtractor } from './generic.js';

// Maps extractor_key from scraper_outlets table → extractor function
const EXTRACTORS = {
  guardian:    guardianExtractor,
  nme:         nmeExtractor,
  diymag:      diymagExtractor,
  kerrang:     kerrangExtractor,
  bbc:         bbcExtractor,
  deadline:    deadlineExtractor,

  // Outlets without a custom extractor fall back to generic
  times:       genericExtractor,
  telegraph:   genericExtractor,
  independent: genericExtractor,
  skynews:     genericExtractor,
  mailonline:  genericExtractor,
  standard:    genericExtractor,
  mixmag:      genericExtractor,
  clash:       genericExtractor,
  vogue:       genericExtractor,
  elle:        genericExtractor,
  grazia:      genericExtractor,
  glamour:     genericExtractor,
  timeout:     genericExtractor,
  olive:       genericExtractor,
  screendaily: genericExtractor,
};

export function getExtractor(key) {
  return EXTRACTORS[key] || null;
}
