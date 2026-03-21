(function () {
const SUPABASE_URL = "https://aktcydtkkmoekwgnxwey.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrdGN5ZHRra21vZWt3Z254d2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNTU5NDcsImV4cCI6MjA4OTYzMTk0N30.piJrAM5SYc8wrG7avvLr078_h2Ml75EVttyAgxQ48KM";
const ADMIN_EMAIL = "cristianwalter30acd@gmail.com";

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
