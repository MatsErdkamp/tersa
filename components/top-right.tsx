import { currentUserProfile } from "@/lib/auth";
import { database } from "@/lib/database";
import { projects } from "@/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { CreditCounter } from "./credits-counter";
import { Menu } from "./menu";
import { ProjectShareButton } from "./project-share-button";
import { Button } from "./ui/button";
import { AvatarStack } from "./ui/kibo-ui/avatar-stack";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { CollaborativeUsers } from "./collaborative-users";

type TopRightProps = {
  id: string;
};

export const TopRight = async ({ id }: TopRightProps) => {
  const profile = await currentUserProfile();
  const project = await database.query.projects.findFirst({
    where: eq(projects.id, id),
  });

  if (!profile || !project) {
    return null;
  }

  const isOwner = project.userId === profile.id;

  return (
    <div className="absolute top-16 right-0 left-0 z-[50] m-4 flex items-center gap-2 sm:top-0 sm:left-auto">
      {/* {profile.subscriptionId ? (
        <div className="flex items-center rounded-full border bg-card/90 p-3 drop-shadow-xs backdrop-blur-sm">
          <Suspense
            fallback={
              <p className="text-muted-foreground text-sm">Loading...</p>
            }
          >
            <CreditCounter />
          </Suspense>
        </div>
      ) : (
        <div className="flex items-center rounded-full border bg-card/90 p-0.5 drop-shadow-xs backdrop-blur-sm">
          <Button className="rounded-full" size="lg" asChild>
            <Link href="/pricing">Claim your free AI credits</Link>
          </Button>
        </div>
      )} */}
      <CollaborativeUsers />
      <div className="flex items-center rounded-full border bg-card/90 p-1 drop-shadow-xs backdrop-blur-sm">
        <ProjectShareButton projectId={project.id} isOwner={isOwner} />
        <Menu />
      </div>
    </div>
  );
};
