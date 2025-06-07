"use client";

import { shareProjectAction } from "@/app/actions/project/share";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { handleError } from "@/lib/error/handle";
import { ShareIcon } from "lucide-react";
import { type FormEventHandler, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type ProjectShareButtonProps = {
  projectId: string;
  isOwner: boolean;
};

export const ProjectShareButton = ({
  projectId,
  isOwner,
}: ProjectShareButtonProps) => {
  const [open, setOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [isSharing, setIsSharing] = useState(false);

  const handleShareProject: FormEventHandler<HTMLFormElement> = async (
    event
  ) => {
    event.preventDefault();

    if (isSharing || !userEmail.trim()) {
      return;
    }

    try {
      setIsSharing(true);

      // Share project with the provided email address
      const response = await shareProjectAction(projectId, userEmail.trim());

      if ("error" in response) {
        throw new Error(response.error);
      }

      toast.success("Project shared successfully!");
      setOpen(false);
      setUserEmail("");
    } catch (error) {
      handleError("Error sharing project", error);
    } finally {
      setIsSharing(false);
    }
  };

  // Only show share button if user is the project owner
  if (!isOwner) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="rounded-full">
          <ShareIcon size={16} />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Project</DialogTitle>
          <DialogDescription>
            Add collaborators to this project so they can view and edit in
            real-time.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleShareProject}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="userEmail">Email Address</Label>
              <Input
                id="userEmail"
                type="email"
                placeholder="Enter user's email address"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSharing || !userEmail.trim()}>
              {isSharing ? "Sharing..." : "Share Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
