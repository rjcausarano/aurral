import axios from '../../../lib/axiosFetch.js';
import { musicbrainzRateLimiter as limiter } from '../apiClients/musicbrainzRateLimiter.js';
import { APP_NAME, APP_VERSION, MUSICBRAINZ_API } from '../../config/constants.js';
import { createMusicBrainzCatalog } from './musicbrainzCatalog.js';

export const musicbrainzCatalog = createMusicBrainzCatalog({
  request: (path, params, { signal } = {}) => limiter.schedule(async () => {
    const response = await axios.get(`${MUSICBRAINZ_API}${path}`, {
      params, signal, timeout: 8000,
      headers: { 'User-Agent': `${APP_NAME}/${APP_VERSION} (https://github.com/lklynet/aurral)` },
    });
    return response.data;
  }, { signal, timeoutMs: 30000 }),
});
