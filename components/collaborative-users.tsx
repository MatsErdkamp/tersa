"use client";

import { useCollaborativeUsers } from "./canvas";
import { AvatarStack } from "./ui/kibo-ui/avatar-stack";
import { Avatar, AvatarFallback } from "./ui/avatar";

export const CollaborativeUsers = () => {
  const users = useCollaborativeUsers();

  return (
    <div className="flex items-center rounded-full border bg-card/90 p-1 drop-shadow-xs backdrop-blur-sm">
      <AvatarStack animate={true} size={32}>
        {users.map((user) => (
          <Avatar
            key={user.id}
            className="border-2"
            style={{ borderColor: user.color }}
          >
            <AvatarFallback
              style={{ backgroundColor: user.color + "20", color: user.color }}
              className="text-xs font-semibold"
            >
              {user.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ))}
      </AvatarStack>
    </div>
  );
};
