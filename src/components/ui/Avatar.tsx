import React from 'react';
import { getAvatarById } from '@/lib/avatars';
import { clsx } from 'clsx';

interface AvatarProps {
  avatarId?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showCrown?: boolean;
  isDisconnected?: boolean;
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  avatarId = 'avatar-01',
  name = 'Player',
  size = 'md',
  showCrown = false,
  isDisconnected = false,
  className,
}) => {
  const avatar = getAvatarById(avatarId);
  const initials = (name || 'P').trim().slice(0, 2).toUpperCase();

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-12 h-12 text-base',
    lg: 'w-16 h-16 text-xl',
    xl: 'w-24 h-24 text-3xl',
  }[size];

  const emojiSizes = {
    sm: 'text-sm',
    md: 'text-2xl',
    lg: 'text-3xl',
    xl: 'text-5xl',
  }[size];

  return (
    <div className={clsx('relative inline-flex items-center justify-center select-none', className)}>
      <div
        className={clsx(
          sizeClasses,
          'rounded-full flex items-center justify-center font-heading font-bold border-2 border-line shadow-md transition-transform overflow-hidden',
          isDisconnected && 'opacity-40 grayscale'
        )}
        style={{ backgroundColor: avatar.bgHex }}
        title={`${name} (${initials})`}
      >
        {avatar.emoji ? (
          <span className={clsx(emojiSizes, 'filter drop-shadow')}>
            {avatar.emoji}
          </span>
        ) : (
          <span className="text-text font-bold tracking-wider">
            {initials}
          </span>
        )}
      </div>

      {showCrown && (
        <span
          className="absolute -top-2.5 -right-1 text-base filter drop-shadow animate-bounce"
          title="Host"
          role="img"
          aria-label="Room Host"
        >
          👑
        </span>
      )}

      {isDisconnected && (
        <span
          className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-danger rounded-full border-2 border-surface"
          title="Disconnected"
        />
      )}
    </div>
  );
};
