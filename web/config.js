// Public browser configuration. The publishable key is safe to ship: row level security protects the data.
window.JM_CONFIG = {
  supabaseUrl: 'https://repxbwvcylwbscdklyli.supabase.co',
  supabaseKey: 'sb_publishable_RFFz9OeDnjuhIOXnnil2fA_XH-ecJ4I',
  // Shows one-click demo logins on the sign-in page. Set to false for a real launch.
  demoMode: true,
  // 'sandbox' records upgrades without charging. Switch to 'live' only after the checkout function is wired to a payment provider.
  paymentsMode: 'sandbox',
  // Shown in the footer and legal pages. Replace before launch.
  supportEmail: 'support@jobmatch.example',
  // Public VAPID key for web push (leave empty to hide the push toggle).
  vapidPublicKey: ''
};
