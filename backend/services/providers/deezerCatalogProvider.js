import axios from "../../../lib/axiosFetch.js";
import createRateLimiter from "../apiClients/rateLimiter.js";
import { createDeezerCatalog } from "./catalogMerge.js";

const limiter = createRateLimiter(110);
export const deezerCatalog = createDeezerCatalog({
  request: (path, params = {}) => limiter.schedule(async () => {
    const response = await axios.get(`https://api.deezer.com${path}`, {
      params, timeout: 8000,
    });
    if (response.data?.error) throw new Error("Deezer catalogue is unavailable");
    return response.data;
  }),
});
