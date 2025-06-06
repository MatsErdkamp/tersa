import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  const supabase = await createClient();

  // Handle PKCE flow (with code parameter)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // redirect the user to an error page with some instructions
      redirect(`/auth/error?error=${error?.message}`);
    } else {
      // redirect user to specified redirect URL or root of app
      redirect(next);
    }
  }

  // Handle legacy OTP flow (with token_hash and type parameters)
  else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (error) {
      // redirect the user to an error page with some instructions
      redirect(`/auth/error?error=${error?.message}`);
    } else {
      // redirect user to specified redirect URL or root of app
      redirect(next);
    }
  }

  // redirect the user to an error page with some instructions
  redirect("/auth/error?error=No token hash or type");
}
