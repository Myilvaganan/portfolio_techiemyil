import type { CapacitorConfig } from '@capacitor/cli'

// The Android app loads the live admin site, so the host split picks the admin app and deploys reach it without a reinstall.
const config: CapacitorConfig = {
  appId: 'com.techiemyil.admin',
  appName: 'Techie Myil Admin',
  webDir: 'dist',
  server: {
    url: 'https://admin.techiemyil.com',
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#ffffff',
  },
}

export default config
