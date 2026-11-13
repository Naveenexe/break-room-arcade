/**
 * Asset manifest for cut-paper illustrations and game covers (SRS v2 Section 6)
 */

export interface ArtAsset {
  filename: string;
  path: string;
  alt: string;
  width?: number;
  height?: number;
}

export const ART_MANIFEST: Record<string, ArtAsset> = {
  // Game Covers (960x600)
  'cover-quiz': {
    filename: 'cover-quiz.webp',
    path: '/art/cover-quiz.webp',
    alt: 'Cut-paper buzzer button, question mark bubble, and golden trophy on lilac background',
    width: 960,
    height: 600,
  },
  'cover-typing': {
    filename: 'cover-typing.webp',
    path: '/art/cover-typing.webp',
    alt: 'Cut-paper keyboard keys racing along a curving track with a finish flag',
    width: 960,
    height: 600,
  },
  'cover-reaction': {
    filename: 'cover-reaction.webp',
    path: '/art/cover-reaction.webp',
    alt: 'Cut-paper glowing round button with a lightning bolt and pointing hand',
    width: 960,
    height: 600,
  },
  'cover-pictionary': {
    filename: 'cover-pictionary.webp',
    path: '/art/cover-pictionary.webp',
    alt: 'Cut-paper giant pencil drawing a rocket on a sheet of paper with tangerine glow',
    width: 960,
    height: 600,
  },
  'cover-charades': {
    filename: 'cover-charades.webp',
    path: '/art/cover-charades.webp',
    alt: 'Cut-paper theatrical masks and speech bubbles on a marigold background',
    width: 960,
    height: 600,
  },
  'cover-wordchain': {
    filename: 'cover-wordchain.webp',
    path: '/art/cover-wordchain.webp',
    alt: 'Cut-paper chunky letter blocks linked by a chain on lime green background',
    width: 960,
    height: 600,
  },

  // Illustrations
  'hero-skyline': {
    filename: 'hero-skyline.webp',
    path: '/art/hero-skyline.webp',
    alt: 'Golden hour rooftop with friends silhouettes against a layered cut-paper city skyline',
    width: 1920,
    height: 700,
  },
  'art-empty-lobby': {
    filename: 'art-empty-lobby.webp',
    path: '/art/art-empty-lobby.webp',
    alt: 'Paper chair with a waiting speech bubble inviting players to join',
    width: 800,
    height: 600,
  },
  'art-waiting': {
    filename: 'art-waiting.webp',
    path: '/art/art-waiting.webp',
    alt: 'Paper hourglass with sparkles indicating active countdown',
    width: 800,
    height: 600,
  },
  'art-celebrate': {
    filename: 'art-celebrate.webp',
    path: '/art/art-celebrate.webp',
    alt: 'Golden paper trophy surrounded by confetti and streamers',
    width: 800,
    height: 600,
  },
  'art-offline': {
    filename: 'art-offline.webp',
    path: '/art/art-offline.webp',
    alt: 'Unplugged paper power plug beside a sad cloud',
    width: 800,
    height: 600,
  },
  'art-404': {
    filename: 'art-404.webp',
    path: '/art/art-404.webp',
    alt: 'Paper compass spinning in circles indicating page not found',
    width: 800,
    height: 600,
  },
  'art-sound-off': {
    filename: 'art-sound-off.webp',
    path: '/art/art-sound-off.webp',
    alt: 'Cut-paper speaker with a slash indicating muted audio',
    width: 400,
    height: 400,
  },

  // Logos
  'logo-mark': {
    filename: 'logo-mark.svg',
    path: '/art/logo-mark.svg',
    alt: 'Break Room Arcade logo mark: a steaming chai glass curling into a game controller',
  },
  'logo-wordmark': {
    filename: 'logo-wordmark.svg',
    path: '/art/logo-wordmark.svg',
    alt: 'Break Room Arcade wordmark in Bricolage Grotesque',
  },
};
