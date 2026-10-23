export type CaptionMediaType = 'POST' | 'REELS' | 'STORY';

const FEED_AND_REELS_CTA =
  '📲 Baixe o StudyQuest na Google Play Store! Link direto na nossa bio do perfil. Gamifique seus estudos hoje mesmo! ⚔️✨';

const STORY_CTA =
  '📲 Baixe o StudyQuest na Google Play Store! Link na nossa bio do perfil. Gamifique seus estudos hoje mesmo! ⚔️✨';

export function normalizePlayStoreUrl(
  playStoreUrl?: string | null,
): string | undefined {
  const trimmed = playStoreUrl?.trim();

  return trimmed || undefined;
}

export function buildPlayStoreCta(
  mediaType: CaptionMediaType,
  playStoreUrl?: string | null,
): string {
  const url = normalizePlayStoreUrl(playStoreUrl);

  if (mediaType === 'STORY') {
    return url
      ? `📲 Baixe o StudyQuest na Google Play Store: ${url}\nGamifique seus estudos hoje mesmo! ⚔️✨`
      : STORY_CTA;
  }

  return url
    ? `📲 Baixe o StudyQuest na Google Play Store: ${url}\nLink direto também na nossa bio do perfil. Gamifique seus estudos hoje mesmo! ⚔️✨`
    : FEED_AND_REELS_CTA;
}

export function containsPlayStoreCta(caption: string): boolean {
  const normalized = caption.toLowerCase();

  return (
    normalized.includes('google play') ||
    normalized.includes('play store') ||
    normalized.includes('play.google.com')
  );
}

export function ensurePlayStoreCta(
  caption: string | null | undefined,
  mediaType: CaptionMediaType,
  playStoreUrl?: string | null,
): string {
  const trimmedCaption = caption?.trim() ?? '';

  if (!trimmedCaption) {
    return buildPlayStoreCta(mediaType, playStoreUrl);
  }

  if (containsPlayStoreCta(trimmedCaption)) {
    return trimmedCaption;
  }

  return `${trimmedCaption}\n\n${buildPlayStoreCta(mediaType, playStoreUrl)}`;
}
