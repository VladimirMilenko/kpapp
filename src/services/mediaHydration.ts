import type { KinoApi } from "../kinoApi";
import {
  hasPlayableSources,
  mediaArray,
  mediaIdOf,
  sourceUrl
} from "../media";
import type { KinoFile, KinoMedia, KinoRuntimeConfig } from "../types";

export async function hydrateMedia(api: KinoApi, config: KinoRuntimeConfig, media: KinoMedia) {
  if (hasPlayableSources(media)) {
    return media;
  }

  const id = mediaIdOf(media);
  const links = id ? await api.mediaLinks(id) : {};
  const merged: KinoMedia = { ...media, ...links };

  if (!("audios" in links) && media.audios !== undefined) {
    merged.audios = media.audios;
  }

  if (!("subtitles" in links) && media.subtitles !== undefined) {
    merged.subtitles = media.subtitles;
  }

  if (!("files" in links) && media.files !== undefined) {
    merged.files = media.files;
  }

  if (!hasPlayableSources(merged)) {
    await resolveFileLinks(api, config, merged);
  }

  return merged;
}

async function resolveFileLinks(api: KinoApi, config: KinoRuntimeConfig, media: KinoMedia) {
  const files = mediaArray(media.files) as KinoFile[];
  const streamType = config.preferredStream || "hls4";

  await Promise.all(
    files.map(async (file) => {
      if (sourceUrl(file, [streamType])) {
        return;
      }

      if (!file.file) {
        return;
      }

      file.url = {
        ...(typeof file.url === "object" && file.url ? file.url : {}),
        [streamType]: await api.mediaVideoLink(file.file, streamType)
      };
    })
  );
}
