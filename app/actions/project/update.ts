"use server";

import { currentUser } from "@/lib/auth";
import { database } from "@/lib/database";
import { parseError } from "@/lib/error/parse";
import { projects } from "@/schema";
import { and, eq, or, arrayContains } from "drizzle-orm";

export const updateProjectAction = async (
  projectId: string,
  data: Partial<typeof projects.$inferInsert>
): Promise<
  | {
      success: true;
    }
  | {
      error: string;
    }
> => {
  try {
    const user = await currentUser();

    if (!user) {
      throw new Error("You need to be logged in to update a project!");
    }

    const project = await database
      .update(projects)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projects.id, projectId),
          or(
            eq(projects.userId, user.id),
            user.email
              ? arrayContains(projects.members, [user.email])
              : undefined
          )
        )
      );

    if (!project) {
      throw new Error(
        "Project not found or you do not have permission to update it"
      );
    }

    return { success: true };
  } catch (error) {
    const message = parseError(error);

    return { error: message };
  }
};
