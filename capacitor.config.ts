import type { CapacitorConfig } from '@capacitor/cli'

// The Android app loads the live admin site, so the host split picks the admin app and deploys reach it without a reinstall.
const config: CapacitorConfig = {
  appId: 'com.techiemyil.admin',
  appName: 'Techie Myil Admin',
  webDir: 'dist',
  server: {
    url: 'https://admin.techiemyil.com',
    androidScheme: 'https',
    // Zerodha's login pages, and Kite's return hop via techiemyil.com, stay inside the app (not Chrome), so after you
    // log in you land straight back on the journal.
    allowNavigation: ['kite.zerodha.com', '*.zerodha.com', 'kite.trade', 'techiemyil.com'],
  },
  android: {
    backgroundColor: '#ffffff',
  },
  plugins: {
    // Show notifications (with sound) even while the app is open.
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
}

export default config
