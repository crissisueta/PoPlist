(function () {
  const SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
  const SUPABASE_ANON_KEY = "SUA_SUPABASE_ANON_KEY";
  const ADMIN_EMAIL = "seu-email-admin@exemplo.com";

  const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  window.supabaseApp = {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    ADMIN_EMAIL,
    supabase: supabaseClient,
  };
})();
