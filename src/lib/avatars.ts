export interface AvatarInfo {
  id: string;
  name: string;
  color: string;
  emoji: string;
  bgHex: string;
}

export const AVATARS: AvatarInfo[] = [
  { id: 'avatar-01', name: 'Sleepy Owl', color: '#A47BFF', emoji: '🦉', bgHex: '#383270' },
  { id: 'avatar-02', name: 'Grumpy Cat', color: '#FF5C6C', emoji: '😾', bgHex: '#4C283B' },
  { id: 'avatar-03', name: 'Chill Capybara', color: '#FF8A3D', emoji: '🦫', bgHex: '#4A3326' },
  { id: 'avatar-04', name: 'Hype Fox', color: '#FF8A3D', emoji: '🦊', bgHex: '#522E1B' },
  { id: 'avatar-05', name: 'Nerdy Penguin', color: '#4DB5FF', emoji: '🐧', bgHex: '#1B3C54' },
  { id: 'avatar-06', name: 'Zen Panda', color: '#3DDBB0', emoji: '🐼', bgHex: '#1E3D35' },
  { id: 'avatar-07', name: 'Sneaky Raccoon', color: '#B9B3DE', emoji: '🦝', bgHex: '#363352' },
  { id: 'avatar-08', name: 'Cool Dino', color: '#3DDBB0', emoji: '🦖', bgHex: '#214639' },
  { id: 'avatar-09', name: 'Bubbly Axolotl', color: '#FF5FA2', emoji: '🦎', bgHex: '#4E243E' },
  { id: 'avatar-10', name: 'Fancy Llama', color: '#FFD23F', emoji: '🦙', bgHex: '#4A3E1E' },
  { id: 'avatar-11', name: 'Chef Hedgehog', color: '#FF8A3D', emoji: '🦔', bgHex: '#4A2F20' },
  { id: 'avatar-12', name: 'Wizard Frog', color: '#3DDBB0', emoji: '🐸', bgHex: '#1B4434' },
  { id: 'avatar-13', name: 'Astronaut Bunny', color: '#4DB5FF', emoji: '🐰', bgHex: '#223B5A' },
  { id: 'avatar-14', name: 'Pirate Parrot', color: '#FF5C6C', emoji: '🦜', bgHex: '#4D2429' },
  { id: 'avatar-15', name: 'Ninja Otter', color: '#4DB5FF', emoji: '🦦', bgHex: '#23384D' },
  { id: 'avatar-16', name: 'DJ Koala', color: '#A47BFF', emoji: '🐨', bgHex: '#34294F' },
  { id: 'avatar-17', name: 'Detective Bear', color: '#FF8A3D', emoji: '🐻', bgHex: '#453023' },
  { id: 'avatar-18', name: 'Surfer Seal', color: '#4DB5FF', emoji: '🦭', bgHex: '#1A374F' },
  { id: 'avatar-19', name: 'Coffee Sloth', color: '#FFD23F', emoji: '🦥', bgHex: '#433B20' },
  { id: 'avatar-20', name: 'Party Chameleon', color: '#3DDBB0', emoji: '🦎', bgHex: '#22473D' },
];

export function getAvatarById(id: string): AvatarInfo {
  return AVATARS.find((a) => a.id === id) || AVATARS[0];
}

