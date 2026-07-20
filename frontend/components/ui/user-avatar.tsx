'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getAvatarInitials, getAvatarColor } from '@/lib/avatar-utils';

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  className?: string;
}

export function UserAvatar({ src, name, className }: UserAvatarProps) {
  const initials = getAvatarInitials(name);
  const bgColor = getAvatarColor(name);

  return (
    <Avatar className={className}>
      {src ? (
        <AvatarImage src={src} alt={name || ''} />
      ) : null}
      <AvatarFallback
        style={{ backgroundColor: bgColor, color: '#fff' }}
        className="text-xs font-semibold"
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}