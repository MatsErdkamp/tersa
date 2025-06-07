import { currentUser, currentUserProfile } from "@/lib/auth";
import { env } from "@/lib/env";
// import { PostHogIdentifyProvider } from "@/providers/posthog-provider";
import {
  type SubscriptionContextType,
  SubscriptionProvider,
} from "@/providers/subscription";
import { ReactFlowProvider } from "@xyflow/react";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

type AuthenticatedLayoutProps = {
  children: ReactNode;
};

const AuthenticatedLayout = async ({ children }: AuthenticatedLayoutProps) => {
  const user = await currentUser();

  if (!user) {
    redirect("/auth/login");
  }

  const profile = await currentUserProfile();

  if (!profile) {
    return null;
  }

  let plan: SubscriptionContextType["plan"];

  // if (profile.productId === env.STRIPE_HOBBY_PRODUCT_ID) {
  //   plan = 'hobby';
  // } else if (profile.productId === env.STRIPE_PRO_PRODUCT_ID) {
  //   plan = 'pro';
  // }

  plan = "pro";

  return (
    <SubscriptionProvider
      isSubscribed={Boolean(profile.subscriptionId)}
      plan={plan}
    >
      {/* <PostHogIdentifyProvider> </PostHogIdentifyProvider> */}
      <ReactFlowProvider>{children}</ReactFlowProvider>
    </SubscriptionProvider>
  );
};

export default AuthenticatedLayout;
