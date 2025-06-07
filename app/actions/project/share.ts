"use server";

import { currentUser } from "@/lib/auth";
import { database } from "@/lib/database";
import { parseError } from "@/lib/error/parse";
import { projects } from "@/schema";
import { and, eq, sql } from "drizzle-orm";

export const shareProjectAction = async (
  projectId: string,
  userEmailToAdd: string
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
      throw new Error("You need to be logged in to share a project!");
    }

    // Only project owner can add members
    const project = await database.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, user.id)),
    });

    if (!project) {
      throw new Error(
        "Project not found or you do not have permission to share it"
      );
    }

    // Check if user is already a member
    if (project.members && project.members.includes(userEmailToAdd)) {
      throw new Error("User is already a member of this project");
    }

    // Add user email to members array
    const updatedMembers = project.members
      ? [...project.members, userEmailToAdd]
      : [userEmailToAdd];

    await database
      .update(projects)
      .set({
        members: updatedMembers,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    return { success: true };
  } catch (error) {
    const message = parseError(error);

    return { error: message };
  }
};

export const removeProjectMemberAction = async (
  projectId: string,
  userEmailToRemove: string
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
      throw new Error("You need to be logged in to manage project members!");
    }

    // Only project owner can remove members
    const project = await database.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, user.id)),
    });

    if (!project) {
      throw new Error(
        "Project not found or you do not have permission to manage it"
      );
    }

    // Remove user email from members array
    const updatedMembers = project.members
      ? project.members.filter((email) => email !== userEmailToRemove)
      : [];

    await database
      .update(projects)
      .set({
        members: updatedMembers,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    return { success: true };
  } catch (error) {
    const message = parseError(error);

    return { error: message };
  }
};
